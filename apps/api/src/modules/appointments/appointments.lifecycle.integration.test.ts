/**
 * Integração: ciclo de vida agenda (confirm, cancel, reschedule, escopo profissional, tenant).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../commission/service.js', () => ({
  createCommissionEntryForCompletedAppointment: vi.fn(async () => undefined),
}));

import pg from 'pg';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';
import {
  cancelAppointment,
  confirmAppointment,
  createAppointment,
  rescheduleAppointment,
} from './service.js';

const run =
  Boolean(process.env.DATABASE_URL) && Boolean(process.env.JWT_SECRET) && Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('appointments lifecycle integration', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 5,
  });

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const customerA = randomUUID();
  const profA = randomUUID();
  const profB = randomUUID();
  const serviceA = randomUUID();
  const attendantUserId = randomUUID();
  const profUserA = randomUUID();
  const profUserB = randomUUID();

  const attendantCaller = { sub: attendantUserId, role: 'attendant' as const };

  async function purge() {
    await pool.query(`DELETE FROM notification_jobs WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
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
    vi.setSystemTime(new Date('2026-05-13T12:00:00.000Z'));
    await purge();
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1,'LA','TA','trial','active'), ($2,'LB','TB','trial','active')`,
      [tenantA, tenantB],
    );
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantA, async () => {
        await c.query(
          `INSERT INTO professionals (id, tenant_id, name, slug, timezone, active) VALUES
           ($1,$2,'PA',$3,'America/Sao_Paulo',true),
           ($4,$2,'PB',$5,'America/Sao_Paulo',true)`,
          [profA, tenantA, `sl-${profA.slice(0, 6)}`, profB, tenantA, `sl-${profB.slice(0, 6)}`],
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
           VALUES ($1,$2,$3), ($1,$4,$3)`,
          [tenantA, profA, serviceA, profB],
        );
        await c.query(
          `INSERT INTO business_hours (id, tenant_id, professional_id, weekday, starts_at, ends_at, slot_interval_minutes, active)
           VALUES (gen_random_uuid(),$1,$2,3,'09:00:00','18:00:00',30,true),
                  (gen_random_uuid(),$1,$3,3,'09:00:00','18:00:00',30,true)`,
          [tenantA, profA, profB],
        );
        await c.query(
          `INSERT INTO users (id, tenant_id, name, email, password_hash, role, professional_id) VALUES
           ($1,$2,'Att',$3,'h','attendant',null),
           ($4,$2,'PrA',$5,'h','professional',$6),
           ($7,$2,'PrB',$8,'h','professional',$9)`,
          [
            attendantUserId,
            tenantA,
            `att-${attendantUserId}@t.local`,
            profUserA,
            tenantA,
            `pra-${profUserA}@t.local`,
            profA,
            profUserB,
            tenantA,
            `prb-${profUserB}@t.local`,
            profB,
          ],
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

  async function createAwaiting(slot: { start: string; end: string }) {
    return createAppointment(
      tenantA,
      {
        customer_id: customerA,
        professional_id: profA,
        service_id: serviceA,
        starts_at: slot.start,
        ends_at: slot.end,
        source: 'api',
        idempotency_key: `idem-${randomUUID().slice(0, 10)}`,
        explicit_confirmation: true,
      },
      attendantCaller,
    ) as Promise<{ id: string; status: string }>;
  }

  it('confirma agendamento awaiting_confirmation', async () => {
    const row = await createAwaiting({
      start: '2026-05-13T15:00:00.000Z',
      end: '2026-05-13T15:30:00.000Z',
    });
    const confirmed = await confirmAppointment(tenantA, row.id, attendantCaller);
    expect(String((confirmed as { status?: string }).status)).toBe('confirmed');
  });

  it('cancel libera slot para novo agendamento', async () => {
    const row = await createAwaiting({
      start: '2026-05-13T14:00:00.000Z',
      end: '2026-05-13T14:30:00.000Z',
    });
    const confirmed = await confirmAppointment(tenantA, row.id, attendantCaller);
    expect(String((confirmed as { status?: string }).status)).toBe('confirmed');
    await cancelAppointment(
      tenantA,
      row.id,
      { reason: 'Cliente desistiu do horário' },
      attendantCaller,
    );
    const second = await createAwaiting({
      start: '2026-05-13T14:00:00.000Z',
      end: '2026-05-13T14:30:00.000Z',
    });
    expect(String(second.status)).toBe('awaiting_confirmation');
  });

  it('rejeita remarcação para o passado', async () => {
    const row = await createAwaiting({
      start: '2026-05-13T16:00:00.000Z',
      end: '2026-05-13T16:30:00.000Z',
    });
    await confirmAppointment(tenantA, row.id, attendantCaller);
    await expect(
      rescheduleAppointment(
        tenantA,
        row.id,
        {
          starts_at: '2026-05-13T10:00:00.000Z',
          ends_at: '2026-05-13T10:30:00.000Z',
          reason: 'Tentativa inválida no passado',
        },
        attendantCaller,
      ),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_IN_PAST' });
  });

  it('professional não cancela agendamento de outro profissional', async () => {
    const row = await createAwaiting({
      start: '2026-05-13T17:00:00.000Z',
      end: '2026-05-13T17:30:00.000Z',
    });
    await confirmAppointment(tenantA, row.id, attendantCaller);
    await expect(
      cancelAppointment(
        tenantA,
        row.id,
        { reason: 'Tentativa cross-prof' },
        { sub: profUserB, role: 'professional', professional_id: profB },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it('tenant B não vê agendamento do tenant A (404)', async () => {
    const row = await createAwaiting({
      start: '2026-05-13T13:00:00.000Z',
      end: '2026-05-13T13:30:00.000Z',
    });
    await expect(
      cancelAppointment(
        tenantB,
        row.id,
        { reason: 'Cross tenant' },
        { sub: attendantUserId, role: 'attendant' },
      ),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND', statusCode: 404 });
  });
});
