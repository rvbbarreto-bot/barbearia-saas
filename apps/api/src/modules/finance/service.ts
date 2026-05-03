import { z } from 'zod';
import type { PoolClient } from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { writeAuditLog } from '../../shared/audit.js';
import { loadTenantTimeZone } from '../notificationJobs/schedule.js';
import { hasRequiredRole } from '../../middlewares/rbac.js';
import { discountFinanceSchema, settleFinanceSchema } from './schemas.js';

export { balancePaymentMethodSchema, discountFinanceSchema, settleFinanceSchema } from './schemas.js';

async function loadServicePriceForAppointment(
  client: PoolClient,
  tenantId: string,
  serviceId: string,
): Promise<number> {
  const r = await client.query<{ price_cents: string }>(
    `SELECT price_cents::text AS price_cents FROM services WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, serviceId],
  );
  if (!r.rowCount) throw new AppError('SERVICE_NOT_FOUND', 'Serviço não encontrado', 404);
  return Number(r.rows[0].price_cents);
}

async function sumPaidDepositCents(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
): Promise<number> {
  const r = await client.query<{ s: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
       FROM pix_payments
      WHERE tenant_id = $1 AND appointment_id = $2 AND status = 'payment_paid'`,
    [tenantId, appointmentId],
  );
  return Number(r.rows[0]?.s ?? '0');
}

async function upsertFinancialSnapshot(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
  servicePriceCents: number,
  depositPaidCents: number,
  stampDepositNow: boolean,
): Promise<void> {
  await client.query(
    `INSERT INTO appointment_financials
       (tenant_id, appointment_id, service_price_cents, deposit_paid_cents, deposit_recorded_at)
     VALUES (
       $1, $2, $3, $4,
       CASE WHEN $5::boolean AND $4 > 0 THEN now() ELSE NULL END
     )
     ON CONFLICT (tenant_id, appointment_id) DO UPDATE SET
       service_price_cents = CASE
         WHEN appointment_financials.settled_at IS NULL THEN EXCLUDED.service_price_cents
         ELSE appointment_financials.service_price_cents
       END,
       deposit_paid_cents = CASE
         WHEN appointment_financials.settled_at IS NULL THEN GREATEST(appointment_financials.deposit_paid_cents, EXCLUDED.deposit_paid_cents)
         ELSE appointment_financials.deposit_paid_cents
       END,
       deposit_recorded_at = CASE
         WHEN appointment_financials.settled_at IS NULL THEN COALESCE(
           appointment_financials.deposit_recorded_at,
           EXCLUDED.deposit_recorded_at
         )
         ELSE appointment_financials.deposit_recorded_at
       END,
       updated_at = now()`,
    [tenantId, appointmentId, servicePriceCents, depositPaidCents, stampDepositNow],
  );
}

/** Após Pix confirmado: regista sinal e snapshot do preço do serviço. */
export async function recordFinancialDepositPaid(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
  depositCents: number,
): Promise<void> {
  const appt = await client.query<{ service_id: string | null }>(
    `SELECT service_id FROM appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, appointmentId],
  );
  if (!appt.rowCount || !appt.rows[0].service_id) {
    throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento sem serviço associado.', 422);
  }
  const servicePrice = await loadServicePriceForAppointment(client, tenantId, appt.rows[0].service_id);
  await upsertFinancialSnapshot(client, tenantId, appointmentId, servicePrice, depositCents, true);
}

/** Ao concluir serviço: garante linha financeira e reconcilia sinal (Pix) com preço catalogado. */
export async function ensureFinancialOnServiceCompleted(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
): Promise<void> {
  const appt = await client.query<{ service_id: string | null }>(
    `SELECT service_id FROM appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, appointmentId],
  );
  if (!appt.rowCount || !appt.rows[0].service_id) return;

  const servicePrice = await loadServicePriceForAppointment(client, tenantId, appt.rows[0].service_id);
  const deposit = await sumPaidDepositCents(client, tenantId, appointmentId);
  await upsertFinancialSnapshot(client, tenantId, appointmentId, servicePrice, deposit, deposit > 0);
}

function expectedBalanceDueCents(row: {
  service_price_cents: number;
  deposit_paid_cents: number;
  discount_cents: number;
}): number {
  return Math.max(0, row.service_price_cents - row.deposit_paid_cents - row.discount_cents);
}

export async function getAppointmentFinancial(client: PoolClient, tenantId: string, appointmentId: string) {
  const appt = await client.query(
    `SELECT id::text, status::text FROM appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, appointmentId],
  );
  if (!appt.rowCount) throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado', 404);

  const fin = await client.query(
    `SELECT * FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2 LIMIT 1`,
    [tenantId, appointmentId],
  );

  const appointmentRow = appt.rows[0] as { id: string; status: string };
  const financialRow = fin.rows[0] as Record<string, unknown> | undefined;
  const base = financialRow
    ? {
        service_price_cents: Number(financialRow.service_price_cents),
        deposit_paid_cents: Number(financialRow.deposit_paid_cents),
        discount_cents: Number(financialRow.discount_cents),
      }
    : null;

  return {
    appointment_id: appointmentRow.id,
    appointment_status: appointmentRow.status,
    financial: financialRow ?? null,
    balance_due_cents: base ? expectedBalanceDueCents(base) : null,
  };
}

export async function settleAppointmentFinancial(
  tenantId: string,
  appointmentId: string,
  rawBody: unknown,
  actorUserId: string | undefined,
) {
  const data = settleFinanceSchema.parse(rawBody);

  return withTenant(tenantId, async (client) => {
    const appt = await client.query<{ status: string }>(
      `SELECT status::text AS status FROM appointments WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, appointmentId],
    );
    if (!appt.rowCount) throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado', 404);
    if (String(appt.rows[0].status) !== 'completed') {
      throw new AppError(
        'FINANCE_SETTLE_REQUIRES_COMPLETED',
        'Liquidação do saldo só após serviço concluído.',
        409,
      );
    }

    const fin = await client.query(
      `SELECT * FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2 FOR UPDATE`,
      [tenantId, appointmentId],
    );
    if (!fin.rowCount) throw new AppError('FINANCE_NOT_FOUND', 'Linha financeira inexistente.', 404);

    const row = fin.rows[0] as Record<string, unknown>;
    if (row.settled_at) throw new AppError('FINANCE_ALREADY_SETTLED', 'Saldo já liquidado.', 409);

    const base = {
      service_price_cents: Number(row.service_price_cents),
      deposit_paid_cents: Number(row.deposit_paid_cents),
      discount_cents: Number(row.discount_cents),
    };
    const due = expectedBalanceDueCents(base);
    const collected =
      data.balance_collected_cents !== undefined ? data.balance_collected_cents : due;

    if (collected !== due) {
      throw new AppError(
        'FINANCE_BALANCE_MISMATCH',
        `Valor recebido (${collected}) deve igualar saldo pendente (${due}).`,
        422,
      );
    }

    const updated = await client.query(
      `UPDATE appointment_financials SET
          balance_payment_method = $3,
          balance_collected_cents = $4,
          settled_at = now(),
          updated_at = now()
        WHERE tenant_id = $1 AND appointment_id = $2
        RETURNING *`,
      [tenantId, appointmentId, data.balance_payment_method, collected],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'FINANCE_BALANCE_SETTLED',
      entity: 'appointment_financial',
      entityId: appointmentId,
      after: {
        balance_payment_method: data.balance_payment_method,
        balance_collected_cents: collected,
        expected_due_cents: due,
      },
    });

    return updated.rows[0];
  });
}

export type FinanceCaller = { sub?: string; role?: string };

export async function applyAppointmentFinancialDiscount(
  tenantId: string,
  appointmentId: string,
  rawBody: unknown,
  caller?: FinanceCaller,
) {
  const data = discountFinanceSchema.parse(rawBody);
  if (!caller?.sub || !hasRequiredRole(caller.role, 'manager')) {
    throw new AppError('FORBIDDEN', 'Desconto/cortesia apenas gerente ou superior.', 403);
  }

  return withTenant(tenantId, async (client) => {
    const fin = await client.query(
      `SELECT * FROM appointment_financials WHERE tenant_id = $1 AND appointment_id = $2 FOR UPDATE`,
      [tenantId, appointmentId],
    );
    if (!fin.rowCount) throw new AppError('FINANCE_NOT_FOUND', 'Linha financeira não encontrada', 404);
    const row = fin.rows[0] as Record<string, unknown>;
    if (row.settled_at) throw new AppError('FINANCE_ALREADY_SETTLED', 'Não é possível descontar após liquidação.', 409);

    const servicePrice = Number(row.service_price_cents);
    const deposit = Number(row.deposit_paid_cents);
    if (deposit + data.discount_cents > servicePrice) {
      throw new AppError(
        'FINANCE_DISCOUNT_INVALID',
        'Desconto + sinal não pode exceder o preço do serviço.',
        422,
      );
    }

    const updated = await client.query(
      `UPDATE appointment_financials SET
          discount_cents = $3,
          discount_reason = CASE WHEN $3 > 0 THEN $4 ELSE NULL END,
          discount_applied_by_user_id = CASE WHEN $3 > 0 THEN $5::uuid ELSE NULL END,
          updated_at = now()
        WHERE tenant_id = $1 AND appointment_id = $2
        RETURNING *`,
      [tenantId, appointmentId, data.discount_cents, data.discount_reason ?? null, caller.sub],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId: caller.sub,
      action: 'FINANCE_DISCOUNT_APPLIED',
      entity: 'appointment_financial',
      entityId: appointmentId,
      after: {
        discount_cents: data.discount_cents,
        discount_reason: data.discount_reason ?? null,
      },
    });

    return updated.rows[0];
  });
}

const dateStrSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function getDailyFinanceReport(tenantId: string, dateStr: string) {
  const date = dateStrSchema.parse(dateStr);
  return withTenant(tenantId, async (client) => {
    const tz = await loadTenantTimeZone(client, tenantId);

    const counts = await client.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE (starts_at AT TIME ZONE $2)::date = $3::date
             AND status::text NOT IN ('cancelled', 'expired')
         )::int AS scheduled_day,
         COUNT(*) FILTER (
           WHERE (COALESCE(completed_at, updated_at) AT TIME ZONE $2)::date = $3::date
             AND status::text = 'completed'
         )::int AS completed_day,
         COUNT(*) FILTER (
           WHERE (COALESCE(cancelled_at, updated_at) AT TIME ZONE $2)::date = $3::date
             AND status::text = 'cancelled'
         )::int AS cancelled_day,
         COUNT(*) FILTER (
           WHERE (COALESCE(no_show_marked_at, updated_at) AT TIME ZONE $2)::date = $3::date
             AND status::text = 'no_show'
         )::int AS no_show_day
       FROM appointments
      WHERE tenant_id = $1`,
      [tenantId, tz, date],
    );

    const revenueDeposits = await client.query(
      `SELECT COALESCE(SUM(f.deposit_paid_cents), 0)::bigint AS cents
         FROM appointment_financials f
         INNER JOIN appointments a ON a.tenant_id = f.tenant_id AND a.id = f.appointment_id
        WHERE f.tenant_id = $1
          AND a.status::text = 'completed'
          AND f.deposit_recorded_at IS NOT NULL
          AND (f.deposit_recorded_at AT TIME ZONE $3)::date = $2::date`,
      [tenantId, date, tz],
    );

    const revenueBalanceRows = await client.query<{ method: string; cents: string }>(
      `SELECT f.balance_payment_method AS method, COALESCE(SUM(f.balance_collected_cents), 0)::text AS cents
         FROM appointment_financials f
         INNER JOIN appointments a ON a.tenant_id = f.tenant_id AND a.id = f.appointment_id
        WHERE f.tenant_id = $1
          AND a.status::text = 'completed'
          AND f.settled_at IS NOT NULL
          AND (f.settled_at AT TIME ZONE $3)::date = $2::date
        GROUP BY f.balance_payment_method`,
      [tenantId, date, tz],
    );

    const balanceTotal = revenueBalanceRows.rows.reduce((acc, r) => acc + Number(r.cents), 0);
    const depositTotal = Number(revenueDeposits.rows[0]?.cents ?? 0);

    const byMethod: Record<string, number> = {};
    for (const r of revenueBalanceRows.rows) {
      if (r.method) byMethod[r.method] = Number(r.cents);
    }

    return {
      date,
      timezone: tz,
      counts: counts.rows[0],
      revenue: {
        deposit_total_cents: depositTotal,
        balance_total_cents: balanceTotal,
        grand_total_cents: depositTotal + balanceTotal,
        by_balance_method: byMethod,
      },
      note:
        'Receita só conta agendamentos completed; cancelados/no-show excluídos. Sinal no dia deposit_recorded_at; saldo restante no dia settled_at.',
    };
  });
}
