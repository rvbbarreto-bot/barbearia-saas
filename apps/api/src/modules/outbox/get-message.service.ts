import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { mapOutboxRow, type OutboxMessageRowDb } from './outbox-row-mapper.js';

export async function getOutboxMessageById(tenantId: string, messageId: string) {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT mo.id, mo.tenant_id, mo.channel, mo.status, mo.attempts, mo.max_attempts, mo.last_error,
              mo.correlation_id, mo.customer_id, mo.idempotency_key, mo.created_at, mo.updated_at, mo.sent_at,
              mo.payload, mo.metadata
         FROM message_outbox mo
        WHERE mo.id = $1 AND mo.tenant_id = $2`,
      [messageId, tenantId],
    );
    if (!r.rowCount) {
      throw new AppError('NOT_FOUND', 'Mensagem não encontrada.', 404);
    }
    return mapOutboxRow(r.rows[0] as OutboxMessageRowDb);
  });
}
