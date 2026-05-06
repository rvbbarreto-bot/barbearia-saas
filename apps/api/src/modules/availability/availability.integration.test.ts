/**
 * Integração: getAvailability (business_hours, slots, min_advance, isolamento tenant).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';
import { getAvailability } from './service.js';

const run =
  Boolean(process.env.DATABASE_URL) && Boolean(process.env.JWT_SECRET) && Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('availability integration', () => {
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
  const serviceB = randomUUID();

  async function purge() {
    await pool.query(`DELETE FROM professional_services WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM business_hours WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM customers WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM services WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM professionals WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
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
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantA, async () => {
        await c.query(
          `INSERT INTO professionals (id, tenant_id, name, slug, timezone, active)
           VALUES ($1,$2,'P1',$3,'America/Sao_Paulo',true)`,
          [profA, tenantA, `sl-${profA.slice(0, 6)}`],
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

  it('devolve slots quando min_advance=0', async () => {
    const r = await getAvailability(tenantA, {
      professional_id: profA,
      service_id: serviceA,
      date: '2026-05-06',
      min_advance_minutes: 0,
      max_slots: 20,
    });
    expect(Array.isArray(r.slots)).toBe(true);
    expect(r.slots.length).toBeGreaterThan(0);
  });

  it('min_advance elevado pode esvaziar slots', async () => {
    const r = await getAvailability(tenantA, {
      professional_id: profA,
      service_id: serviceA,
      date: '2026-05-06',
      min_advance_minutes: 24 * 60,
      max_slots: 20,
    });
    expect(r.slots.length).toBe(0);
  });

  it('profissional inexistente → 404', async () => {
    await expect(
      getAvailability(tenantA, {
        professional_id: randomUUID(),
        service_id: serviceA,
        date: '2026-05-06',
        min_advance_minutes: 0,
      }),
    ).rejects.toMatchObject({ code: 'PROFESSIONAL_NOT_FOUND' });
  });

  it('service_id de outro tenant → SERVICE_NOT_BOOKABLE', async () => {
    await expect(
      getAvailability(tenantA, {
        professional_id: profA,
        service_id: serviceB,
        date: '2026-05-06',
        min_advance_minutes: 0,
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_NOT_BOOKABLE' });
  });
});
