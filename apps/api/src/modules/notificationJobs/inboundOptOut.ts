import type { PoolClient } from 'pg';
import { matchOptOutKeyword } from './keywords.js';
import { writeAuditLog } from '../../shared/audit.js';

/**
 * Regista opt-out de marketing e recall via palavras-chave no WhatsApp.
 * Cria duas linhas em `consents` (canal WhatsApp, finalidades marketing e recall) com `granted = false`
 * e data em `created_at`; actualiza o cliente.
 */
export async function recordInboundOptOutIfNeeded(
  client: PoolClient,
  tenantId: string,
  customerId: string,
  messageText: string,
  ip?: string,
): Promise<string | null> {
  const key = matchOptOutKeyword(messageText);
  if (!key) return null;

  const source = `inbound_opt_out:${key}`;

  await client.query(
    `INSERT INTO consents (tenant_id, customer_id, channel, purpose, granted, source)
     VALUES
       ($1, $2, 'whatsapp', 'marketing', false, $3),
       ($1, $2, 'whatsapp', 'recall', false, $3)`,
    [tenantId, customerId, source],
  );

  await client.query(
    `UPDATE customers
        SET whatsapp_opt_out = true, whatsapp_opt_in = false, updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, customerId],
  );

  await writeAuditLog(client, {
    tenantId,
    action: 'CONSENT_REVOKED',
    entity: 'customer',
    entityId: customerId,
    after: {
      channel: 'whatsapp',
      purposes: ['marketing', 'recall'],
      source,
      opt_out_keywords: key,
    },
    ip,
  });

  return key;
}
