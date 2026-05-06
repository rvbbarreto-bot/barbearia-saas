/**
 * Waitlist: criar, cancelar, converter, sweep (availability) e isolamento tenant.
 *
 * Requer DATABASE_URL, JWT_SECRET, REDIS_URL e migrations aplicadas.
 *
 *   cd apps/api
 *   npm test -- src/modules/waitlist/waitlist.integration.test.ts
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';

const run =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.JWT_SECRET) &&
  Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('waitlist integration (create, cancel, convert, sweep, tenant isolation)', () => {
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

  async function applyMigrationsIfNeeded() {
    const chk = await pool.query(
      `SELECT to_regclass('public.waitlist_entries') AS t`,
    );
    if (chk.rows[0]?.t) return;
    const migrationsDir = resolve(process.cwd(), '..', '..', 'database', 'migrations');
    for (const name of readdirSync(migrationsDir).filter((n) => n.endsWith('.sql')).sort()) {
      const sql = readFileSync(resolve(migrationsDir, name), 'utf8');
      await pool.query(sql);
    }
  }

  /** SELECT/DELETE sob RLS com role `barbearia_app`. */
  async function withTenantClient<T>(tenantId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      return await withAppTenant(client, tenantId, () => fn(client));
    } finally {
      client.release();
    }
  }

  async function purge() {
    await pool.query(`DELETE FROM notification_jobs WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM waitlist_entries WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM consents WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM appointments WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM professional_services WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM business_hours WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM customers WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM services WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM professionals WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
  }

  beforeAll(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-06T11:00:00.000Z'));

    process.env.DATABASE_URL = process.env.DATABASE_URL!;
    process.env.JWT_SECRET = process.env.JWT_SECRET!;
    process.env.REDIS_URL = process.env.REDIS_URL!;

    await applyMigrationsIfNeeded();
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
          `INSERT INTO professionals (id, tenant_id, name, slug, active)
           VALUES ($1,$2,'P1',$3,true)`,
          [profA, tenantA, `slg-${profA.slice(0, 6)}`],
        );
        await c.query(
          `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in, is_vip)
           VALUES ($1,$2,'CA',$3,true,false)`,
          [customerA, tenantA, `5511${customerA.slice(0, 8)}111`],
        );
        await c.query(
          `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active)
           VALUES ($1,$2,'S1',30,5000,true)`,
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
        await c.query(
          `INSERT INTO consents (tenant_id, customer_id, channel, purpose, granted, source)
           VALUES ($1,$2,'whatsapp','transactional',true,'test')`,
          [tenantA, customerA],
        );
      });
      await withAppTenant(c, tenantB, async () => {
        await c.query(
          `INSERT INTO professionals (id, tenant_id, name, slug, active)
           VALUES ($1,$2,'P2',$3,true)`,
          [profB, tenantB, `slg-${profB.slice(0, 6)}`],
        );
        await c.query(
          `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in, is_vip)
           VALUES ($1,$2,'CB',$3,true,false)`,
          [customerB, tenantB, `5511${customerB.slice(0, 8)}222`],
        );
        await c.query(
          `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active)
           VALUES ($1,$2,'S2',30,5000,true)`,
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

  it('cria entrada de fila', async () => {
    const { createWaitlistEntry } = await import('./service.js');
    const row = await createWaitlistEntry(
      tenantA,
      {
        customer_id: customerA,
        service_id: serviceA,
        professional_id: profA,
        preferred_date_from: '2026-05-06',
        preferred_date_to: '2026-05-08',
        shift_preference: 'any',
        deposit_priority: false,
      },
      undefined,
    );
    expect(row.id).toBeTruthy();
    expect(String(row.status)).toBe('active');
  });

  it('sweep encontra vaga e cria notification_job (dedupe na segunda execução)', async () => {
    const { createWaitlistEntry } = await import('./service.js');
    const { runWaitlistSweepForTenant } = await import('./sweep.service.js');

    await withTenantClient(tenantA, async (cx) => {
      await cx.query(`DELETE FROM notification_jobs WHERE tenant_id = $1`, [tenantA]);
      await cx.query(`DELETE FROM waitlist_entries WHERE tenant_id = $1`, [tenantA]);
    });

    const row = await createWaitlistEntry(
      tenantA,
      {
        customer_id: customerA,
        service_id: serviceA,
        professional_id: profA,
        preferred_date_from: '2026-05-06',
        preferred_date_to: '2026-05-07',
        shift_preference: 'any',
        deposit_priority: true,
      },
      undefined,
    );

    const c0 = await withTenantClient(tenantA, (cx) =>
      cx.query(
        `SELECT COUNT(*)::int AS n FROM notification_jobs WHERE tenant_id = $1 AND payload->>'waitlist_entry_id' = $2`,
        [tenantA, row.id],
      ),
    );
    expect(c0.rows[0].n).toBe(0);

    const r1 = await runWaitlistSweepForTenant(tenantA, { ignoreEnvGates: true });
    expect(r1.enqueued).toBeGreaterThanOrEqual(1);

    const c1 = await withTenantClient(tenantA, (cx) =>
      cx.query(
        `SELECT COUNT(*)::int AS n FROM notification_jobs WHERE tenant_id = $1 AND payload->>'waitlist_entry_id' = $2`,
        [tenantA, row.id],
      ),
    );
    expect(c1.rows[0].n).toBe(1);

    const r2 = await runWaitlistSweepForTenant(tenantA, { ignoreEnvGates: true });
    expect(r2.enqueued).toBe(0);

    const c2 = await withTenantClient(tenantA, (cx) =>
      cx.query(
        `SELECT COUNT(*)::int AS n FROM notification_jobs WHERE tenant_id = $1 AND payload->>'waitlist_entry_id' = $2`,
        [tenantA, row.id],
      ),
    );
    expect(c2.rows[0].n).toBe(1);
  });

  it('cancela entrada ativa', async () => {
    const { createWaitlistEntry, cancelWaitlistEntry } = await import('./service.js');
    const row = await createWaitlistEntry(
      tenantA,
      {
        customer_id: customerA,
        service_id: serviceA,
        professional_id: profA,
        preferred_date_from: '2026-05-10',
        preferred_date_to: '2026-05-12',
        shift_preference: 'morning',
      },
      undefined,
    );
    const cancelled = await cancelWaitlistEntry(tenantA, row.id as string, undefined);
    expect(String(cancelled.status)).toBe('cancelled');
  });

  it('converte entrada com appointment do mesmo cliente', async () => {
    const { createWaitlistEntry, convertWaitlistEntry } = await import('./service.js');
    const entry = await createWaitlistEntry(
      tenantA,
      {
        customer_id: customerA,
        service_id: serviceA,
        professional_id: profA,
        preferred_date_from: '2026-06-01',
        preferred_date_to: '2026-06-05',
        shift_preference: 'any',
      },
      undefined,
    );

    const apptId = randomUUID();
    await withTenantClient(tenantA, async (cx) => {
      await cx.query(
        `INSERT INTO appointments (
           id, tenant_id, customer_id, professional_id, service_id,
           starts_at, ends_at, status, source, idempotency_key
         ) VALUES ($1,$2,$3,$4,$5,
           '2030-02-01T14:00:00Z','2030-02-01T15:00:00Z',
           'confirmed','api',$6)`,
        [apptId, tenantA, customerA, profA, serviceA, randomUUID()],
      );
    });

    const conv = await convertWaitlistEntry(tenantA, entry.id as string, { appointment_id: apptId }, undefined);
    expect(String(conv.status)).toBe('converted');

    await withTenantClient(tenantA, async (cx) => {
      await cx.query(`DELETE FROM appointments WHERE id = $1`, [apptId]);
    });
  });

  it('isolamento: cancelamento de outro tenant falha', async () => {
    const { createWaitlistEntry, cancelWaitlistEntry } = await import('./service.js');

    const entryB = await createWaitlistEntry(
      tenantB,
      {
        customer_id: customerB,
        service_id: serviceB,
        professional_id: profB,
        preferred_date_from: '2026-05-06',
        preferred_date_to: '2026-05-07',
        shift_preference: 'any',
      },
      undefined,
    );

    await expect(cancelWaitlistEntry(tenantA, entryB.id as string, undefined)).rejects.toMatchObject({
      code: 'WAITLIST_ENTRY_NOT_FOUND',
    });

    await cancelWaitlistEntry(tenantB, entryB.id as string, undefined).catch(() => {});
  });

  it('listagem filtra por professional_id', async () => {
    const { createWaitlistEntry, listWaitlistEntries } = await import('./service.js');
    const withProf = await createWaitlistEntry(
      tenantA,
      {
        customer_id: customerA,
        service_id: serviceA,
        professional_id: profA,
        preferred_date_from: '2026-05-20',
        preferred_date_to: '2026-05-21',
        shift_preference: 'any',
      },
      undefined,
    );
    const anyProf = await createWaitlistEntry(
      tenantA,
      {
        customer_id: customerA,
        service_id: serviceA,
        professional_id: null,
        preferred_date_from: '2026-05-22',
        preferred_date_to: '2026-05-23',
        shift_preference: 'any',
      },
      undefined,
    );
    const r = await listWaitlistEntries(tenantA, {
      page: 1,
      limit: 50,
      status: 'active',
      professional_id: profA,
    });
    const ids = r.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(withProf.id as string);
    expect(ids).not.toContain(anyProf.id as string);
  });
});
