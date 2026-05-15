import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { writeOperationalAuditEvent } from '../../shared/operational-audit.js';

/**
 * Re-enfileira envio manual: apenas `failed` ou `dead`.
 * Não altera `idempotency_key` nem marca como `sent` (o worker confirma após o provider).
 */
export async function retryOutboxMessage(
  tenantId: string,
  messageId: string,
  ctx: { actorUserId?: string | null; actorRole?: string | null; requestId?: string | null },
) {
  return withTenant(tenantId, async (client) => {
    const cur = await client.query<{ status: string }>(
      `SELECT status FROM message_outbox WHERE id = $1 AND tenant_id = $2`,
      [messageId, tenantId],
    );
    if (!cur.rowCount) {
      throw new AppError('NOT_FOUND', 'Mensagem não encontrada.', 404);
    }
    const st = cur.rows[0]!.status;
    if (st !== 'failed' && st !== 'dead') {
      throw new AppError(
        'OUTBOX_RETRY_NOT_ALLOWED',
        'Retry manual só é permitido para mensagens em estado failed ou dead.',
        409,
      );
    }

    const up = await client.query(
      `UPDATE message_outbox
          SET status = 'pending',
              next_retry_at = now(),
              updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND status IN ('failed', 'dead')
        RETURNING id, correlation_id`,
      [messageId, tenantId],
    );
    if (!up.rowCount) {
      throw new AppError(
        'OUTBOX_RETRY_NOT_ALLOWED',
        'Estado alterado; não foi possível re-enfileirar.',
        409,
      );
    }

    await writeOperationalAuditEvent(client, {
      tenantId,
      entityType: 'message_outbox',
      entityId: messageId,
      eventType: 'OUTBOX_MANUAL_RETRY',
      actorUserId: ctx.actorUserId ?? null,
      actorRole: ctx.actorRole ?? null,
      source: 'api',
      requestId: ctx.requestId ?? null,
      correlationId: up.rows[0]?.correlation_id ?? null,
      metadata: { previous_status: st },
    });

    return { id: messageId, status: 'pending' as const };
  });
}
