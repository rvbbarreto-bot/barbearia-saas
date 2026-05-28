import { runSweepSafely } from '../../infra/workers/safe-sweep.js';
import { pool } from '../../infra/db/pool.js';
import { expireStaleAppointmentHolds } from './appointment-holds.service.js';

async function runHoldExpirySweep(): Promise<void> {
  const tenants = await pool.query(`SELECT id::text AS id FROM tenants WHERE status IN ('trial', 'active')`);
  for (const row of tenants.rows as { id: string }[]) {
    try {
      await expireStaleAppointmentHolds(row.id);
    } catch (err) {
      console.error('[hold-expiry-worker] tenant sweep failed', { tenant_id: row.id, err });
    }
  }
}

export async function runHoldExpirySweepOnce(): Promise<void> {
  await runSweepSafely('hold-expiry-worker', runHoldExpirySweep);
}

let timer: ReturnType<typeof setInterval> | undefined;

export function startHoldExpiryWorker(): void {
  if (timer) return;
  const intervalMs = Number(process.env.HOLD_EXPIRY_SWEEP_INTERVAL_MS ?? 60_000);
  void runHoldExpirySweepOnce();
  timer = setInterval(() => {
    void runHoldExpirySweepOnce();
  }, intervalMs);
  console.warn('[hold-expiry-worker] iniciado', { intervalMs });
}
