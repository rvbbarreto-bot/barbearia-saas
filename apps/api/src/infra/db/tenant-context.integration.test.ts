/**
 * Consistência mínima: RLS + `app.tenant_id` alinhado a `withTenant` / `withAppTenant`.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { withTenant } from './pool.js';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';

const run =
  Boolean(process.env.DATABASE_URL) && Boolean(process.env.JWT_SECRET) && Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('tenant context vs RLS (app.tenant_id)', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 3,
  });

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const custA = randomUUID();

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1,'TA','TA','trial','active'), ($2,'TB','TB','trial','active')`,
      [tenantA, tenantB],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM customers WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.end();
  });

  it('INSERT em customers sem app.tenant_id falha (RLS WITH CHECK)', async () => {
    await expect(
      pool.query(
        `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in, is_vip)
         VALUES ($1,$2,'X','5511999990001',true,false)`,
        [custA, tenantA],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('withAppTenant permite INSERT na mesma tabela', async () => {
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantA, async () => {
        await c.query(
          `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in, is_vip)
           VALUES ($1,$2,'Cliente','5511999990002',true,false)`,
          [custA, tenantA],
        );
      });
    } finally {
      c.release();
    }
    const bare = await pool.query(`SELECT count(*)::int AS n FROM customers WHERE id = $1`, [custA]);
    expect(bare.rows[0].n).toBe(0);
    const scoped = await pool.connect();
    try {
      await withAppTenant(scoped, tenantA, async () => {
        const r = await scoped.query(`SELECT id FROM customers WHERE id = $1`, [custA]);
        expect(r.rowCount).toBe(1);
      });
    } finally {
      scoped.release();
    }
  });

  it('withTenant (pool helper) expõe o mesmo tenant a app_tenant_id()', async () => {
    const r = await withTenant(tenantA, async (client) =>
      client.query(`SELECT current_setting('app.tenant_id', true) AS tid`),
    );
    expect(r.rows[0].tid).toBe(tenantA);
  });

  it('SELECT cross-tenant não devolve linhas sob contexto B', async () => {
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantB, async () => {
        const r = await c.query(`SELECT id FROM customers WHERE id = $1`, [custA]);
        expect(r.rowCount).toBe(0);
      });
    } finally {
      c.release();
    }
  });
});
