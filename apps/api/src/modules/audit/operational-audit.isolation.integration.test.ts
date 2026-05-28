/**
 * Isolamento de `operational_audit_events` via `listOperationalAuditEvents`.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { writeOperationalAuditEvent } from '../../shared/operational-audit.js';
import { listOperationalAuditEvents } from './service.js';

const run =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.JWT_SECRET) &&
  Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('operational_audit_events list tenant isolation', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 3,
  });

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const corrA = `corr-a-${randomUUID().slice(0, 8)}`;
  const corrB = `corr-b-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug)
       VALUES ($1,'OpA','OpA','trial','active',$3), ($2,'OpB','OpB','trial','active',$4)`,
      [tenantA, tenantB, `op-a-${tenantA.slice(0, 8)}`, `op-b-${tenantB.slice(0, 8)}`],
    );

    await withTenant(tenantA, async (c) => {
      await writeOperationalAuditEvent(c, {
        tenantId: tenantA,
        entityType: 'fixture',
        eventType: 'PILOTO05_OP_AUDIT_A',
        correlationId: corrA,
        metadata: { marker: 'a' },
      });
    });
    await withTenant(tenantB, async (c) => {
      await writeOperationalAuditEvent(c, {
        tenantId: tenantB,
        entityType: 'fixture',
        eventType: 'PILOTO05_OP_AUDIT_B',
        correlationId: corrB,
        metadata: { marker: 'b' },
      });
    });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM operational_audit_events WHERE tenant_id = ANY($1::uuid[])`, [
      [tenantA, tenantB],
    ]);
    await pool.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
    await pool.end();
  });

  it('Tenant A não vê eventos do tenant B', async () => {
    const r = await listOperationalAuditEvents(tenantA, { page: 1, limit: 100 });
    const types = (r.data as unknown as Array<{ event_type: string }>).map((row) => row.event_type);
    expect(types.some((t) => t === 'PILOTO05_OP_AUDIT_A')).toBe(true);
    expect(types.some((t) => t === 'PILOTO05_OP_AUDIT_B')).toBe(false);
  });

  it('Filtro correlation_id mantém isolamento', async () => {
    const r = await listOperationalAuditEvents(tenantA, {
      page: 1,
      limit: 50,
      correlation_id: corrB,
    });
    expect(r.data.length).toBe(0);
  });
});
