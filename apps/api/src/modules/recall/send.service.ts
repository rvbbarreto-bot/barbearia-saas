import { z } from 'zod';
import { isRecallEnabledRuntime } from '../../config/env.js';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { writeAuditLog } from '../../shared/audit.js';
import { executeRecallPromotional } from './process-send.js';

const sendBodySchema = z.object({
  source_appointment_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  template_key: z.string().min(2).max(120).optional(),
});

/**
 * Recall promocional via Core API: valida tenant, consentimento (em executeRecallPromotional),
 * grava recall_sends, enfileira message_outbox. Sem Evolution direto.
 * Bloqueado se `RECALL_ENABLED=false`.
 */
export async function requestRecallPromotionalSend(
  tenantId: string,
  rawBody: unknown,
  actorUserId: string | undefined,
) {
  if (!isRecallEnabledRuntime()) {
    throw new AppError(
      'RECALL_DISABLED',
      'Recall promocional desativado (RECALL_ENABLED=false). Não ativar em runtime sem QA e decisão de produto.',
      403,
    );
  }

  const body = sendBodySchema.parse(rawBody);

  return withTenant(tenantId, async (client) => {
    const ap = await client.query<{ customer_id: string }>(
      `SELECT customer_id FROM appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, body.source_appointment_id],
    );
    if (!ap.rowCount) {
      throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado', 404);
    }
    if (String(ap.rows[0].customer_id) !== body.customer_id) {
      throw new AppError(
        'RECALL_CUSTOMER_MISMATCH',
        'customer_id não corresponde ao agendamento fonte.',
        422,
      );
    }

    const ex = await executeRecallPromotional(client, {
      tenantId,
      customerId: body.customer_id,
      sourceAppointmentId: body.source_appointment_id,
      serviceId: body.service_id ?? null,
      templateKeyFromPayload: body.template_key,
    });

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'RECALL_PROMOTIONAL_SEND_API',
      entity: 'recall_send',
      entityId: body.source_appointment_id,
      after: { result: ex.result, reason: ex.lastError ?? null },
    });

    return { result: ex.result, reason: ex.lastError ?? null };
  });
}
