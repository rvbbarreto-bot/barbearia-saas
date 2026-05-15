/**
 * Integração: criar agendamento, conflito, idempotência, serviço errado, isolamento tenant.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../commission/service.js', () => ({
  createCommissionEntryForCompletedAppointment: vi.fn(async () => undefined),
}));
import pg from 'pg';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';
import { createAppointment } from './service.js';

const run =
  Boolean(process.env.DATABASE_URL) && Boolean(process.env.JWT_SECRET) && Boolean(process.env.REDIS_URL);

/** FK `appointment_events.actor_user_id` → `users.id`; must exist before createAppointment writes events. */
const attendantUserId = randomUUID();
const attendantCaller = { sub: attendantUserId, role: 'attendant' as const };

describe.skipIf(!run)('appointments integration (create, conflict, idempotency, tenant)', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 5,
  });

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const customerA = randomUUID();
  const customerB = randomUUID();
  const profA = randomUUID();
  const profB = randomUUID();
  const serviceA = randomUUID();
  const serviceB = randomUUID();
  const orphanProf = randomUUID();

  async function purge() {
    await pool.query(`DELETE FROM appointment_events WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM appointments WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM professional_services WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM business_hours WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM customers WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM services WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM professionals WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM users WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-06T12:00:00.000Z'));
    await purge();
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1,'LA','TA','trial','active'), ($2,'LB','TB','trial','active')`,
      [tenantA, tenantB],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, 'Integration attendant', $3, 'test-hash', 'attendant'::user_role)`,
      [attendantUserId, tenantA, `${attendantUserId}@integration.test`],
    );
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantA, async () => {
        await c.query(
          `INSERT INTO professionals (id, tenant_id, name, slug, timezone, active)
           VALUES ($1,$2,'P1',$3,'America/Sao_Paulo',true), ($4,$5,'Orf',$6,'America/Sao_Paulo',true)`,
          [profA, tenantA, `sl-${profA.slice(0, 6)}`, orphanProf, tenantA, `sl-${orphanProf.slice(0, 6)}`],
        );
        await c.query(
          `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in, is_vip)
           VALUES ($1,$2,'CA',$3,true,false)`,
          [customerA, tenantA, `5511${customerA.slice(0, 8)}111`],
        );
        await c.query(
          `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active)
           VALUES ($1,$2,'S30',30,5000,true)`,
          [serviceA, tenantA],
        );
        await c.query(
          `INSERT INTO professional_services (tenant_id, professional_id, service_id)
           VALUES ($1,$2,$3)`,
          [tenantA, profA, serviceA],
        );
        await c.query(
          `INSERT INTO business_hours (id, tenant_id, professional_id, weekday, starts_at, ends_at, slot_interval_minutes, active)
           VALUES (gen_random_uuid(),$1,$2,3,'09:00:00','18:00:00',30,true)`,
          [tenantA, profA],
        );
      });
      await withAppTenant(c, tenantB, async () => {
        await c.query(
          `INSERT INTO professionals (id, tenant_id, name, slug, timezone, active)
           VALUES ($1,$2,'PB',$3,'America/Sao_Paulo',true)`,
          [profB, tenantB, `sl-${profB.slice(0, 6)}`],
        );
        await c.query(
          `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in, is_vip)
           VALUES ($1,$2,'CB',$3,true,false)`,
          [customerB, tenantB, `5511${customerB.slice(0, 8)}222`],
        );
        await c.query(
          `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active)
           VALUES ($1,$2,'SB',30,5000,true)`,
          [serviceB, tenantB],
        );
        await c.query(
          `INSERT INTO professional_services (tenant_id, professional_id, service_id)
           VALUES ($1,$2,$3)`,
          [tenantB, profB, serviceB],
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

  it('cria agendamento awaiting_confirmation com confirmação explícita', async () => {
    const row = await createAppointment(
      tenantA,
      {
        customer_id: customerA,
        professional_id: profA,
        service_id: serviceA,
        starts_at: '2026-05-06T15:00:00.000Z',
        ends_at: '2026-05-06T15:30:00.000Z',
        source: 'api',
        idempotency_key: `idem-ap1-${randomUUID().slice(0, 8)}`,
        explicit_confirmation: true,
      },
      attendantCaller,
    );
    expect(String((row as { status?: string }).status)).toBe('awaiting_confirmation');
  });

  it('rejeita conflito com agendamento confirmed existente', async () => {
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantA, async () => {
        await c.query(
          `INSERT INTO appointments (
             id, tenant_id, customer_id, professional_id, service_id,
             starts_at, ends_at, status, source, idempotency_key
           ) VALUES ($1,$2,$3,$4,$5,
             '2026-05-06T16:00:00.000Z','2026-05-06T16:30:00.000Z',
             'confirmed','api',$6)`,
          [randomUUID(), tenantA, customerA, profA, serviceA, `idem-seed-${randomUUID()}`],
        );
      });
    } finally {
      c.release();
    }
    await expect(
      createAppointment(
        tenantA,
        {
          customer_id: customerA,
          professional_id: profA,
          service_id: serviceA,
          starts_at: '2026-05-06T16:15:00.000Z',
          ends_at: '2026-05-06T16:45:00.000Z',
          source: 'api',
          idempotency_key: `idem-ap2-${randomUUID().slice(0, 8)}`,
          explicit_confirmation: true,
        },
        attendantCaller,
      ),
    ).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
  });

  it('rejeita idempotency_key duplicada', async () => {
    const key = `idem-dup-${randomUUID().slice(0, 8)}`;
    await createAppointment(
      tenantA,
      {
        customer_id: customerA,
        professional_id: profA,
        service_id: serviceA,
        starts_at: '2026-05-06T10:00:00.000Z',
        ends_at: '2026-05-06T10:30:00.000Z',
        source: 'api',
        idempotency_key: key,
        explicit_confirmation: true,
      },
      attendantCaller,
    );
    await expect(
      createAppointment(
        tenantA,
        {
          customer_id: customerA,
          professional_id: profA,
          service_id: serviceA,
          starts_at: '2026-05-06T11:00:00.000Z',
          ends_at: '2026-05-06T11:30:00.000Z',
          source: 'api',
          idempotency_key: key,
          explicit_confirmation: true,
        },
        attendantCaller,
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_IDEMPOTENCY_KEY' });
  });

  it('rejeita serviço não habilitado para o profissional', async () => {
    await expect(
      createAppointment(
        tenantA,
        {
          customer_id: customerA,
          professional_id: orphanProf,
          service_id: serviceA,
          starts_at: '2026-05-06T14:00:00.000Z',
          ends_at: '2026-05-06T14:30:00.000Z',
          source: 'api',
          idempotency_key: `idem-ap3-${randomUUID().slice(0, 8)}`,
          explicit_confirmation: true,
        },
        attendantCaller,
      ),
    ).rejects.toMatchObject({ code: 'SERVICE_NOT_BOOKABLE' });
  });

  it('rejeita service_id de outro tenant', async () => {
    await expect(
      createAppointment(
        tenantA,
        {
          customer_id: customerA,
          professional_id: profA,
          service_id: serviceB,
          starts_at: '2026-05-06T15:00:00.000Z',
          ends_at: '2026-05-06T15:30:00.000Z',
          source: 'api',
          idempotency_key: `idem-ap4-${randomUUID().slice(0, 8)}`,
          explicit_confirmation: true,
        },
        attendantCaller,
      ),
    ).rejects.toMatchObject({ code: 'SERVICE_NOT_BOOKABLE' });
  });

  it('duração incorreta falha validação', async () => {
    await expect(
      createAppointment(
        tenantA,
        {
          customer_id: customerA,
          professional_id: profA,
          service_id: serviceA,
          starts_at: '2026-05-06T16:00:00.000Z',
          ends_at: '2026-05-06T16:20:00.000Z',
          source: 'api',
          idempotency_key: `idem-ap5-${randomUUID().slice(0, 8)}`,
          explicit_confirmation: true,
        },
        attendantCaller,
      ),
    ).rejects.toMatchObject({ code: 'SCHEDULE_DURATION_MISMATCH' });
  });
});
