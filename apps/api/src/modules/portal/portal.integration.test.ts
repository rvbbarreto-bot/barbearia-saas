/**
 * Integração: portal tokenizado reutiliza confirm/cancel oficiais (eventos, auditoria, jobs).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';
import { hashPortalToken } from './token.js';

vi.mock('../commission/service.js', () => ({
  createCommissionEntryForCompletedAppointment: vi.fn(async () => undefined),
}));

const run =
  Boolean(process.env.DATABASE_URL) && Boolean(process.env.JWT_SECRET) && Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('portal integration', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  const tenantId = randomUUID();
  const attendantUserId = randomUUID();
  const caller = { sub: attendantUserId, role: 'attendant' as const };

  let customerId = '';
  let professionalId = '';
  let serviceId = '';

  async function queryTenant<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: unknown[],
  ) {
    return withTenant(tenantId, async (c) => c.query<T>(sql, params));
  }

  async function purge() {
    await withTenant(tenantId, async (c) => {
      await c.query(`DELETE FROM appointment_portal_tokens WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM notification_jobs WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM operational_audit_events WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM audit_logs WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM appointment_status_history WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM appointment_events WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM appointments WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM professional_services WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM business_hours WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM customers WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM services WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM professionals WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantId]);
    });
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
  }

  /** Horário distinto por teste — evita GiST overlap após confirmar slot anterior. */
  async function seedAppointmentAwaitingConfirmation(hourUtc: number) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const { createAppointment } = await import('../appointments/service.js');
    return createAppointment(
      tenantId,
      {
        customer_id: customerId,
        professional_id: professionalId,
        service_id: serviceId,
        starts_at: `2026-05-13T${pad(hourUtc)}:00:00.000Z`,
        ends_at: `2026-05-13T${pad(hourUtc)}:30:00.000Z`,
        source: 'manual',
        idempotency_key: `idem-portal-${randomUUID()}`,
        explicit_confirmation: true,
      },
      caller,
    );
  }

  async function issueToken(appointmentId: string, expiresAt?: string) {
    const { createAppointmentPortalToken } = await import('./service.js');
    const { token, expires_at } = await createAppointmentPortalToken(
      tenantId,
      appointmentId,
      attendantUserId,
    );
    if (expiresAt) {
      await queryTenant(
        `UPDATE appointment_portal_tokens SET expires_at = $3::timestamptz
          WHERE tenant_id = $1 AND token_hash = $2`,
        [tenantId, hashPortalToken(token), expiresAt],
      );
    }
    return { token, expires_at };
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-13T12:00:00.000Z'));
    await purge();
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1,'Portal','Portal','trial','active')`,
      [tenantId],
    );
    await withTenant(tenantId, async (c) => {
      await c.query(
        `INSERT INTO users (id, tenant_id, name, email, password_hash, role)
         VALUES ($1,$2,'Att',$3,'x','attendant'::user_role)`,
        [attendantUserId, tenantId, `${attendantUserId}@t.test`],
      );
    });

    professionalId = randomUUID();
    customerId = randomUUID();
    serviceId = randomUUID();
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantId, async () => {
        await c.query(
          `INSERT INTO professionals (id, tenant_id, name, slug, timezone, active)
           VALUES ($1,$2,'Prof',$3,'America/Sao_Paulo',true)`,
          [professionalId, tenantId, `pr-${professionalId.slice(0, 6)}`],
        );
        await c.query(
          `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in)
           VALUES ($1,$2,'Cliente',$3,true)`,
          [customerId, tenantId, `5511${customerId.slice(0, 8)}`],
        );
        await c.query(
          `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active)
           VALUES ($1,$2,'Corte',30,5000,true)`,
          [serviceId, tenantId],
        );
        await c.query(
          `INSERT INTO professional_services (tenant_id, professional_id, service_id)
           VALUES ($1,$2,$3)`,
          [tenantId, professionalId, serviceId],
        );
        await c.query(
          `INSERT INTO business_hours (tenant_id, professional_id, weekday, starts_at, ends_at, active)
           SELECT $1, $2, d, '08:00', '20:00', true FROM generate_series(0, 6) AS d`,
          [tenantId, professionalId],
        );
      });
    } finally {
      c.release();
    }
  });

  afterAll(async () => {
    vi.useRealTimers();
    await purge();
    await pool.end();
  });

  it('token válido confirma com eventos, auditoria, status history e notification job', async () => {
    const appt = await seedAppointmentAwaitingConfirmation(14);
    const { token } = await issueToken(appt.id as string);
    const { confirmPortalAppointmentByToken } = await import('./service.js');
    const view = await confirmPortalAppointmentByToken(token);
    expect(view.status).toBe('confirmed');
    expect(view.can_confirm).toBe(false);

    const events = await queryTenant(
      `SELECT event_type FROM appointment_events WHERE tenant_id = $1 AND appointment_id = $2 ORDER BY created_at`,
      [tenantId, appt.id],
    );
    expect(events.rows.map((r) => r.event_type)).toContain('CONFIRMED');

    const audit = await queryTenant(
      `SELECT action FROM audit_logs WHERE tenant_id = $1 AND entity = 'appointment' AND entity_id = $2`,
      [tenantId, appt.id],
    );
    const actions = audit.rows.map((r) => r.action);
    expect(actions).toContain('APPOINTMENT_CONFIRMED');
    expect(actions).toContain('PORTAL_APPOINTMENT_CONFIRMED');

    const history = await queryTenant(
      `SELECT new_status::text AS ns FROM appointment_status_history
        WHERE tenant_id = $1 AND appointment_id = $2 ORDER BY changed_at`,
      [tenantId, appt.id],
    );
    expect(history.rows.some((r) => r.ns === 'confirmed')).toBe(true);

    const jobs = await queryTenant(
      `SELECT job_type FROM notification_jobs
        WHERE tenant_id = $1 AND appointment_id = $2 AND status = 'pending'`,
      [tenantId, appt.id],
    );
    expect(jobs.rows.some((r) => r.job_type === 'appointment_confirmed')).toBe(true);
  });

  it('token válido cancela com eventos e auditoria', async () => {
    const appt = await seedAppointmentAwaitingConfirmation(15);
    const { token } = await issueToken(appt.id as string);
    const { cancelPortalAppointmentByToken } = await import('./service.js');
    const view = await cancelPortalAppointmentByToken(token);
    expect(view.status).toBe('cancelled');

    const events = await queryTenant(
      `SELECT event_type FROM appointment_events WHERE tenant_id = $1 AND appointment_id = $2`,
      [tenantId, appt.id],
    );
    expect(events.rows.map((r) => r.event_type)).toContain('CANCELLED');

    const audit = await queryTenant(
      `SELECT action FROM audit_logs WHERE tenant_id = $1 AND entity = 'appointment' AND entity_id = $2`,
      [tenantId, appt.id],
    );
    const actions = audit.rows.map((r) => r.action);
    expect(actions).toContain('APPOINTMENT_CANCELLED');
    expect(actions).toContain('PORTAL_APPOINTMENT_CANCELLED');
  });

  it('rejeita token expirado', async () => {
    const appt = await seedAppointmentAwaitingConfirmation(16);
    const { token } = await issueToken(appt.id as string, '2026-05-12T00:00:00.000Z');
    const { confirmPortalAppointmentByToken } = await import('./service.js');
    await expect(confirmPortalAppointmentByToken(token)).rejects.toMatchObject({
      code: 'PORTAL_TOKEN_EXPIRED',
    });
  });

  it('rejeita token revogado', async () => {
    const appt = await seedAppointmentAwaitingConfirmation(17);
    const { token } = await issueToken(appt.id as string);
    await queryTenant(
      `UPDATE appointment_portal_tokens SET revoked_at = now()
        WHERE tenant_id = $1 AND token_hash = $2`,
      [tenantId, hashPortalToken(token)],
    );
    const { confirmPortalAppointmentByToken } = await import('./service.js');
    await expect(confirmPortalAppointmentByToken(token)).rejects.toMatchObject({
      code: 'PORTAL_TOKEN_REVOKED',
    });
  });

  it('rejeita token inválido', async () => {
    const { confirmPortalAppointmentByToken } = await import('./service.js');
    await expect(confirmPortalAppointmentByToken('token-invalido-nao-existe-xyz')).rejects.toMatchObject({
      code: 'PORTAL_TOKEN_INVALID',
    });
  });
});
