/**
 * Isolamento de audit_logs via `listAuditLogs` (WHERE tenant_id explícito).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { writeAuditLog } from '../../shared/audit.js';
import { listAuditLogs } from './service.js';

const run =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.JWT_SECRET) &&
  Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('audit_logs list tenant isolation', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 3,
  });

  const tenantA = randomUUID();
  const tenantB = randomUUID();

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug)
       VALUES ($1,'AlA','AlA','trial','active',$3), ($2,'AlB','AlB','trial','active',$4)`,
      [tenantA, tenantB, `al-a-${tenantA.slice(0, 8)}`, `al-b-${tenantB.slice(0, 8)}`],
    );

    await withTenant(tenantA, async (c) => {
      await writeAuditLog(c, {
        tenantId: tenantA,
        actorUserId: null,
        action: 'DEVQA06_AUDIT_A',
        entity: 'isolation_fixture',
        entityId: randomUUID(),
        after: { marker: 'a' },
      });
    });
    await withTenant(tenantB, async (c) => {
      await writeAuditLog(c, {
        tenantId: tenantB,
        actorUserId: null,
        action: 'DEVQA06_AUDIT_B',
        entity: 'isolation_fixture',
        entityId: randomUUID(),
        after: { marker: 'b' },
      });
    });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM audit_logs WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.end();
  });

  it('Tenant A não vê ações do tenant B', async () => {
    const r = await listAuditLogs(tenantA, { page: 1, limit: 100 });
    const actions = r.data.map((row: { action: string }) => row.action);
    expect(actions.some((a) => a === 'DEVQA06_AUDIT_A')).toBe(true);
    expect(actions.some((a) => a === 'DEVQA06_AUDIT_B')).toBe(false);
  });

  it('Tenant B não vê ações do tenant A', async () => {
    const r = await listAuditLogs(tenantB, { page: 1, limit: 100 });
    const actions = r.data.map((row: { action: string }) => row.action);
    expect(actions.some((a) => a === 'DEVQA06_AUDIT_B')).toBe(true);
    expect(actions.some((a) => a === 'DEVQA06_AUDIT_A')).toBe(false);
  });

  it('Filtro entity mantém isolamento por tenant', async () => {
    const r = await listAuditLogs(tenantA, { page: 1, limit: 50, entity: 'isolation_fixture' });
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.data.every((row: { tenant_id: string }) => row.tenant_id === tenantA)).toBe(true);
    expect(r.data.some((row: { action: string }) => row.action === 'DEVQA06_AUDIT_B')).toBe(false);
  });
});
