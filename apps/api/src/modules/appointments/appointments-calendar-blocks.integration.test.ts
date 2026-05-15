/**
 * P2.1 — Bloqueio manual (`calendar_blocks`) impede criação/remarcação de appointment (footprint + buffers).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../commission/service.js', () => ({
  createCommissionEntryForCompletedAppointment: vi.fn(async () => undefined),
}));

import pg from 'pg';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';
import { createAppointment, rescheduleAppointment } from './service.js';

const run =
  Boolean(process.env.DATABASE_URL) && Boolean(process.env.JWT_SECRET) && Boolean(process.env.REDIS_URL);

const attendantUserId = randomUUID();
const attendantCaller = { sub: attendantUserId, role: 'attendant' as const, requestId: 'req-test' };

describe.skipIf(!run)('P2.1 appointments vs calendar_blocks', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 5,
  });

  const tenantId = randomUUID();
  const customerId = randomUUID();
  const profId = randomUUID();
  const serviceId = randomUUID();
  let seededAppointmentId: string;

  async function purge() {
    await pool.query(`DELETE FROM operational_audit_events WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM appointment_events WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM appointments WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM calendar_blocks WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM professional_services WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM business_hours WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM customers WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM services WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM professionals WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-06T12:00:00.000Z'));
    await purge();
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1,'L','T','trial','active')`,
      [tenantId],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, 'Att', $3, 'x', 'attendant'::user_role)`,
      [attendantUserId, tenantId, `${attendantUserId}@p21.test`],
    );
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantId, async () => {
        await c.query(
          `INSERT INTO professionals (id, tenant_id, name, slug, timezone, active)
           VALUES ($1,$2,'P1',$3,'America/Sao_Paulo',true)`,
          [profId, tenantId, `sl-${profId.slice(0, 6)}`],
        );
        await c.query(
          `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in, is_vip)
           VALUES ($1,$2,'C1',$3,true,false)`,
          [customerId, tenantId, `5511${customerId.slice(0, 8)}111`],
        );
        await c.query(
          `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active)
           VALUES ($1,$2,'S30',30,5000,true)`,
          [serviceId, tenantId],
        );
        await c.query(
          `INSERT INTO professional_services (tenant_id, professional_id, service_id)
           VALUES ($1,$2,$3)`,
          [tenantId, profId, serviceId],
        );
        await c.query(
          `INSERT INTO business_hours (id, tenant_id, professional_id, weekday, starts_at, ends_at, slot_interval_minutes, active)
           VALUES (gen_random_uuid(),$1,$2,3,'09:00:00','18:00:00',30,true)`,
          [tenantId, profId],
        );
        await c.query(
          `INSERT INTO calendar_blocks (tenant_id, professional_id, starts_at, ends_at, kind, reason)
           VALUES ($1,$2,'2026-05-06T14:00:00.000Z','2026-05-06T15:00:00.000Z','manual','Almoço')`,
          [tenantId, profId],
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

  it('rejeita criação quando footprint intersecta calendar_block', async () => {
    await expect(
      createAppointment(
        tenantId,
        {
          customer_id: customerId,
          professional_id: profId,
          service_id: serviceId,
          starts_at: '2026-05-06T14:15:00.000Z',
          ends_at: '2026-05-06T14:45:00.000Z',
          source: 'api',
          idempotency_key: `idem-cal-${randomUUID().slice(0, 8)}`,
          explicit_confirmation: true,
        },
        attendantCaller,
      ),
    ).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
  });

  it('cria fora do bloqueio e regista operational_audit_events', async () => {
    const row = await createAppointment(
      tenantId,
      {
        customer_id: customerId,
        professional_id: profId,
        service_id: serviceId,
        starts_at: '2026-05-06T16:00:00.000Z',
        ends_at: '2026-05-06T16:30:00.000Z',
        source: 'api',
        idempotency_key: `idem-ok-${randomUUID().slice(0, 8)}`,
        explicit_confirmation: true,
      },
      attendantCaller,
    );
    seededAppointmentId = String((row as { id: string }).id);
    expect(String((row as { status?: string }).status)).toBe('awaiting_confirmation');

    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantId, async () => {
        const ev = await c.query(
          `SELECT event_type FROM operational_audit_events
            WHERE tenant_id = $1 AND entity_id = $2::uuid
            ORDER BY created_at ASC`,
          [tenantId, seededAppointmentId],
        );
        const types = ev.rows.map((r) => r.event_type);
        expect(types).toContain('appointment_created');
      });
    } finally {
      c.release();
    }
  });

  it('rejeita remarcação para intervalo coberto por calendar_block', async () => {
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantId, async () => {
        await c.query(
          `INSERT INTO calendar_blocks (tenant_id, professional_id, starts_at, ends_at, kind, reason)
           VALUES ($1,$2,'2026-05-13T11:00:00.000Z','2026-05-13T12:30:00.000Z','manual','Treino')`,
          [tenantId, profId],
        );
      });
    } finally {
      c.release();
    }

    await expect(
      rescheduleAppointment(
        tenantId,
        seededAppointmentId,
        {
          starts_at: '2026-05-13T11:15:00.000Z',
          ends_at: '2026-05-13T11:45:00.000Z',
          reason: 'Cliente pediu mudança',
        },
        attendantCaller,
      ),
    ).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
  });
});
