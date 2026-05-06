import { z } from 'zod';
import { withTenant } from '../../infra/db/pool.js';
import { enqueueOutboundMessage } from '../../infra/queues/outbox.service.js';
import { AppError } from '../../shared/errors.js';
import { writeAuditLog } from '../../shared/audit.js';
import { resolveWhatsAppOutboundRouting } from '../notificationJobs/routing.js';

const bodySchema = z.object({
  customer_id: z.string().uuid(),
  text: z.string().min(1).max(4096),
  idempotency_key: z.string().min(8).max(200).optional(),
  correlation_id: z.string().min(8).max(200).optional(),
});

/**
 * Enfileira texto WhatsApp via `message_outbox` (nunca Evolution direto).
 * Tenant vem exclusivamente do JWT / middleware — nunca do corpo.
 */
export async function enqueueIntegrationWhatsappText(
  tenantId: string,
  rawBody: unknown,
  actorUserId: string | undefined,
) {
  const body = bodySchema.parse(rawBody);

  return withTenant(tenantId, async (client) => {
    const routing = await resolveWhatsAppOutboundRouting(client, tenantId, body.customer_id);
    if (!routing) {
      throw new AppError(
        'INTEGRATION_NO_ROUTING',
        'Cliente sem telefone ou tenant sem integração WhatsApp ativa (instance_name).',
        422,
      );
    }

    await enqueueOutboundMessage(
      {
        tenantId,
        customerId: body.customer_id,
        payload: { type: 'text', text: body.text },
        metadata: {
          phone: routing.phone,
          instance_name: routing.instance_name,
          provider: 'evolution',
        },
        idempotencyKey: body.idempotency_key ?? null,
        correlationId: body.correlation_id ?? null,
      },
      client,
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'INTEGRATION_OUTBOUND_WHATSAPP_ENQUEUED',
      entity: 'message_outbox',
      entityId: null,
      after: { customer_id: body.customer_id, text_len: body.text.length },
    });

    return { ok: true as const };
  });
}
