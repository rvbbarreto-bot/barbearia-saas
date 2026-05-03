import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL env var is required for integration tests. ' +
    'Set it before running: DATABASE_URL=postgres://user:pass@host:5432/db npm test'
  );
}
const DATABASE_URL = process.env.DATABASE_URL;

describe('business hours service integration with real database', () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 3000 });
  const tenantId = randomUUID();
  const professionalId = randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? '12345678901234567890123456789012';
    process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

    const migrationsDir = resolve(process.cwd(), '..', '..', 'database', 'migrations');
    const schemaCheck = await pool.query(`SELECT to_regclass('public.tenants') AS tenants_table`);
    if (!schemaCheck.rows[0]?.tenants_table) {
      const migrationFiles = readdirSync(migrationsDir)
        .filter((name) => name.endsWith('.sql'))
        .sort();
      for (const migrationFile of migrationFiles) {
        const sql = readFileSync(resolve(migrationsDir, migrationFile), 'utf8');
        await pool.query(sql);
      }
    }

    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status)
       VALUES ($1, 'Tenant Teste Integração', 'Tenant Teste', 'trial', 'active')`,
      [tenantId],
    );
    await pool.query(
      `INSERT INTO professionals (id, tenant_id, name, slug, active)
       VALUES ($1, $2, 'Profissional Integração', 'prof-integracao', true)`,
      [professionalId, tenantId],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM professionals WHERE id = $1', [professionalId]).catch(() => {});
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]).catch(() => {});
    await pool.end();
  });

  it('prevents overlapping windows for same professional and weekday', async () => {
    const { createBusinessHours } = await import('./service.js');
    const first = await createBusinessHours(tenantId, {
      professional_id: professionalId,
      weekday: 1,
      starts_at: '09:00:00',
      ends_at: '12:00:00',
      slot_interval_minutes: 30,
    });
    expect(first.id).toBeTruthy();

    await expect(
      createBusinessHours(tenantId, {
        professional_id: professionalId,
        weekday: 1,
        starts_at: '11:00:00',
        ends_at: '13:00:00',
        slot_interval_minutes: 30,
      }),
    ).rejects.toMatchObject({ code: 'BUSINESS_HOURS_OVERLAP', statusCode: 409 });

    const second = await createBusinessHours(tenantId, {
      professional_id: professionalId,
      weekday: 1,
      starts_at: '13:00:00',
      ends_at: '16:00:00',
      slot_interval_minutes: 30,
    });
    expect(second.id).toBeTruthy();
  });
});
