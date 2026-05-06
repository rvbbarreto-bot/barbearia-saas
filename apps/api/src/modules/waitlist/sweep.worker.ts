import { env } from '../../config/env.js';
import { runWaitlistSweepAllTenants } from './sweep.service.js';

/**
 * Varredura periódica waitlist → `notification_jobs` → processador → `message_outbox`.
 * Requer `WAITLIST_SWEEP_ENABLED` e `WAITLIST_SLOT_NOTIFY_ENABLED` (env).
 */
export function startWaitlistSweepWorker(): () => void {
  if (!env.WAITLIST_SWEEP_ENABLED || !env.WAITLIST_SLOT_NOTIFY_ENABLED) {
    return () => {};
  }

  const timer = setInterval(() => {
    runWaitlistSweepAllTenants().catch((err) => {
      console.error('[waitlist-sweep]', err instanceof Error ? err.message : err);
    });
  }, env.WAITLIST_SWEEP_INTERVAL_MS);

  return () => clearInterval(timer);
}
