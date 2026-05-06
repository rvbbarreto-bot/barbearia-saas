/**
 * Integração: professionals (CRUD, serviços, isolamento tenant).
 *
 *   cd apps/api
 *   npm test -- src/modules/professionals/professionals.integration.test.ts
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';

const run =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.JWT_SECRET) &&
  Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('professionals service integration', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 5,
  });

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const serviceA = randomUUID();
  const serviceB = randomUUID();
  const tz = 'America/Sao_Paulo';

  async function applyMigrationsIfNeeded() {
    const chk = await pool.query(`SELECT to_regclass('public.professionals') AS t`);
    if (chk.rows[0]?.t) return;
    const dir = resolve(process.cwd(), '..', '..', 'database', 'migrations');
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
      await pool.query(readFileSync(resolve(dir, name), 'utf8'));
    }
  }

  async function purge() {
    await pool.query(`DELETE FROM professional_services WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM professionals WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM services WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL!;
    process.env.JWT_SECRET = process.env.JWT_SECRET!;
    process.env.REDIS_URL = process.env.REDIS_URL!;
    await applyMigrationsIfNeeded();
    await purge();
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1,'TA','TA','trial','active'), ($2,'TB','TB','trial','active')`,
      [tenantA, tenantB],
    );
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantA, async () => {
        await c.query(
          `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active)
           VALUES ($1,$2,'SA',30,5000,true)`,
          [serviceA, tenantA],
        );
      });
      await withAppTenant(c, tenantB, async () => {
        await c.query(
          `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active)
           VALUES ($1,$2,'SB',30,5000,true)`,
          [serviceB, tenantB],
        );
      });
    } finally {
      c.release();
    }
  });

  afterAll(async () => {
    await purge();
    await pool.end();
  });

  it('cria com serviços, lista e obtém por id', async () => {
    const { createProfessional, listProfessionals, getProfessionalById } = await import('./service.js');
    const slug = `pf-${randomUUID().slice(0, 8)}`;
    const p = await createProfessional(
      tenantA,
      { name: 'Barbeiro A', slug, timezone: tz, service_ids: [serviceA] },
      undefined,
    );
    expect(p.id).toBeTruthy();

    const list = await listProfessionals(tenantA, { page: '1', limit: '20' });
    expect(list.data.some((r: { id: string }) => r.id === p.id)).toBe(true);

    const one = await getProfessionalById(tenantA, p.id as string);
    expect(String(one.slug)).toBe(slug);
  });

  it('rejeita serviço de outro tenant na criação', async () => {
    const { createProfessional } = await import('./service.js');
    const slug = `pf-${randomUUID().slice(0, 8)}`;
    await expect(
      createProfessional(tenantA, { name: 'XX', slug, timezone: tz, service_ids: [serviceB] }, undefined),
    ).rejects.toMatchObject({ code: 'INVALID_SERVICE_IDS' });
  });

  it('addProfessionalServices rejeita serviço de outro tenant', async () => {
    const { createProfessional, addProfessionalServices } = await import('./service.js');
    const slug = `pf-${randomUUID().slice(0, 8)}`;
    const p = await createProfessional(
      tenantA,
      { name: 'ZZ', slug, timezone: tz, service_ids: [serviceA] },
      undefined,
    );
    await expect(
      addProfessionalServices(tenantA, p.id as string, { service_ids: [serviceB] }, undefined),
    ).rejects.toMatchObject({ code: 'INVALID_SERVICE_IDS' });
  });

  it('atualiza active e não acede profissional de outro tenant', async () => {
    const { createProfessional, updateProfessional, getProfessionalById } = await import('./service.js');
    const slug = `pf-${randomUUID().slice(0, 8)}`;
    const p = await createProfessional(
      tenantA,
      { name: 'BB', slug, timezone: tz, service_ids: [serviceA] },
      undefined,
    );
    const upd = await updateProfessional(tenantA, p.id as string, { active: false }, undefined);
    expect(upd.active).toBe(false);

    const slugB = `pfb-${randomUUID().slice(0, 8)}`;
    const pB = await createProfessional(tenantB, { name: 'Outro', slug: slugB, timezone: tz }, undefined);
    await expect(getProfessionalById(tenantA, pB.id as string)).rejects.toMatchObject({
      code: 'PROFESSIONAL_NOT_FOUND',
    });
  });
});
