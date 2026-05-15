/**
 * Fase V4 schema: enum de status · EXCLUDE temporal · histórico de status · RLS opcional com barbearia_app.
 * Requer DATABASE_URL para PostgreSQL com migrations aplicadas.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL env var is required for integration tests (phase 4). ' +
      'Example: DATABASE_URL=postgres://user:pass@localhost:5432/barbearia_saas npm test',
  );
}

// Setup de schema usa superuser no CI; teste RLS final faz SET SESSION AUTHORIZATION barbearia_app.
const DATABASE_URL = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;

async function ensurePhase4Migration(pool: pg.Pool): Promise<void> {
  const check = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tenant_settings'
    LIMIT 1
  `);
  if (!check.rows.length) {
    const migrationsDir = resolve(process.cwd(), '..', '..', 'database', 'migrations');
    const sqlPath = resolve(migrationsDir, '009_phase4_operational_minimum.sql');
    await pool.query(readFileSync(sqlPath, 'utf8'));
  }
}

describe('phase4 operational schema integration', { sequential: true }, () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 8000 });

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const customerA = randomUUID();
  const profA = randomUUID();
  const idemKey = randomUUID();

  afterAll(async () => {
    await pool.query(`DELETE FROM appointment_status_history WHERE tenant_id IN ($1,$2)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM appointments WHERE tenant_id IN ($1,$2)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM customers WHERE tenant_id IN ($1,$2)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM professionals WHERE tenant_id IN ($1,$2)`, [tenantA, tenantB]);
    await pool.query(`DELETE FROM tenants WHERE id IN ($1,$2)`, [tenantA, tenantB]);
    await pool.end();
  });

  it('migration 009: enum novo status permite INSERT', async () => {
    await ensurePhase4Migration(pool);

    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug)
       VALUES ($1, 'Legal A', 'Trade A', 'trial', 'active', $2)`,
      [tenantA, `slug-${tenantA.slice(0, 8)}`],
    );
    await pool.query(
      `INSERT INTO professionals (id, tenant_id, name, slug, active)
       VALUES ($1, $2, 'Barbeiro Phase4', $3, true)`,
      [profA, tenantA, `p-${tenantA.slice(0, 8)}`],
    );
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in)
       VALUES ($1, $2, 'Cliente', $3, true)`,
      [customerA, tenantA, `5511${tenantA.slice(0, 8)}999`],
    );

    const r = await pool.query(
      `INSERT INTO appointments (
         tenant_id, customer_id, professional_id, starts_at, ends_at,
         status, source, idempotency_key
       ) VALUES (
         $1, $2, $3,
         '2029-06-01T14:00:00.000Z', '2029-06-01T15:00:00.000Z',
         'checked_in'::appointment_status, 'api', $4
       ) RETURNING id`,
      [tenantA, customerA, profA, idemKey],
    );
    expect(r.rows[0].id).toBeTruthy();
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [r.rows[0].id]);
  });

  it('appointment_status_history grava INSERT e UPDATE de status', async () => {
    await ensurePhase4Migration(pool);

    const idem = randomUUID();
    const ins = await pool.query(
      `INSERT INTO appointments (
         tenant_id, customer_id, professional_id, starts_at, ends_at,
         status, source, idempotency_key
       ) VALUES (
         $1, $2, $3,
         '2029-07-02T14:00:00.000Z', '2029-07-02T15:00:00.000Z',
         'confirmed'::appointment_status, 'api', $4
       ) RETURNING id`,
      [tenantA, customerA, profA, idem],
    );
    const aid = ins.rows[0].id as string;

    await pool.query(
      `UPDATE appointments SET status = 'cancelled'::appointment_status WHERE id = $1 AND tenant_id = $2`,
      [aid, tenantA],
    );

    const hist = await pool.query(
      `SELECT new_status::text ns, previous_status::text AS ps FROM appointment_status_history WHERE appointment_id = $1 ORDER BY changed_at`,
      [aid],
    );
    expect(hist.rows.length).toBeGreaterThanOrEqual(2);
    expect(hist.rows[0].ns).toBe('confirmed');
    expect(hist.rows[0].ps).toBeNull();
    expect(hist.rows.some((row) => row.ns === 'cancelled')).toBe(true);

    await pool.query(`DELETE FROM appointments WHERE id = $1`, [aid]);
  });

  it('EXCLUDE impede dois agendamentos ocupantes sobrepostos para o mesmo profissional', async () => {
    await ensurePhase4Migration(pool);

    const k1 = randomUUID();
    const k2 = randomUUID();

    await pool.query(
      `INSERT INTO appointments (
         tenant_id, customer_id, professional_id, starts_at, ends_at,
         status, source, idempotency_key
       ) VALUES (
         $1, $2, $3,
         '2029-08-10T16:00:00.000Z', '2029-08-10T17:00:00.000Z',
         'confirmed'::appointment_status, 'api', $4
       )`,
      [tenantA, customerA, profA, k1],
    );

    await expect(
      pool.query(
        `INSERT INTO appointments (
           tenant_id, customer_id, professional_id, starts_at, ends_at,
           status, source, idempotency_key
         ) VALUES (
           $1, $2, $3,
           '2029-08-10T16:30:00.000Z', '2029-08-10T17:30:00.000Z',
           'confirmed'::appointment_status, 'api', $4
         )`,
        [tenantA, customerA, profA, k2],
      ),
    ).rejects.toMatchObject({ code: '23P01' });

    await pool.query(`DELETE FROM appointments WHERE tenant_id = $1 AND idempotency_key IN ($2,$3)`, [
      tenantA,
      k1,
      k2,
    ]);
  });

  it('RLS com barbearia_app: cliente do tenant A invisível com app.tenant_id = B', async () => {
    await ensurePhase4Migration(pool);

    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug)
       VALUES ($1, 'Legal B', 'Trade B', 'trial', 'active', $2)`,
      [tenantB, `slug-${tenantB.slice(0, 8)}`],
    );

    expect(
      (
        await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app'`)
      ).rows.length,
      'Este teste requer migration 006 (CREATE ROLE barbearia_app)',
    ).toBeGreaterThan(0);

    const custBId = randomUUID();
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in)
       VALUES ($1, $2, 'Outro cliente', $3, false)`,
      [custBId, tenantB, `5522${tenantB.slice(0, 8)}888`],
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET SESSION AUTHORIZATION barbearia_app`);
      await client.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantB]);
      const blockB = await client.query(`SELECT id FROM customers WHERE id = $1`, [custBId]);
      expect(blockB.rows).toHaveLength(1);

      const leak = await client.query(`SELECT id FROM customers WHERE id = $1`, [customerA]);
      expect(leak.rows).toHaveLength(0);

      await client.query('RESET SESSION AUTHORIZATION');
      await client.query('ROLLBACK');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      await client.query('RESET SESSION AUTHORIZATION').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await pool.query(`DELETE FROM customers WHERE id = $1`, [custBId]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantB]);
  });
});
