/**
 * Requer DATABASE_URL, JWT_SECRET, REDIS_URL (.env) e migration `020_finance_minimum_pilot.sql` aplicada.
 * Valida liquidação, desconto, relatório e isolamento por tenant contra PostgreSQL real.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const run =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.JWT_SECRET) &&
  Boolean(process.env.REDIS_URL);

describe.skipIf(!run)('finance service integration (migration 020)', () => {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    max: 5,
  });

  const REPORT_DAY = '2029-10-15';
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const managerUserId = randomUUID();
  const customerId = randomUUID();
  const prof1 = randomUUID();
  const prof2 = randomUUID();
  const serviceId = randomUUID();

  let withTenant: typeof import('../../infra/db/pool.js').withTenant;
  let getAppointmentFinancial: typeof import('./service.js').getAppointmentFinancial;
  let settleAppointmentFinancial: typeof import('./service.js').settleAppointmentFinancial;
  let applyAppointmentFinancialDiscount: typeof import('./service.js').applyAppointmentFinancialDiscount;
  let getDailyFinanceReport: typeof import('./service.js').getDailyFinanceReport;
  let ensureFinancialOnServiceCompleted: typeof import('./service.js').ensureFinancialOnServiceCompleted;

  async function purgeTenant(tenantId: string) {
    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM appointments WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM services WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM customers WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM professionals WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
  }

  beforeAll(async () => {
    const chk = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'appointment_financials' LIMIT 1`,
    );
    if (!chk.rowCount) {
      await pool.end();
      throw new Error(
        'Tabela appointment_financials inexistente: aplique database/migrations/020_finance_minimum_pilot.sql em DEV antes destes testes.',
      );
    }

    const mod = await import('./service.js');
    const poolMod = await import('../../infra/db/pool.js');
    withTenant = poolMod.withTenant;
    getAppointmentFinancial = mod.getAppointmentFinancial;
    settleAppointmentFinancial = mod.settleAppointmentFinancial;
    applyAppointmentFinancialDiscount = mod.applyAppointmentFinancialDiscount;
    getDailyFinanceReport = mod.getDailyFinanceReport;
    ensureFinancialOnServiceCompleted = mod.ensureFinancialOnServiceCompleted;

    await purgeTenant(tenantA);
    await purgeTenant(tenantB);

    const slugA = `fin-a-${tenantA.slice(0, 8)}`;
    const slugB = `fin-b-${tenantB.slice(0, 8)}`;

    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug)
       VALUES ($1,'Fin A Ltd','Fin A','trial','active',$2), ($3,'Fin B Ltd','Fin B','trial','active',$4)`,
      [tenantA, slugA, tenantB, slugB],
    );

    await pool.query(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, role)
       VALUES ($1,$2,'Gestor Fin','finmgr_${managerUserId.slice(0, 8)}@example.test','unused','manager')`,
      [managerUserId, tenantA],
    );

    await pool.query(
      `INSERT INTO professionals (id, tenant_id, name, slug, active) VALUES
       ($1,$2,'P1',$3,true),
       ($4,$2,'P2',$5,true)`,
      [prof1, tenantA, `pf1-${prof1.slice(0, 6)}`, prof2, `pf2-${prof2.slice(0, 6)}`],
    );

    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in) VALUES ($1,$2,'Cliente Fin',$3,true)`,
      [customerId, tenantA, `5511${customerId.slice(0, 8)}999`],
    );

    await pool.query(
      `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active) VALUES ($1,$2,'Corte',30,10000,true)`,
      [serviceId, tenantA],
    );
  });

  afterAll(async () => {
    await purgeTenant(tenantA);
    await purgeTenant(tenantB);
    await pool.end();
  });

  it('saldo pendente: preço - sinal - desconto', async () => {
    const apptId = randomUUID();
    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
         status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         '2029-10-15T14:00:00Z','2029-10-15T15:00:00Z',
         'completed','api',$6,'2029-10-15T15:05:00Z'
       )`,
      [apptId, tenantA, customerId, prof1, serviceId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO appointment_financials (
         tenant_id, appointment_id, service_price_cents, deposit_paid_cents, discount_cents
       ) VALUES ($1,$2,10000,2500,500)`,
      [tenantA, apptId],
    );

    const row = await withTenant(tenantA, async (c) => getAppointmentFinancial(c, tenantA, apptId));
    expect(row.balance_due_cents).toBe(7000);

    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('liquidação: rejeita valor abaixo do saldo (parcial)', async () => {
    const apptId = randomUUID();
    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
         status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         '2029-10-16T14:00:00Z','2029-10-16T15:00:00Z',
         'completed','api',$6,'2029-10-16T15:05:00Z'
       )`,
      [apptId, tenantA, customerId, prof1, serviceId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,8000,0)`,
      [tenantA, apptId],
    );

    await expect(
      settleAppointmentFinancial(
        tenantA,
        apptId,
        { balance_payment_method: 'cash', balance_collected_cents: 4000 },
        managerUserId,
      ),
    ).rejects.toMatchObject({
      code: 'FINANCE_BALANCE_MISMATCH',
    });

    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('liquidação: rejeita valor acima do saldo', async () => {
    const apptId = randomUUID();
    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
         status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         '2029-10-17T14:00:00Z','2029-10-17T15:00:00Z',
         'completed','api',$6,'2029-10-17T15:05:00Z'
       )`,
      [apptId, tenantA, customerId, prof1, serviceId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,8000,0)`,
      [tenantA, apptId],
    );

    await expect(
      settleAppointmentFinancial(
        tenantA,
        apptId,
        { balance_payment_method: 'pix', balance_collected_cents: 9000 },
        managerUserId,
      ),
    ).rejects.toMatchObject({ code: 'FINANCE_BALANCE_MISMATCH' });

    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('liquidação: sucesso com valor total implícito', async () => {
    const apptId = randomUUID();
    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
         status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         '2029-10-18T14:00:00Z','2029-10-18T15:00:00Z',
         'completed','api',$6,'2029-10-18T15:05:00Z'
       )`,
      [apptId, tenantA, customerId, prof1, serviceId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,6000,1000)`,
      [tenantA, apptId],
    );

    const settled = await settleAppointmentFinancial(tenantA, apptId, { balance_payment_method: 'debit' }, managerUserId);
    expect(Number((settled as { balance_collected_cents: unknown }).balance_collected_cents)).toBe(5000);
    expect((settled as { balance_payment_method: string }).balance_payment_method).toBe('debit');
    expect((settled as { settled_at: unknown }).settled_at).toBeTruthy();

    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('liquidação: bloqueada se appointment não está completed', async () => {
    const apptId = randomUUID();
    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
         status, source, idempotency_key
       ) VALUES (
         $1,$2,$3,$4,$5,
         '2029-10-19T14:00:00Z','2029-10-19T15:00:00Z',
         'confirmed','api',$6
       )`,
      [apptId, tenantA, customerId, prof1, serviceId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,3000,0)`,
      [tenantA, apptId],
    );

    await expect(
      settleAppointmentFinancial(tenantA, apptId, { balance_payment_method: 'cash' }, managerUserId),
    ).rejects.toMatchObject({ code: 'FINANCE_SETTLE_REQUIRES_COMPLETED', statusCode: 409 });

    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('desconto: professional é bloqueado na camada de serviço', async () => {
    const apptId = randomUUID();
    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
         status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         '2029-10-20T14:00:00Z','2029-10-20T15:00:00Z',
         'completed','api',$6,'2029-10-20T15:05:00Z'
       )`,
      [apptId, tenantA, customerId, prof1, serviceId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,5000,0)`,
      [tenantA, apptId],
    );

    await expect(
      applyAppointmentFinancialDiscount(
        tenantA,
        apptId,
        { discount_cents: 500, discount_reason: 'Motivo autorizado pelo card' },
        { sub: managerUserId, role: 'professional' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });

    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('desconto: manager reduz saldo e valida teto (sinal + desconto ≤ preço)', async () => {
    const apptId = randomUUID();
    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
         status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         '2029-10-21T14:00:00Z','2029-10-21T15:00:00Z',
         'completed','api',$6,'2029-10-21T15:05:00Z'
       )`,
      [apptId, tenantA, customerId, prof1, serviceId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,4000,3500)`,
      [tenantA, apptId],
    );

    await expect(
      applyAppointmentFinancialDiscount(tenantA, apptId, {
        discount_cents: 800,
        discount_reason: 'Desconto acima do permitido neste caso',
      }, { sub: managerUserId, role: 'manager' }),
    ).rejects.toMatchObject({ code: 'FINANCE_DISCOUNT_INVALID' });

    await applyAppointmentFinancialDiscount(
      tenantA,
      apptId,
      { discount_cents: 500, discount_reason: 'Cortesia autorizada equipe' },
      { sub: managerUserId, role: 'manager' },
    );

    const row = await withTenant(tenantA, async (c) => getAppointmentFinancial(c, tenantA, apptId));
    expect(row.balance_due_cents).toBe(0);

    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('ensureFinancialOnServiceCompleted cria linha reconciliando preço do serviço', async () => {
    const apptId = randomUUID();
    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
         status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         '2029-10-22T14:00:00Z','2029-10-22T15:00:00Z',
         'completed','api',$6,'2029-10-22T15:05:00Z'
       )`,
      [apptId, tenantA, customerId, prof1, serviceId, randomUUID()],
    );

    await withTenant(tenantA, async (c) =>
      ensureFinancialOnServiceCompleted(c, tenantA, apptId),
    );

    const row = await withTenant(tenantA, async (c) => getAppointmentFinancial(c, tenantA, apptId));
    expect(row.financial).toBeTruthy();
    expect(Number((row.financial as { service_price_cents: unknown }).service_price_cents)).toBe(10000);

    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('relatório diário: receita só em completed; cancelado/no_show não entram na receita', async () => {
    const completedId = randomUUID();
    const cancelledId = randomUUID();
    const noShowId = randomUUID();

    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
         status, source, idempotency_key,
         completed_at, cancelled_at, no_show_marked_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         '2029-10-15T16:00:00Z','2029-10-15T17:00:00Z',
         'completed','api',$6,
         '2029-10-15T17:05:00Z',NULL,NULL
       )`,
      [completedId, tenantA, customerId, prof1, serviceId, randomUUID()],
    );

    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
         status, source, idempotency_key,
         cancelled_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         '2029-10-15T18:00:00Z','2029-10-15T19:00:00Z',
         'cancelled','api',$6,
         '2029-10-15T19:00:00Z'
       )`,
      [cancelledId, tenantA, customerId, prof2, serviceId, randomUUID()],
    );

    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
         status, source, idempotency_key,
         no_show_marked_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         '2029-10-15T20:00:00Z','2029-10-15T21:00:00Z',
         'no_show','api',$6,
         '2029-10-15T21:00:00Z'
       )`,
      [noShowId, tenantA, customerId, prof2, serviceId, randomUUID()],
    );

    await pool.query(
      `INSERT INTO appointment_financials (
         tenant_id, appointment_id, service_price_cents, deposit_paid_cents,
         deposit_recorded_at, settled_at, balance_payment_method, balance_collected_cents
       ) VALUES (
         $1,$2,10000,2000,
         '2029-10-15T12:00:00Z',
         '2029-10-15T13:00:00Z',
         'cash',8000
       )`,
      [tenantA, completedId],
    );

    await pool.query(
      `INSERT INTO appointment_financials (
         tenant_id, appointment_id, service_price_cents, deposit_paid_cents,
         deposit_recorded_at, settled_at, balance_payment_method, balance_collected_cents
       ) VALUES (
         $1,$2,5000,5000,
         '2029-10-15T12:00:00Z',
         '2029-10-15T13:00:00Z',
         'pix',0
       )`,
      [tenantA, cancelledId],
    );

    const report = await getDailyFinanceReport(tenantA, REPORT_DAY);
    expect(Number(report.counts.completed_day)).toBeGreaterThanOrEqual(1);
    expect(Number(report.counts.cancelled_day)).toBeGreaterThanOrEqual(1);
    expect(Number(report.counts.no_show_day)).toBeGreaterThanOrEqual(1);

    expect(report.revenue.grand_total_cents).toBe(10000);
    expect(report.revenue.deposit_total_cents).toBe(2000);
    expect(report.revenue.balance_total_cents).toBe(8000);
    expect(report.revenue.by_balance_method.cash).toBe(8000);

    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = ANY($2::uuid[])`, [
      tenantA,
      [completedId, cancelledId],
    ]);
    for (const id of [completedId, cancelledId, noShowId]) {
      await pool.query(`DELETE FROM appointments WHERE id = $1`, [id]);
    }
  });

  it('relatório não mistura tenants', async () => {
    const custB = randomUUID();
    const profB = randomUUID();
    await pool.query(
      `INSERT INTO professionals (id, tenant_id, name, slug, active) VALUES ($1,$2,'PB',$3,true)`,
      [profB, tenantB, `pb-${profB.slice(0, 6)}`],
    );
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in) VALUES ($1,$2,'CB',$3,true)`,
      [custB, tenantB, `5521${custB.slice(0, 8)}888`],
    );

    const svcB = randomUUID();
    await pool.query(
      `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active) VALUES ($1,$2,'SrvB',30,99999,true)`,
      [svcB, tenantB],
    );

    const apptB = randomUUID();
    await pool.query(
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
         status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         '2029-10-15T10:00:00Z','2029-10-15T11:00:00Z',
         'completed','api',$6,'2029-10-15T11:05:00Z'
       )`,
      [apptB, tenantB, custB, profB, svcB, randomUUID()],
    );
    await pool.query(
      `INSERT INTO appointment_financials (
         tenant_id, appointment_id, service_price_cents, deposit_paid_cents,
         deposit_recorded_at, settled_at, balance_payment_method, balance_collected_cents
       ) VALUES (
         $1,$2,99999,0,
         '2029-10-15T09:00:00Z',
         '2029-10-15T09:30:00Z',
         'credit',99999
       )`,
      [tenantB, apptB],
    );

    const reportA = await getDailyFinanceReport(tenantA, REPORT_DAY);
    expect(reportA.revenue.balance_total_cents).not.toBe(99999);

    await pool.query(`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantB,
      apptB,
    ]);
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [apptB]);
    await pool.query(`DELETE FROM services WHERE id = $1`, [svcB]);
    await pool.query(`DELETE FROM customers WHERE id = $1`, [custB]);
    await pool.query(`DELETE FROM professionals WHERE id = $1`, [profB]);
  });
});
