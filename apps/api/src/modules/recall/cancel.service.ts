import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';

/**
 * Regista cancelamento de recall para um agendamento concluído (bloqueia envio futuro).
 * Se já existir envio com `sent_at`, não altera o histórico enviado.
 */
export async function cancelRecallSend(tenantId: string, sourceAppointmentId: string) {
  return withTenant(tenantId, async (client) => {
    const ap = await client.query<{ customer_id: string; service_id: string | null }>(
      `SELECT customer_id, service_id FROM appointments
        WHERE tenant_id = $1 AND id = $2 AND status = 'completed' LIMIT 1`,
      [tenantId, sourceAppointmentId],
    );
    if (!ap.rowCount) {
      throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento concluído não encontrado', 404);
    }
    const { customer_id: customerId, service_id: serviceId } = ap.rows[0];

    const r = await client.query(
      `INSERT INTO recall_sends
         (tenant_id, customer_id, source_appointment_id, service_id, idempotency_key, cancelled_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (tenant_id, source_appointment_id) DO UPDATE
         SET cancelled_at = CASE
           WHEN recall_sends.sent_at IS NULL THEN COALESCE(recall_sends.cancelled_at, EXCLUDED.cancelled_at)
           ELSE recall_sends.cancelled_at
         END,
         updated_at = now()
       RETURNING id, source_appointment_id, sent_at, cancelled_at, created_at`,
      [
        tenantId,
        customerId,
        sourceAppointmentId,
        serviceId,
        `recall_send:${sourceAppointmentId}`,
      ],
    );
    return r.rows[0];
  });
}
