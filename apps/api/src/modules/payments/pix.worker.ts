import { runSweepSafely } from '../../infra/workers/safe-sweep.js';
import { pool } from '../../infra/db/pool.js';
import { expirePendingPixPaymentsForTenant } from './pix.service.js';

async function runPixPaymentExpirySweep(): Promise<void> {
  const tenants = await pool.query(`SELECT id::text AS id FROM tenants WHERE status IN ('trial', 'active')`);
  for (const row of tenants.rows as { id: string }[]) {
    try {
      await expirePendingPixPaymentsForTenant(row.id);
    } catch (err) {
      console.error('[pix-expiry-worker] tenant sweep failed', { tenant_id: row.id, err });
    }
  }
}

export async function runPixPaymentExpirySweepOnce(): Promise<void> {
  await runSweepSafely('pix-expiry-worker', runPixPaymentExpirySweep);
}

let timer: ReturnType<typeof setInterval> | undefined;

export function startPixPaymentExpiryWorker(): void {
  if (timer) return;
  const intervalMs = Number(process.env.PIX_EXPIRY_SWEEP_INTERVAL_MS ?? 60_000);
  void runPixPaymentExpirySweepOnce();
  timer = setInterval(() => {
    void runPixPaymentExpirySweepOnce();
  }, intervalMs);
  console.warn('[pix-expiry-worker] iniciado', { intervalMs });
}
