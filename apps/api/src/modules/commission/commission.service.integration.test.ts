/**
 * Requer DATABASE_URL + JWT_SECRET + REDIS_URL e migrations 020 + 021 aplicadas.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { withTenant } from '../../infra/db/pool.js';

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
  let listCommissionEntries: typeof import('./service.js').listCommissionEntries;
  let patchCommissionEntryStatus: typeof import('./service.js').patchCommissionEntryStatus;

  async function queryTenant(tenant: string, text: string, params?: unknown[]) {
    return withTenant(tenant, async (c) => c.query(text, params));
  }

  async function execTenant(tenant: string, text: string, params?: unknown[]) {
    await queryTenant(tenant, text, params);
  }

  async function purgeOne(tenant: string) {
    await withTenant(tenant, async (c) => {
      await c.query(`DELETE FROM commission_entries WHERE tenant_id = $1`, [tenant]);
      await c.query(`DELETE FROM commission_rules WHERE tenant_id = $1`, [tenant]);
      await c.query(`DELETE FROM cash_closings WHERE tenant_id = $1`, [tenant]);
      await c.query(`DELETE FROM appointment_financials WHERE tenant_id = $1`, [tenant]);
      await c.query(`DELETE FROM appointments WHERE tenant_id = $1`, [tenant]);
      await c.query(`DELETE FROM services WHERE tenant_id = $1`, [tenant]);
      await c.query(`DELETE FROM customers WHERE tenant_id = $1`, [tenant]);
      await c.query(`DELETE FROM professionals WHERE tenant_id = $1`, [tenant]);
      await c.query(`DELETE FROM branches WHERE tenant_id = $1`, [tenant]);
      await c.query(`DELETE FROM tenant_settings WHERE tenant_id = $1`, [tenant]);
      await c.query(`DELETE FROM tenants WHERE id = $1`, [tenant]);
    });
  }

  async function purge() {
    await purgeOne(tenantId);
    await purgeOne(otherTenant);
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
    listCommissionEntries = mod.listCommissionEntries;
    patchCommissionEntryStatus = mod.patchCommissionEntryStatus;

    await purge();

    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug)
       VALUES ($1,'T1','T1','trial','active',$2), ($3,'T2','T2','trial','active',$4)`,
      [tenantId, `cx-${tenantId.slice(0, 8)}`, otherTenant, `ot-${otherTenant.slice(0, 8)}`],
    );

    await withTenant(tenantId, async (c) => {
      await c.query(`INSERT INTO branches (id, tenant_id, name, active) VALUES ($1,$2,'Matriz',true)`, [
        branchId,
        tenantId,
      ]);
      await c.query(`INSERT INTO professionals (id, tenant_id, name, slug, active) VALUES ($1,$2,'Barb',$3,true)`, [
        profId,
        tenantId,
        `pf-${profId.slice(0, 6)}`,
      ]);
      await c.query(
        `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in) VALUES ($1,$2,'C',$3,true)`,
        [customerId, tenantId, `5511${customerId.slice(0, 8)}777`],
      );
      await c.query(
        `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active) VALUES ($1,$2,'Svc',30,10000,true)`,
        [serviceId, tenantId],
      );
    });

    await withTenant(otherTenant, async (c) => {
      await c.query(`INSERT INTO branches (id, tenant_id, name, active) VALUES ($1,$2,'Outra loja',true)`, [
        otherBranchId,
        otherTenant,
      ]);
    });
  });

  afterAll(async () => {
    await purge();
    await pool.end();
  });

  it('com commission_enabled false não insere commission_entries', async () => {
    const apptId = randomUUID();
    await execTenant(
      tenantId,
      `INSERT INTO tenant_settings (tenant_id, settings) VALUES ($1, $2::jsonb)
       ON CONFLICT (tenant_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [tenantId, JSON.stringify({ commission_enabled: false })],
    );

    await execTenant(
      tenantId,
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
    await execTenant(
      tenantId,
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,10000,0)`,
      [tenantId, apptId],
    );

    await withTenant(tenantId, async (client) => {
      await createCommissionEntryForCompletedAppointment(client, tenantId, apptId);
    });

    const c = await queryTenant(tenantId, `SELECT COUNT(*)::int AS n FROM commission_entries WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantId,
      apptId,
    ]);
    expect(c.rows[0].n).toBe(0);

    await execTenant(tenantId, `DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantId,
      apptId,
    ]);
    await execTenant(tenantId, `DELETE FROM appointments WHERE id = $1`, [apptId]);
    await execTenant(tenantId, `DELETE FROM tenant_settings WHERE tenant_id = $1`, [tenantId]);
  });

  it('com commission_enabled true insere linha e respeita percentual', async () => {
    await execTenant(
      tenantId,
      `INSERT INTO tenant_settings (tenant_id, settings) VALUES ($1, $2::jsonb)
       ON CONFLICT (tenant_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [tenantId, JSON.stringify({ commission_enabled: true })],
    );

    await createCommissionRule(
      tenantId,
      {
        rule_kind: 'percent',
        percent_basis_points: 5000,
        priority: 1,
        active: true,
      },
      undefined,
    );

    const apptId = randomUUID();
    await execTenant(
      tenantId,
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
    await execTenant(
      tenantId,
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,8000,0)`,
      [tenantId, apptId],
    );

    await withTenant(tenantId, async (client) => {
      await createCommissionEntryForCompletedAppointment(client, tenantId, apptId);
    });

    const row = await queryTenant(
      tenantId,
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
    const dup = await queryTenant(tenantId, `SELECT COUNT(*)::int AS n FROM commission_entries WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantId,
      apptId,
    ]);
    expect(dup.rows[0].n).toBe(1);

    await execTenant(tenantId, `DELETE FROM commission_entries WHERE tenant_id = $1 AND appointment_id = $2`, [tenantId, apptId]);
    await execTenant(tenantId, `DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [tenantId, apptId]);
    await execTenant(tenantId, `DELETE FROM appointments WHERE id = $1`, [apptId]);
    await execTenant(tenantId, `DELETE FROM commission_rules WHERE tenant_id = $1`, [tenantId]);
    await execTenant(tenantId, `DELETE FROM tenant_settings WHERE tenant_id = $1`, [tenantId]);
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
    await execTenant(
      tenantId,
      `INSERT INTO tenant_settings (tenant_id, settings) VALUES ($1, $2::jsonb)
       ON CONFLICT (tenant_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [tenantId, JSON.stringify({ commission_enabled: true })],
    );

    const day = '2030-02-01';
    const startsAt = `${day}T14:00:00Z`;
    const endsAt = `${day}T15:00:00Z`;
    const completedAt = `${day}T15:05:00Z`;
    const apptId = randomUUID();
    await execTenant(
      tenantId,
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, branch_id,
         starts_at, ends_at, status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,'completed','api',$9,$10
       )`,
      [apptId, tenantId, customerId, profId, serviceId, branchId, startsAt, endsAt, randomUUID(), completedAt],
    );
    await execTenant(
      tenantId,
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,5000,0)`,
      [tenantId, apptId],
    );
    await execTenant(
      tenantId,
      `INSERT INTO commission_entries (
         tenant_id, appointment_id, professional_id, branch_id, service_id,
         commission_rule_id, base_amount_cents, commission_cents, status
       ) VALUES ($1,$2,$3,$4,$5,NULL,5000,500,'pending')`,
      [tenantId, apptId, profId, branchId, serviceId],
    );

    await computeCashClosingForDate(tenantId, day);
    await computeCashClosingForDate(tenantId, day);

    const n = await queryTenant(tenantId, `SELECT COUNT(*)::int AS c FROM cash_closings WHERE tenant_id = $1 AND closing_date = $2::date`, [
      tenantId,
      day,
    ]);
    expect(n.rows[0].c).toBe(1);

    await execTenant(tenantId, `DELETE FROM commission_entries WHERE tenant_id = $1 AND appointment_id = $2`, [tenantId, apptId]);
    await execTenant(tenantId, `DELETE FROM cash_closings WHERE tenant_id = $1 AND closing_date = $2::date`, [tenantId, day]);
    await execTenant(tenantId, `DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [tenantId, apptId]);
    await execTenant(tenantId, `DELETE FROM appointments WHERE id = $1`, [apptId]);
    await execTenant(tenantId, `DELETE FROM tenant_settings WHERE tenant_id = $1`, [tenantId]);
  });

  it('listCommissionEntries filtra branch_id e paginação', async () => {
    await execTenant(
      tenantId,
      `INSERT INTO tenant_settings (tenant_id, settings) VALUES ($1, $2::jsonb)
       ON CONFLICT (tenant_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [tenantId, JSON.stringify({ commission_enabled: true })],
    );

    const apptA = randomUUID();
    const apptB = randomUUID();
    const otherBranch = randomUUID();
    await execTenant(tenantId, `INSERT INTO branches (id, tenant_id, name, active) VALUES ($1,$2,'Filial',true)`, [
      otherBranch,
      tenantId,
    ]);

    await execTenant(
      tenantId,
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, branch_id,
         starts_at, ends_at, status, source, idempotency_key, completed_at
       ) VALUES
       ($1,$2,$3,$4,$5,$6,'2031-01-01T10:00:00Z','2031-01-01T11:00:00Z','completed','api',$7,'2031-01-01T11:05:00Z'),
       ($8,$2,$3,$4,$5,$9,'2031-01-01T12:00:00Z','2031-01-01T13:00:00Z','completed','api',$10,'2031-01-01T13:05:00Z')`,
      [apptA, tenantId, customerId, profId, serviceId, branchId, randomUUID(), apptB, otherBranch, randomUUID()],
    );
    await execTenant(
      tenantId,
      `INSERT INTO commission_entries (
         tenant_id, appointment_id, professional_id, branch_id, service_id,
         commission_rule_id, base_amount_cents, commission_cents, status
       ) VALUES
       ($1,$2,$3,$4,$5,NULL,1000,100,'pending'),
       ($1,$6,$3,$7,$5,NULL,2000,200,'pending')`,
      [tenantId, apptA, profId, branchId, serviceId, apptB, otherBranch],
    );

    const onlyMatriz = await listCommissionEntries(tenantId, { branch_id: branchId, page: 1, limit: 20 });
    expect(onlyMatriz.total).toBe(1);
    expect(String((onlyMatriz.data[0] as { appointment_id: string }).appointment_id)).toBe(apptA);

    await execTenant(tenantId, `DELETE FROM commission_entries WHERE tenant_id = $1 AND appointment_id = ANY($2::uuid[])`, [
      tenantId,
      [apptA, apptB],
    ]);
    await execTenant(tenantId, `DELETE FROM appointments WHERE id = ANY($1::uuid[])`, [[apptA, apptB]]);
    await execTenant(tenantId, `DELETE FROM branches WHERE id = $1`, [otherBranch]);
    await execTenant(tenantId, `DELETE FROM tenant_settings WHERE tenant_id = $1`, [tenantId]);
  });

  it('patchCommissionEntryStatus pending → approved', async () => {
    await execTenant(
      tenantId,
      `INSERT INTO tenant_settings (tenant_id, settings) VALUES ($1, $2::jsonb)
       ON CONFLICT (tenant_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [tenantId, JSON.stringify({ commission_enabled: true })],
    );

    const apptId = randomUUID();
    await execTenant(
      tenantId,
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, branch_id,
         starts_at, ends_at, status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,
         '2031-02-01T10:00:00Z','2031-02-01T11:00:00Z',
         'completed','api',$7,'2031-02-01T11:05:00Z'
       )`,
      [apptId, tenantId, customerId, profId, serviceId, branchId, randomUUID()],
    );
    await execTenant(
      tenantId,
      `INSERT INTO commission_entries (
         tenant_id, appointment_id, professional_id, branch_id, service_id,
         commission_rule_id, base_amount_cents, commission_cents, status
       ) VALUES ($1,$2,$3,$4,$5,NULL,3000,300,'pending')`,
      [tenantId, apptId, profId, branchId, serviceId],
    );
    const entryRes = await queryTenant(
      tenantId,
      `SELECT id::text AS id FROM commission_entries WHERE tenant_id = $1 AND appointment_id = $2`,
      [tenantId, apptId],
    );
    const entryId = String(entryRes.rows[0].id);

    const updated = await patchCommissionEntryStatus(tenantId, entryId, { status: 'approved' }, undefined);
    expect(String((updated as { status: string }).status)).toBe('approved');

    await execTenant(tenantId, `DELETE FROM commission_entries WHERE tenant_id = $1 AND appointment_id = $2`, [tenantId, apptId]);
    await execTenant(tenantId, `DELETE FROM appointments WHERE id = $1`, [apptId]);
    await execTenant(tenantId, `DELETE FROM tenant_settings WHERE tenant_id = $1`, [tenantId]);
  });

  it('listCommissionEntries outro tenant não vê linhas', async () => {
    const apptId = randomUUID();
    await execTenant(
      tenantId,
      `INSERT INTO tenant_settings (tenant_id, settings) VALUES ($1, $2::jsonb)
       ON CONFLICT (tenant_id) DO UPDATE SET settings = EXCLUDED.settings`,
      [tenantId, JSON.stringify({ commission_enabled: true })],
    );
    await execTenant(
      tenantId,
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, branch_id,
         starts_at, ends_at, status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,
         '2031-03-01T10:00:00Z','2031-03-01T11:00:00Z',
         'completed','api',$7,'2031-03-01T11:05:00Z'
       )`,
      [apptId, tenantId, customerId, profId, serviceId, branchId, randomUUID()],
    );
    await execTenant(
      tenantId,
      `INSERT INTO commission_entries (
         tenant_id, appointment_id, professional_id, branch_id, service_id,
         commission_rule_id, base_amount_cents, commission_cents, status
       ) VALUES ($1,$2,$3,$4,$5,NULL,1000,50,'pending')`,
      [tenantId, apptId, profId, branchId, serviceId],
    );

    const other = await listCommissionEntries(otherTenant, { page: 1, limit: 50 });
    expect(other.data.some((r) => String(r.appointment_id) === apptId)).toBe(false);

    await execTenant(tenantId, `DELETE FROM commission_entries WHERE tenant_id = $1 AND appointment_id = $2`, [tenantId, apptId]);
    await execTenant(tenantId, `DELETE FROM appointments WHERE id = $1`, [apptId]);
    await execTenant(tenantId, `DELETE FROM tenant_settings WHERE tenant_id = $1`, [tenantId]);
  });
});
