/**
 * outbox.service.ts
 *
 * Ponto único de enfileiramento de mensagens outbound.
 * Toda mensagem que sai do sistema DEVE passar por aqui — nunca chamar
 * providers externos (Evolution, etc.) diretamente.
 *
 * Contrato do schema message_outbox:
 *   payload  jsonb — conteúdo da mensagem  { text: string; type: 'text' | ... }
 *   metadata jsonb — roteamento/provider   { phone, instance_name, provider }
 */

import { Pool, PoolClient } from 'pg';
import { pool as defaultPool } from '../db/pool.js';

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type OutboundChannel = 'whatsapp';

export type OutboundPayload = {
  type: 'text';
  text: string;
};

export type OutboundMetadata = {
  phone: string;
  instance_name: string;
  provider: 'evolution';
};

export type EnqueueOutboundInput = {
  tenantId: string;
  customerId?: string | null;
  channel?: OutboundChannel;
  payload: OutboundPayload;
  metadata: OutboundMetadata;
  idempotencyKey?: string | null;
  correlationId?: string | null;
  maxAttempts?: number;
};

// ── Implementação ─────────────────────────────────────────────────────────────

/**
 * Enfileira uma mensagem no outbox para envio assíncrono.
 *
 * - Idempotente: se `idempotencyKey` for fornecido e já existir para o mesmo
 *   `tenantId`, o INSERT é ignorado silenciosamente (ON CONFLICT DO NOTHING).
 * - Suporta uso dentro de transação existente: passe `client` para participar
 *   do mesmo contexto transacional (útil para garantia de entrega junto com
 *   mudança de estado de negócio).
 */
export async function enqueueOutboundMessage(
  input: EnqueueOutboundInput,
  client?: PoolClient | Pool,
): Promise<void> {
  const db = client ?? defaultPool;

  await db.query(
    `INSERT INTO message_outbox
       (tenant_id, customer_id, channel, payload, metadata,
        idempotency_key, correlation_id, max_attempts, status, next_retry_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, 'pending', now())
     ON CONFLICT (tenant_id, idempotency_key)
     WHERE idempotency_key IS NOT NULL
     DO NOTHING`,
    [
      input.tenantId,
      input.customerId ?? null,
      input.channel ?? 'whatsapp',
      JSON.stringify(input.payload),
      JSON.stringify(input.metadata),
      input.idempotencyKey ?? null,
      input.correlationId ?? null,
      input.maxAttempts ?? 5,
    ],
  );
}

// ── Compatibilidade retroativa ────────────────────────────────────────────────

/**
 * @deprecated Use enqueueOutboundMessage() diretamente.
 * Mantido para compatibilidade com código legado durante a migração.
 */
export async function enqueueWhatsAppMessage(input: {
  tenantId: string;
  customerId?: string | null;
  body: string;
  idempotencyKey?: string | null;
  instanceName?: string;
  phone?: string;
  correlationId?: string | null;
}): Promise<void> {
  if (!input.instanceName || !input.phone) {
    throw new Error(
      'enqueueWhatsAppMessage: instanceName e phone são obrigatórios',
    );
  }
  return enqueueOutboundMessage({
    tenantId: input.tenantId,
    customerId: input.customerId ?? null,
    payload: { type: 'text', text: input.body },
    metadata: {
      phone: input.phone,
      instance_name: input.instanceName,
      provider: 'evolution',
    },
    idempotencyKey: input.idempotencyKey ?? null,
    correlationId: input.correlationId ?? null,
  });
}
