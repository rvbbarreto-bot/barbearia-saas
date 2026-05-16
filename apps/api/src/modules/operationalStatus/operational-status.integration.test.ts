/**
 * Integração: snapshot operacional por tenant (isolamento cross-tenant).
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { withAppTenant } from '../../test-utils/with-app-tenant.js';
import { getTenantOutboxOperationalSnapshot } from './service.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL required for operational-status integration tests');
}

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL_ADMIN ?? DATABASE_URL;

async function withTenantConn<T>(
  dbPool: pg.Pool,
  tid: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await dbPool.connect();
  try {
    return await withAppTenant(client, tid, () => fn(client));
  } finally {
    client.release();
  }
}

async function insertFailedOutbox(pool: pg.Pool, tenantId: string, marker: string) {
  return withTenantConn(pool, tenantId, async (client) => {
    const r = await client.query(
      `INSERT INTO message_outbox
         (tenant_id, channel, payload, metadata, status, attempts, max_attempts, last_error, correlation_id)
       VALUES ($1, 'whatsapp', '{"type":"text"}'::jsonb,
               jsonb_build_object('phone','5511999998888','provider','evolution'),
               'failed', 1, 5, $2, $3)
       RETURNING id`,
      [tenantId, `err-${marker}`, `corr-${marker}`],
    );
    return r.rows[0].id as string;
  });
}

describe('operational status integration', () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 3000 });
  const tenantA = randomUUID();
  const tenantB = randomUUID();

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? '12345678901234567890123456789012';
    const migrationsDir = resolve(process.cwd(), '..', '..', 'database', 'migrations');
    const schemaCheck = await pool.query(`SELECT to_regclass('public.tenants') AS t`);
    if (!schemaCheck.rows[0]?.t) {
      const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const f of files) {
        await pool.query(readFileSync(resolve(migrationsDir, f), 'utf8'));
      }
    }
    const adminPool = new pg.Pool({ connectionString: ADMIN_DATABASE_URL, connectionTimeoutMillis: 3000 });
    for (const tid of [tenantA, tenantB]) {
      await adminPool.query(
        `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
         VALUES ($1, 'Ops Status Test', 'ops-test', 'trial', 'active')
         ON CONFLICT (id) DO NOTHING`,
        [tid],
      );
    }
    await adminPool.end();
  });

  afterAll(async () => {
    const adminPool = new pg.Pool({ connectionString: ADMIN_DATABASE_URL, connectionTimeoutMillis: 3000 });
    for (const tid of [tenantA, tenantB]) {
      await adminPool.query(`DELETE FROM message_outbox WHERE tenant_id = $1`, [tid]);
      await adminPool.query(`DELETE FROM tenants WHERE id = $1`, [tid]);
    }
    await adminPool.end();
    await pool.end();
  });

  it('counts and recent_errors are isolated per tenant', async () => {
    await insertFailedOutbox(pool, tenantA, 'tenant-a-only');
    await insertFailedOutbox(pool, tenantB, 'tenant-b-only');

    const snapA = await getTenantOutboxOperationalSnapshot(tenantA);
    const snapB = await getTenantOutboxOperationalSnapshot(tenantB);

    expect(snapA.counts.failed).toBe(1);
    expect(snapB.counts.failed).toBe(1);
    expect(snapA.recent_errors[0]?.correlation_id).toBe('corr-tenant-a-only');
    expect(snapB.recent_errors[0]?.correlation_id).toBe('corr-tenant-b-only');
    expect(snapA.recent_errors[0]?.destination).toMatch(/^\*\*\*\d{4}$/);
    expect(JSON.stringify(snapA)).not.toContain('5511999998888');
  });
});
