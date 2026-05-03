/**
 * Requer DATABASE_URL + JWT_SECRET + REDIS_URL e migrations 020 + 021 aplicadas.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const run =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.JWT_SECRET) &&
  Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('commission service integration (021)', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 5,
  });

  const tenantId = randomUUID();
  const otherTenant = randomUUID();
  const customerId = randomUUID();
  const profId = randomUUID();
  const serviceId = randomUUID();
  const branchId = randomUUID();
  const otherBranchId = randomUUID();

  let createCommissionEntryForCompletedAppointment: typeof import('./service.js').createCommissionEntryForCompletedAppointment;
  let createCommissionRule: typeof import('./service.js').createCommissionRule;
  let computeCashClosingForDate: typeof import('./service.js').computeCashClosingForDate;

  async function purge() {
    await pool.query(`DELETE FROM commission_entries WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM commission_rules WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM cash_closings WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM appointments WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM services WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM customers WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM professionals WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM branches WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM tenant_settings WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    await pool.query(`DELETE FROM branches WHERE tenant_id = $1`, [otherTenant]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [otherTenant]);
  }

  beforeAll(async () => {
    const chk = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='commission_entries' LIMIT 1`,
    );
    if (!chk.rowCount) {
      await pool.end();
      throw new Error('Aplique 021_commission_and_daily_closing.sql antes destes testes.');
    }

    const mod = await import('./service.js');
    createCommissionEntryForCompletedAppointment = mod.createCommissionEntryForCompletedAppointment;
    createCommissionRule = mod.createCommissionRule;
    computeCashClosingForDate = mod.computeCashClosingForDate;

    await purge();

    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug)
       VALUES ($1,'T1','T1','trial','active',$2), ($3,'T2','T2','trial','active',$4)`,
      [tenantId, `cx-${tenantId.slice(0, 8)}`, otherTenant, `ot-${otherTenant.slice(0, 8)}`],
    );

    await pool.query(
      `INSERT INTO branches (id, tenant_id, name, active) VALUES ($1,$2,'Matriz',true)`,
      [branchId, tenantId],
    );
    await pool.query(
      `INSERT INTO branches (id, tenant_id, name, active) VALUES ($1,$2,'Outra loja',true)`,
      [otherBranchId, otherTenant],
    );

    await pool.query(
      `INSERT INTO professionals (id, tenant_id, name, slug, active) VALUES ($1,$2,'Barb',$3,true)`,
      [profId, tenantId, `pf-${profId.slice(0, 6)}`],
    );
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in) VALUES ($1,$2,'C',$3,true)`,
      [customerId, tenantId, `5511${customerId.slice(0, 8)}777`],
    );
    await pool.query(
      `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active) VALUES ($1,$2,'Svc',30,10000,true)`,
      [serviceId, tenantId],
    );
  });

  afterAll(async () => {
    await purge();
    await pool.end();
  });

  it('com commission_enabled false não insere commission_entries', async () => {
    const apptId = randomUUID();
    await pool.query(
      `INSERT INTO tenant_settings (tenant_id, settings) VALUES ($1, $2::jsonb)
       ON CONFLICT (tenant_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [tenantId, JSON.stringify({ commission_enabled: false })],
    );

    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, branch_id,
         starts_at, ends_at, status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,
         '2030-01-10T14:00:00Z','2030-01-10T15:00:00Z',
         'completed','api',$7,'2030-01-10T15:05:00Z'
       )`,
      [apptId, tenantId, customerId, profId, serviceId, branchId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,10000,0)`,
      [tenantId, apptId],
    );

    const { withTenant } = await import('../../infra/db/pool.js');
    await withTenant(tenantId, async (client) => {
      await createCommissionEntryForCompletedAppointment(client, tenantId, apptId);
    });

    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM commission_entries WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantId,
      apptId,
    ]);
    expect(c.rows[0].n).toBe(0);

    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [tenantId, apptId]);
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('com commission_enabled true insere linha e respeita percentual', async () => {
    await pool.query(
      `INSERT INTO tenant_settings (tenant_id, settings) VALUES ($1, $2::jsonb)
       ON CONFLICT (tenant_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [tenantId, JSON.stringify({ commission_enabled: true })],
    );

    await createCommissionRule(tenantId, {
      rule_kind: 'percent',
      percent_basis_points: 5000,
      priority: 1,
      active: true,
    }, undefined);

    const apptId = randomUUID();
    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, branch_id,
         starts_at, ends_at, status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,
         '2030-01-11T14:00:00Z','2030-01-11T15:00:00Z',
         'completed','api',$7,'2030-01-11T15:05:00Z'
       )`,
      [apptId, tenantId, customerId, profId, serviceId, branchId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,8000,0)`,
      [tenantId, apptId],
    );

    const { withTenant } = await import('../../infra/db/pool.js');
    await withTenant(tenantId, async (client) => {
      await createCommissionEntryForCompletedAppointment(client, tenantId, apptId);
    });

    const row = await pool.query(
      `SELECT commission_cents, base_amount_cents, status::text AS status FROM commission_entries WHERE tenant_id = $1 AND appointment_id = $2`,
      [tenantId, apptId],
    );
    expect(row.rowCount).toBe(1);
    expect(Number(row.rows[0].base_amount_cents)).toBe(8000);
    expect(Number(row.rows[0].commission_cents)).toBe(4000);
    expect(row.rows[0].status).toBe('pending');

    await withTenant(tenantId, async (client) => {
      await createCommissionEntryForCompletedAppointment(client, tenantId, apptId);
    });
    const dup = await pool.query(`SELECT COUNT(*)::int AS n FROM commission_entries WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantId,
      apptId,
    ]);
    expect(dup.rows[0].n).toBe(1);

    await pool.query(`DELETE FROM commission_entries WHERE tenant_id = $1 AND appointment_id = $2`, [tenantId, apptId]);
    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [tenantId, apptId]);
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [apptId]);
    await pool.query(`DELETE FROM commission_rules WHERE tenant_id = $1`, [tenantId]);
  });

  it('createCommissionRule rejeita branch de outro tenant', async () => {
    await expect(
      createCommissionRule(
        tenantId,
        {
          branch_id: otherBranchId,
          rule_kind: 'fixed_cents',
          fixed_cents: 100,
          priority: 0,
        },
        undefined,
      ),
    ).rejects.toMatchObject({ code: 'COMMISSION_RULE_BRANCH_INVALID' });
  });

  it('fechamento diário substitui linhas do mesmo dia (sem duplicar slot)', async () => {
    await pool.query(
      `INSERT INTO tenant_settings (tenant_id, settings) VALUES ($1, $2::jsonb)
       ON CONFLICT (tenant_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [tenantId, JSON.stringify({ commission_enabled: true })],
    );

    const day = '2030-02-01';
    const startsAt = `${day}T14:00:00Z`;
    const endsAt = `${day}T15:00:00Z`;
    const completedAt = `${day}T15:05:00Z`;
    const apptId = randomUUID();
    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, branch_id,
         starts_at, ends_at, status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,'completed','api',$9,$10
       )`,
      [apptId, tenantId, customerId, profId, serviceId, branchId, startsAt, endsAt, randomUUID(), completedAt],
    );
    await pool.query(
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,5000,0)`,
      [tenantId, apptId],
    );
    await pool.query(
      `INSERT INTO commission_entries (
         tenant_id, appointment_id, professional_id, branch_id, service_id,
         commission_rule_id, base_amount_cents, commission_cents, status
       ) VALUES ($1,$2,$3,$4,$5,NULL,5000,500,'pending')`,
      [tenantId, apptId, profId, branchId, serviceId],
    );

    await computeCashClosingForDate(tenantId, day);
    await computeCashClosingForDate(tenantId, day);

    const n = await pool.query(
      `SELECT COUNT(*)::int AS c FROM cash_closings WHERE tenant_id = $1 AND closing_date = $2::date`,
      [tenantId, day],
    );
    expect(n.rows[0].c).toBe(1);

    await pool.query(`DELETE FROM commission_entries WHERE tenant_id = $1 AND appointment_id = $2`, [tenantId, apptId]);
    await pool.query(`DELETE FROM cash_closings WHERE tenant_id = $1 AND closing_date = $2::date`, [tenantId, day]);
    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [tenantId, apptId]);
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });
});
