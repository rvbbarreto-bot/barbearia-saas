/**
 * GESTAO-500 — dashboard gerencial não deve falhar por colunas inexistentes em operational_audit_events.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { writeOperationalAuditEvent } from '../../shared/operational-audit.js';
import { getManagementDashboard } from './service.js';

const run =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.JWT_SECRET) &&
  Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('GET management dashboard (integration)', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 3,
  });

  const tenantId = randomUUID();

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug)
       VALUES ($1, 'Gestao Test', 'Gestao Test', 'trial', 'active', $2)`,
      [tenantId, `gestao-${tenantId.slice(0, 8)}`],
    );

    await withTenant(tenantId, async (client) => {
      await writeOperationalAuditEvent(client, {
        tenantId,
        entityType: 'appointment',
        eventType: 'APPOINTMENT_FAILED_QA',
        metadata: { severity: 'error', note: 'GESTAO-500 regression' },
      });
    });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM operational_audit_events WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    await pool.end();
  });

  it('retorna 200 payload com recent_operational_errors mapeados', async () => {
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();

    const dashboard = await getManagementDashboard(tenantId, { from, to });

    expect(dashboard.period.from).toBe(from);
    expect(dashboard.kpis).toBeDefined();
    expect(dashboard.outbox).toBeDefined();
    expect(Array.isArray(dashboard.recent_operational_errors)).toBe(true);
    const err = dashboard.recent_operational_errors.find((e) => e.action === 'APPOINTMENT_FAILED_QA');
    expect(err).toBeDefined();
    expect(err?.entity).toBe('appointment');
  });
});
