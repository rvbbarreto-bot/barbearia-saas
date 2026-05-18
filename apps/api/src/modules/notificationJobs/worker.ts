import { runSweepSafely } from '../../infra/workers/safe-sweep.js';
import { pool, withTenant } from '../../infra/db/pool.js';
import { enqueueRecallPromotionalJobsForTenant } from '../recall/sweep.service.js';
import { processNotificationJob } from './processor.js';

const STUCK_MINUTES = 15;
const BATCH = 20;

type JobRow = {
  id: string;
  tenant_id: string;
  job_type: string;
  run_at: Date;
  payload: Record<string, unknown>;
  appointment_id: string | null;
  customer_id: string | null;
};

async function runTenantBatch(tenantId: string): Promise<void> {
  await enqueueRecallPromotionalJobsForTenant(tenantId);

  await withTenant(tenantId, async (client) => {
    await client.query(
      `UPDATE notification_jobs
          SET status = 'pending', updated_at = now()
        WHERE tenant_id = $1
          AND status = 'processing'
          AND updated_at < now() - ($2::text || ' minutes')::interval`,
      [tenantId, String(STUCK_MINUTES)],
    );

    const claim = await client.query<JobRow>(
      `WITH cte AS (
         SELECT id
           FROM notification_jobs
          WHERE tenant_id = $1
            AND status = 'pending'
            AND run_at <= now()
          ORDER BY run_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
       )
       UPDATE notification_jobs j
          SET status = 'processing', updated_at = now()
         FROM cte
        WHERE j.id = cte.id
        RETURNING j.id, j.tenant_id, j.job_type, j.run_at, j.payload, j.appointment_id, j.customer_id`,
      [tenantId, BATCH],
    );

    for (const job of claim.rows) {
      await processNotificationJob(client, job);
    }
  });
}

async function runNotificationJobsSweep(): Promise<void> {
  const tenants = await pool.query(`SELECT id::text AS id FROM tenants WHERE status IN ('trial', 'active')`);
  for (const row of tenants.rows as { id: string }[]) {
    try {
      await runTenantBatch(row.id);
    } catch (err) {
      console.error('[notification-jobs-worker] tenant sweep failed', { tenant_id: row.id, err });
    }
  }
}

export async function runNotificationJobsSweepOnce(): Promise<void> {
  await runSweepSafely('notification-jobs-worker', runNotificationJobsSweep);
}

let timer: ReturnType<typeof setInterval> | undefined;

export function startNotificationJobsWorker(): void {
  if (timer) return;
  const intervalMs = Number(process.env.NOTIFICATION_JOBS_POLL_INTERVAL_MS ?? 30_000);
  void runNotificationJobsSweepOnce();
  timer = setInterval(() => {
    void runNotificationJobsSweepOnce();
  }, intervalMs);
  console.warn('[notification-jobs-worker] iniciado', { intervalMs });
}
