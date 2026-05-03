import type { PoolClient } from 'pg';
import { AppError } from '../../shared/errors.js';
import { hasRequiredRole } from '../../middlewares/rbac.js';
import { pickOperationalFromSettingsJson } from '../tenantOperational/settings-merge.js';

export type BookingCaller = { sub?: string; role?: string };

/**
 * Após no-show (manual ou automático avançado), recalcula restrições por reincidência na janela configurada.
 */
export async function refreshCustomerRestrictionsAfterNoShow(
  client: PoolClient,
  tenantId: string,
  customerId: string,
): Promise<void> {
  const ts = await client.query(`SELECT settings FROM tenant_settings WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
  const op = pickOperationalFromSettingsJson(ts.rows[0]?.settings);

  const cnt = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM appointments
      WHERE tenant_id = $1 AND customer_id = $2 AND status = 'no_show'
        AND updated_at >= now() - ($3::int * interval '1 day')`,
    [tenantId, customerId, op.no_show_history_window_days],
  );
  const n = (cnt.rows[0] as { n: number }).n;
  if (n < op.no_show_threshold_for_restriction) return;

  const reqDep = op.auto_require_deposit_after_threshold;
  await client.query(
    `INSERT INTO customer_restrictions (tenant_id, customer_id, requires_deposit, manual_booking_only, updated_at)
     VALUES ($1, $2, $3, true, now())
     ON CONFLICT (tenant_id, customer_id) DO UPDATE SET
       requires_deposit = EXCLUDED.requires_deposit,
       manual_booking_only = true,
       updated_at = now()`,
    [tenantId, customerId, reqDep],
  );
}

export async function assertCustomerBookingAllowed(
  client: PoolClient,
  tenantId: string,
  customerId: string,
  caller: BookingCaller | undefined,
): Promise<void> {
  const r = await client.query(
    `SELECT requires_deposit, manual_booking_only
       FROM customer_restrictions
      WHERE tenant_id = $1 AND customer_id = $2
      LIMIT 1`,
    [tenantId, customerId],
  );
  if (!r.rowCount) return;
  const row = r.rows[0] as { requires_deposit: boolean; manual_booking_only: boolean };
  const isStaff = !!caller?.sub && hasRequiredRole(caller.role, 'attendant');

  if (row.manual_booking_only && !isStaff) {
    throw new AppError(
      'CUSTOMER_RESTRICTED_MANUAL_ONLY',
      'Este cliente requer aprovação humana para agendar. Contacte o balcão.',
      422,
    );
  }
  if (row.requires_deposit && !isStaff) {
    throw new AppError(
      'CUSTOMER_DEPOSIT_REQUIRED',
      'Cliente sujeito a sinal — o agendamento automático não está disponível. Contacte o balcão.',
      422,
    );
  }
}
