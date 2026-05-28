import type { PoolClient } from 'pg';
import { runSweepSafely } from '../../infra/workers/safe-sweep.js';
import { pool, withTenant } from '../../infra/db/pool.js';
import { pickOperationalFromSettingsJson } from '../tenantOperational/settings-merge.js';
import { refreshCustomerRestrictionsAfterNoShow } from './customer-restrictions.service.js';

async function applyLatenessForTenant(client: PoolClient, tenantId: string): Promise<void> {
  const ts = await client.query(`SELECT settings FROM tenant_settings WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
  const op = pickOperationalFromSettingsJson(ts.rows[0]?.settings);
  const tol = op.late_tolerance_minutes;

  await client.query(
    `UPDATE appointments
        SET status = 'no_show_pending', updated_at = now()
      WHERE tenant_id = $1
        AND status = 'confirmed'
        AND starts_at + ($2::text || ' minutes')::interval < now()`,
    [tenantId, String(tol)],
  );

  if (!op.advanced_no_show_policy) return;

  const grace = op.auto_no_show_grace_minutes;
  const noteLine = '\n[auto] No-show definitivo (política avançada habilitada no tenant).';

  const autoNs = await client.query(
    `UPDATE appointments
        SET status = 'no_show',
            notes = COALESCE(NULLIF(trim(notes), ''), '') || $4,
            updated_at = now()
      WHERE tenant_id = $1
        AND status = 'no_show_pending'
        AND starts_at + ($2::text || ' minutes')::interval + ($3::text || ' minutes')::interval < now()
      RETURNING customer_id`,
    [tenantId, String(tol), String(grace), noteLine],
  );

  for (const row of autoNs.rows as { customer_id: string }[]) {
    if (row.customer_id) {
      await refreshCustomerRestrictionsAfterNoShow(client, tenantId, row.customer_id);
    }
  }
}

async function runLatenessSweep(): Promise<void> {
  const tenants = await pool.query(`SELECT id FROM tenants WHERE status IN ('trial', 'active')`);
  for (const row of tenants.rows as { id: string }[]) {
    try {
      await withTenant(row.id, async (client) => applyLatenessForTenant(client, row.id));
    } catch (err) {
      console.error('[lateness-worker] tenant sweep failed', { tenant_id: row.id, err });
    }
  }
}

export async function runLatenessSweepOnce(): Promise<void> {
  await runSweepSafely('lateness-worker', runLatenessSweep);
}

let latenessTimer: ReturnType<typeof setInterval> | undefined;

export function startLatenessWorker(): void {
  if (latenessTimer) return;
  const intervalMs = Number(process.env.LATENESS_SWEEP_INTERVAL_MS ?? 45_000);
  void runLatenessSweepOnce();
  latenessTimer = setInterval(() => {
    void runLatenessSweepOnce();
  }, intervalMs);
  console.warn('[lateness-worker] iniciado', { intervalMs });
}
