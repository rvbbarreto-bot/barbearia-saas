/**
 * Requer DATABASE_URL, JWT_SECRET, REDIS_URL (.env) e migration `020_finance_minimum_pilot.sql` aplicada.
 * Valida liquidação, desconto, relatório e isolamento por tenant contra PostgreSQL real.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { withTenant } from '../../infra/db/pool.js';

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

  let getAppointmentFinancial: typeof import('./service.js').getAppointmentFinancial;
  let settleAppointmentFinancial: typeof import('./service.js').settleAppointmentFinancial;
  let applyAppointmentFinancialDiscount: typeof import('./service.js').applyAppointmentFinancialDiscount;
  let getDailyFinanceReport: typeof import('./service.js').getDailyFinanceReport;
  let ensureFinancialOnServiceCompleted: typeof import('./service.js').ensureFinancialOnServiceCompleted;
  let listAppointmentFinancials: typeof import('./service.js').listAppointmentFinancials;

  async function tenantSql(tenantId: string, text: string, params?: unknown[]) {
    await withTenant(tenantId, async (c) => {
      await c.query(text, params);
    });
  }

  async function purgeTenant(tenantId: string) {
    await withTenant(tenantId, async (c) => {
      await c.query(`DELETE FROM appointment_financials WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM appointments WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM services WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM customers WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM professionals WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantId]);
      await c.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    });
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
    getAppointmentFinancial = mod.getAppointmentFinancial;
    settleAppointmentFinancial = mod.settleAppointmentFinancial;
    applyAppointmentFinancialDiscount = mod.applyAppointmentFinancialDiscount;
    getDailyFinanceReport = mod.getDailyFinanceReport;
    ensureFinancialOnServiceCompleted = mod.ensureFinancialOnServiceCompleted;
    listAppointmentFinancials = mod.listAppointmentFinancials;

    await purgeTenant(tenantA);
    await purgeTenant(tenantB);

    const slugA = `fin-a-${tenantA.slice(0, 8)}`;
    const slugB = `fin-b-${tenantB.slice(0, 8)}`;

    await pool.query(
      `INSERT INTO tenants (id, legal_name, trade_name, plan_code, status, slug)
       VALUES ($1,'Fin A Ltd','Fin A','trial','active',$2), ($3,'Fin B Ltd','Fin B','trial','active',$4)`,
      [tenantA, slugA, tenantB, slugB],
    );

    await withTenant(tenantA, async (c) => {
      await c.query(
        `INSERT INTO users (id, tenant_id, name, email, password_hash, role)
         VALUES ($1,$2,'Gestor Fin','finmgr_${managerUserId.slice(0, 8)}@example.test','unused','manager')`,
        [managerUserId, tenantA],
      );

      await c.query(
        `INSERT INTO professionals (id, tenant_id, name, slug, active) VALUES
         ($1,$2,'P1',$3,true),
         ($4,$2,'P2',$5,true)`,
        [prof1, tenantA, `pf1-${prof1.slice(0, 6)}`, prof2, `pf2-${prof2.slice(0, 6)}`],
      );

      await c.query(
        `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in) VALUES ($1,$2,'Cliente Fin',$3,true)`,
        [customerId, tenantA, `5511${customerId.slice(0, 8)}999`],
      );

      await c.query(
        `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active) VALUES ($1,$2,'Corte',30,10000,true)`,
        [serviceId, tenantA],
      );
    });
  });

  afterAll(async () => {
    await purgeTenant(tenantA);
    await purgeTenant(tenantB);
    await pool.end();
  });

  it('saldo pendente: preço - sinal - desconto', async () => {
    const apptId = randomUUID();
    await tenantSql(tenantA,
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
    await tenantSql(tenantA,
      `INSERT INTO appointment_financials (
         tenant_id, appointment_id, service_price_cents, deposit_paid_cents, discount_cents
       ) VALUES ($1,$2,10000,2500,500)`,
      [tenantA, apptId],
    );

    const row = await withTenant(tenantA, async (c) => getAppointmentFinancial(c, tenantA, apptId));
    expect(row.balance_due_cents).toBe(7000);

    await tenantSql(tenantA,`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await tenantSql(tenantA,`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('liquidação: rejeita valor abaixo do saldo (parcial)', async () => {
    const apptId = randomUUID();
    await tenantSql(tenantA,
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
    await tenantSql(tenantA,
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

    await tenantSql(tenantA,`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await tenantSql(tenantA,`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('liquidação: rejeita valor acima do saldo', async () => {
    const apptId = randomUUID();
    await tenantSql(tenantA,
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
    await tenantSql(tenantA,
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

    await tenantSql(tenantA,`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await tenantSql(tenantA,`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('liquidação: sucesso com valor total implícito', async () => {
    const apptId = randomUUID();
    await tenantSql(tenantA,
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
    await tenantSql(tenantA,
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,6000,1000)`,
      [tenantA, apptId],
    );

    const settled = await settleAppointmentFinancial(tenantA, apptId, { balance_payment_method: 'debit' }, managerUserId);
    expect(Number((settled as { balance_collected_cents: unknown }).balance_collected_cents)).toBe(5000);
    expect((settled as { balance_payment_method: string }).balance_payment_method).toBe('debit');
    expect((settled as { settled_at: unknown }).settled_at).toBeTruthy();

    await tenantSql(tenantA,`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await tenantSql(tenantA,`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('liquidação: bloqueada se appointment não está completed', async () => {
    const apptId = randomUUID();
    await tenantSql(tenantA,
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
    await tenantSql(tenantA,
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,3000,0)`,
      [tenantA, apptId],
    );

    await expect(
      settleAppointmentFinancial(tenantA, apptId, { balance_payment_method: 'cash' }, managerUserId),
    ).rejects.toMatchObject({ code: 'FINANCE_SETTLE_REQUIRES_COMPLETED', statusCode: 409 });

    await tenantSql(tenantA,`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await tenantSql(tenantA,`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('desconto: Zod rejeita motivo curto quando há desconto', async () => {
    const apptId = randomUUID();
    await tenantSql(tenantA,
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
         status, source, idempotency_key, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         '2029-10-30T14:00:00Z','2029-10-30T15:00:00Z',
         'completed','api',$6,'2029-10-30T15:05:00Z'
       )`,
      [apptId, tenantA, customerId, prof1, serviceId, randomUUID()],
    );
    await tenantSql(tenantA,
      `INSERT INTO appointment_financials (tenant_id, appointment_id, service_price_cents, deposit_paid_cents)
       VALUES ($1,$2,5000,0)`,
      [tenantA, apptId],
    );

    await expect(
      applyAppointmentFinancialDiscount(
        tenantA,
        apptId,
        { discount_cents: 100, discount_reason: 'curto' },
        { sub: managerUserId, role: 'manager' },
      ),
    ).rejects.toBeTruthy();

    await tenantSql(tenantA,`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await tenantSql(tenantA,`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('desconto: professional é bloqueado na camada de serviço', async () => {
    const apptId = randomUUID();
    await tenantSql(tenantA,
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
    await tenantSql(tenantA,
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

    await tenantSql(tenantA,`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await tenantSql(tenantA,`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('desconto: manager reduz saldo e valida teto (sinal + desconto ≤ preço)', async () => {
    const apptId = randomUUID();
    await tenantSql(tenantA,
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
    await tenantSql(tenantA,
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

    await tenantSql(tenantA,`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await tenantSql(tenantA,`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('ensureFinancialOnServiceCompleted cria linha reconciliando preço do serviço', async () => {
    const apptId = randomUUID();
    await tenantSql(tenantA,
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

    await tenantSql(tenantA,`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantA,
      apptId,
    ]);
    await tenantSql(tenantA,`DELETE FROM appointments WHERE id = $1`, [apptId]);
  });

  it('relatório diário: receita só em completed; cancelado/no_show não entram na receita', async () => {
    const completedId = randomUUID();
    const cancelledId = randomUUID();
    const noShowId = randomUUID();

    await tenantSql(tenantA,
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

    await tenantSql(tenantA,
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

    await tenantSql(tenantA,
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

    await tenantSql(tenantA,
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

    await tenantSql(tenantA,
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

    await tenantSql(tenantA,`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = ANY($2::uuid[])`, [
      tenantA,
      [completedId, cancelledId],
    ]);
    for (const id of [completedId, cancelledId, noShowId]) {
      await tenantSql(tenantA,`DELETE FROM appointments WHERE id = $1`, [id]);
    }
  });

  it('listagem: filtro período e financial_status + isolamento tenant', async () => {
    const apptOpen = randomUUID();
    const apptSettled = randomUUID();
    const dayStart = '2029-11-01T00:00:00Z';
    const dayEnd = '2029-11-02T00:00:00Z';

    await tenantSql(tenantA,
      `INSERT INTO appointments (
         id, tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
         status, source, idempotency_key, completed_at
       ) VALUES
       ($1,$2,$3,$4,$5,'2029-11-01T10:00:00Z','2029-11-01T11:00:00Z','completed','api',$6,'2029-11-01T11:05:00Z'),
       ($7,$2,$3,$4,$5,'2029-11-01T12:00:00Z','2029-11-01T13:00:00Z','completed','api',$8,'2029-11-01T13:05:00Z')`,
      [apptOpen, tenantA, customerId, prof1, serviceId, randomUUID(), apptSettled, randomUUID()],
    );
    await tenantSql(tenantA,
      `INSERT INTO appointment_financials (
         tenant_id, appointment_id, service_price_cents, deposit_paid_cents, settled_at
       ) VALUES
       ($1,$2,8000,1000,NULL),
       ($1,$3,8000,0,'2029-11-01T14:00:00Z')`,
      [tenantA, apptOpen, apptSettled],
    );

    const openOnly = await listAppointmentFinancials(tenantA, {
      from: dayStart,
      to: dayEnd,
      financial_status: 'open',
      page: 1,
      limit: 50,
    });
    expect(openOnly.data.some((r) => r.appointment_id === apptOpen)).toBe(true);
    expect(openOnly.data.some((r) => r.appointment_id === apptSettled)).toBe(false);

    const settledOnly = await listAppointmentFinancials(tenantA, {
      from: dayStart,
      to: dayEnd,
      financial_status: 'settled',
      page: 1,
      limit: 50,
    });
    expect(settledOnly.data.some((r) => r.appointment_id === apptSettled)).toBe(true);

    const tenantBList = await listAppointmentFinancials(tenantB, {
      from: dayStart,
      to: dayEnd,
      page: 1,
      limit: 50,
    });
    expect(tenantBList.data.some((r) => r.appointment_id === apptOpen)).toBe(false);

    const byProf = await listAppointmentFinancials(tenantA, {
      professional_id: prof2,
      page: 1,
      limit: 50,
    });
    expect(byProf.data.some((r) => r.appointment_id === apptOpen)).toBe(false);

    await tenantSql(tenantA,`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = ANY($2::uuid[])`, [
      tenantA,
      [apptOpen, apptSettled],
    ]);
    await tenantSql(tenantA,`DELETE FROM appointments WHERE id = ANY($1::uuid[])`, [[apptOpen, apptSettled]]);
  });

  it('relatório não mistura tenants', async () => {
    const custB = randomUUID();
    const profB = randomUUID();
    await tenantSql(tenantB,
      `INSERT INTO professionals (id, tenant_id, name, slug, active) VALUES ($1,$2,'PB',$3,true)`,
      [profB, tenantB, `pb-${profB.slice(0, 6)}`],
    );
    await tenantSql(tenantB,
      `INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in) VALUES ($1,$2,'CB',$3,true)`,
      [custB, tenantB, `5521${custB.slice(0, 8)}888`],
    );

    const svcB = randomUUID();
    await tenantSql(tenantB,
      `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active) VALUES ($1,$2,'SrvB',30,99999,true)`,
      [svcB, tenantB],
    );

    const apptB = randomUUID();
    await tenantSql(tenantB,
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
    await tenantSql(tenantB,
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

    await tenantSql(tenantB,`DELETE FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2`, [
      tenantB,
      apptB,
    ]);
    await tenantSql(tenantB,`DELETE FROM appointments WHERE id = $1`, [apptB]);
    await tenantSql(tenantB,`DELETE FROM services WHERE id = $1`, [svcB]);
    await tenantSql(tenantB,`DELETE FROM customers WHERE id = $1`, [custB]);
    await tenantSql(tenantB,`DELETE FROM professionals WHERE id = $1`, [profB]);
  });
});
