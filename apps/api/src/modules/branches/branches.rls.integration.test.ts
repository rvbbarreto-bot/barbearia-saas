/**
 * Isolamento RLS da tabela `branches` (FORCE + policy tenant_isolation_branches).
 *
 * Padrão de tenant context (igual à app via `withTenant` / pool):
 *   SELECT set_config('app.tenant_id', '<uuid>', true);
 * A função SQL `app_tenant_id()` lê `current_setting('app.tenant_id', true)::uuid`.
 *
 * Execução (requer Postgres com migrations aplicadas):
 *   cd apps/api && DATABASE_URL=postgres://... npm test -- src/modules/branches/branches.rls.integration.test.ts
 * Sem DATABASE_URL o suite é ignorado (skip), não falha.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const run = Boolean(process.env.DATABASE_URL);

async function applyMigrationsIfNeeded(p: pg.Pool) {
  const schemaCheck = await p.query(`SELECT to_regclass('public.branches') AS branches_table`);
  if (schemaCheck.rows[0]?.branches_table) return;
  const migrationsDir = resolve(process.cwd(), '..', '..', 'database', 'migrations');
  const migrationFiles = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const migrationFile of migrationFiles) {
    const sql = readFileSync(resolve(migrationsDir, migrationFile), 'utf8');
    await p.query(sql);
  }
}

async function withAppTenant<T>(client: pg.PoolClient, tenantId: string, fn: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const out = await fn();
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

describe.skipIf(!run)('branches RLS (multi-tenant isolation)', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL!,
    connectionTimeoutMillis: 8000,
  });
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const branchA = randomUUID();
  const branchB = randomUUID();

  beforeAll(async () => {
    await applyMigrationsIfNeeded(pool);
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1, 'RLS Tenant A', 'TA', 'trial', 'active'),
              ($2, 'RLS Tenant B', 'TB', 'trial', 'active')`,
      [tenantA, tenantB],
    );

    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantA, async () => {
        await c.query(
          `INSERT INTO branches (id, tenant_id, name, slug, timezone, active)
           VALUES ($1, $2, 'Filial A', 'filial-a', 'America/Sao_Paulo', true)`,
          [branchA, tenantA],
        );
      });
      await withAppTenant(c, tenantB, async () => {
        await c.query(
          `INSERT INTO branches (id, tenant_id, name, slug, timezone, active)
           VALUES ($1, $2, 'Filial B', 'filial-b', 'America/Sao_Paulo', true)`,
          [branchB, tenantB],
        );
      });
    } finally {
      c.release();
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM branches WHERE id IN ($1, $2)', [branchA, branchB]);
    await pool.query('DELETE FROM tenants WHERE id IN ($1, $2)', [tenantA, tenantB]);
    await pool.end();
  });

  it('tenant A vê apenas a sua branch', async () => {
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantA, async () => {
        const r = await c.query(`SELECT id FROM branches ORDER BY name`);
        expect(r.rows.map((x) => x.id)).toEqual([branchA]);
      });
    } finally {
      c.release();
    }
  });

  it('tenant B vê apenas a sua branch', async () => {
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantB, async () => {
        const r = await c.query(`SELECT id FROM branches ORDER BY name`);
        expect(r.rows.map((x) => x.id)).toEqual([branchB]);
      });
    } finally {
      c.release();
    }
  });

  it('UPDATE cross-tenant não altera linhas do outro tenant', async () => {
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantA, async () => {
        const upd = await c.query(`UPDATE branches SET name = 'Hack' WHERE id = $1`, [branchB]);
        expect(upd.rowCount).toBe(0);
      });
      await withAppTenant(c, tenantB, async () => {
        const upd = await c.query(`UPDATE branches SET name = 'Hack' WHERE id = $1`, [branchA]);
        expect(upd.rowCount).toBe(0);
      });
    } finally {
      c.release();
    }
  });

  it('INSERT com tenant_id ≠ app.tenant_id() falha (WITH CHECK)', async () => {
    const c = await pool.connect();
    try {
      await withAppTenant(c, tenantA, async () => {
        await expect(
          c.query(
            `INSERT INTO branches (id, tenant_id, name, slug, timezone, active)
             VALUES (gen_random_uuid(), $1, 'Inject', 'inject', 'America/Sao_Paulo', true)`,
            [tenantB],
          ),
        ).rejects.toThrow();
      });
    } finally {
      c.release();
    }
  });

  it('RLS e FORCE estão ativos em branches', async () => {
    const r = await pool.query(
      `SELECT relrowsecurity AS rls, relforcerowsecurity AS force_rls
         FROM pg_class WHERE oid = 'public.branches'::regclass`,
    );
    expect(r.rows[0].rls).toBe(true);
    expect(r.rows[0].force_rls).toBe(true);
  });
});
