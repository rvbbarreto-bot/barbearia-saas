import { withTenant } from '../../infra/db/pool.js';
import { NotificationJobType } from '../notificationJobs/types.js';
import { listRecallCandidatesWithClient } from './candidates.service.js';

/**
 * Enfileira jobs `recall_promotional` para candidatos elegíveis (dedupe por agendamento).
 */
export async function enqueueRecallPromotionalJobsForTenant(tenantId: string): Promise<number> {
  return withTenant(tenantId, async (client) => {
    const candidates = await listRecallCandidatesWithClient(client, tenantId, new Date());
    let inserted = 0;

    for (const c of candidates) {
      if (!c.can_send_promotional) continue;

      const pending = await client.query(
        `SELECT 1 FROM notification_jobs
          WHERE tenant_id = $1
            AND appointment_id = $2::uuid
            AND job_type = $3
            AND status IN ('pending', 'processing')
          LIMIT 1`,
        [tenantId, c.source_appointment_id, NotificationJobType.recallPromotional],
      );
      if (pending.rowCount) continue;

      const payload = {
        source_appointment_id: c.source_appointment_id,
        customer_id: c.customer_id,
        service_id: c.service_id,
        template_key: c.template_key,
        purpose: 'recall_promotional',
      };

      await client.query(
        `INSERT INTO notification_jobs
           (tenant_id, job_type, run_at, status, payload, appointment_id, customer_id)
         VALUES ($1, $2, now(), 'pending', $3::jsonb, $4::uuid, $5::uuid)`,
        [
          tenantId,
          NotificationJobType.recallPromotional,
          JSON.stringify(payload),
          c.source_appointment_id,
          c.customer_id,
        ],
      );
      inserted += 1;
    }

    return inserted;
  });
}
