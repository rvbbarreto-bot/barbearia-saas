/**
 * inbound.service.ts
 *
 * Lógica de negócio do webhook WhatsApp inbound.
 *
 * Contrato de segurança:
 *  - tenant_id NO CORPO É IGNORADO. Tenant é resolvido exclusivamente por
 *    x-webhook-instance → tenant_integrations.
 *  - HMAC-SHA256 tem precedência sobre token fixo.
 *  - Mensagem duplicada detectada por external_message_id (preferencial) ou
 *    por SHA-256 do payload bruto (fallback).
 *  - correlation_id gerado internamente se o header x-correlation-id estiver ausente.
 */

import { createHash } from 'node:crypto';
import pg from 'pg';
import { getIntegrationLookupPool, pool as defaultPool, withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { writeAuditLog } from '../../shared/audit.js';
import { writeOperationalAuditEvent } from '../../shared/operational-audit.js';
import { recordInboundOptOutIfNeeded } from '../notificationJobs/inboundOptOut.js';
import { verifySha256WebhookSignature } from '../../shared/webhook-hmac.js';
import type { InboundBody } from './inbound.schemas.js';

export type { InboundBody } from './inbound.schemas.js';
export { inboundBodySchema } from './inbound.schemas.js';

// ── Tipos internos ────────────────────────────────────────────────────────────

export type InboundContext = {
  instanceKey:      string;
  rawBody:          string;
  webhookToken:     string | undefined;
  /** x-webhook-signature (Evolution) ou x-hub-signature-256 (Meta) */
  webhookSignature: string | undefined;
  correlationId:    string;
  ip:               string;
  /** request.id Fastify (auditoria operacional) */
  requestId?:       string | null;
};

type IntegrationRow = {
  tenant_id:     string;
  webhook_token: string | null;
  hmac_secret:   string | null;
};

export type InboundResult =
  | { ok: true; duplicate: false; messageId: string; customerId: string; tenantId: string }
  | { ok: true; duplicate: true };

// ── HMAC ──────────────────────────────────────────────────────────────────────

export function verifyHmac(
  secret: string,
  rawBody: string,
  signatureHeader: string,
): boolean {
  return verifySha256WebhookSignature(secret, rawBody, signatureHeader);
}

// ── Serviço principal ─────────────────────────────────────────────────────────

export async function processInboundWebhook(
  body: InboundBody,
  ctx:  InboundContext,
  _db:  pg.Pool = defaultPool,
): Promise<InboundResult> {

  // ── 1. Resolver tenant (nunca confia em body.tenant_id) ────────────────────
  const integration = await getIntegrationLookupPool().query<IntegrationRow>(
    `SELECT ti.tenant_id::text AS tenant_id,
            t.webhook_token,
            ti.hmac_secret
       FROM tenant_integrations ti
       JOIN tenants t ON t.id = ti.tenant_id
      WHERE ti.is_active = true
        AND ti.provider IN ('whatsapp_evolution', 'evolution')
        AND (
          ti.config->>'instance_name' = $1
          OR ti.config->>'instance_id'   = $1
        )
      LIMIT 1`,
    [ctx.instanceKey],
  );

  if (!integration.rowCount) {
    throw new AppError('WEBHOOK_INSTANCE_UNKNOWN', 'Instância WhatsApp não cadastrada', 404);
  }

  const { tenant_id: tenantId, webhook_token: expectedToken, hmac_secret: hmacSecret } =
    integration.rows[0];

  // ── 2. Validação de assinatura ─────────────────────────────────────────────
  if (hmacSecret) {
    // Instância com HMAC: obrigatório (x-webhook-signature ou x-hub-signature-256)
    if (!ctx.webhookSignature) {
      throw new AppError(
        'WEBHOOK_SIGNATURE_REQUIRED',
        'Header x-webhook-signature (ou x-hub-signature-256) obrigatório quando HMAC está configurado',
        401,
      );
    }
    if (!verifyHmac(hmacSecret, ctx.rawBody, ctx.webhookSignature)) {
      throw new AppError('WEBHOOK_SIGNATURE_INVALID', 'Assinatura HMAC inválida', 401);
    }
  } else {
    // Fallback: token fixo via x-webhook-token
    if (!ctx.webhookToken || ctx.webhookToken !== expectedToken) {
      throw new AppError('INVALID_WEBHOOK_TOKEN', 'Webhook token inválido ou ausente', 401);
    }
  }

  // ── 3. Idempotência ────────────────────────────────────────────────────────
  const PROVIDER = 'whatsapp_evolution';
  const payloadSha = createHash('sha256').update(ctx.rawBody).digest('hex');
  // Usa external_message_id se disponível; caso contrário usa SHA-256 do payload
  const dedupKey = body.external_message_id ?? `sha256:${payloadSha}`;

  const dedup = await withTenant(tenantId, async (client) =>
    client.query(
      `INSERT INTO webhook_events
         (tenant_id, provider, external_message_id, payload_sha256, processed_at)
       VALUES ($1::uuid, $2, $3, $4, now())
       ON CONFLICT (tenant_id, provider, external_message_id) DO NOTHING
       RETURNING true AS inserted`,
      [tenantId, PROVIDER, dedupKey, payloadSha],
    ),
  );

  if (!dedup.rowCount) {
    await withTenant(tenantId, async (client) => {
      await writeOperationalAuditEvent(client, {
        tenantId,
        entityType: 'whatsapp_inbound',
        entityId: null,
        eventType: 'inbound_duplicate_ignored',
        source: 'webhook',
        requestId: ctx.requestId ?? null,
        correlationId: ctx.correlationId,
        metadata: { dedup_key: dedupKey, instance_key: ctx.instanceKey },
      });
    });
    return { ok: true, duplicate: true };
  }

  // ── 4. Persistência dentro do contexto do tenant (RLS) ────────────────────
  let customerId!: string;
  let messageId!: string;

  await withTenant(tenantId, async (client) => {
    // 4a. Upsert customer
    const customerResult = await client.query<{ id: string }>(
      `INSERT INTO customers (tenant_id, phone, name, last_interaction_at, whatsapp_opt_in)
       VALUES ($1, $2, $3, now(), true)
       ON CONFLICT (tenant_id, phone) DO UPDATE
         SET name                = COALESCE(EXCLUDED.name, customers.name),
             last_interaction_at = now()
       RETURNING id`,
      [tenantId, body.phone, body.name ?? null],
    );
    customerId = customerResult.rows[0].id;

    // 4b. Inserir mensagem (payload + channel obrigatórios)
    const msgResult = await client.query<{ id: string }>(
      `INSERT INTO messages
         (tenant_id, customer_id, direction, channel, body, payload, external_message_id)
       VALUES ($1, $2, 'in', 'whatsapp', $3, $4::jsonb, $5)
       RETURNING id`,
      [
        tenantId,
        customerId,
        body.message,
        JSON.stringify({
          type:     'text',
          text:     body.message,
          provider: PROVIDER,
        }),
        body.external_message_id ?? null,
      ],
    );
    messageId = msgResult.rows[0].id;

    await recordInboundOptOutIfNeeded(client, tenantId, customerId, body.message, ctx.ip);

    // 4c. Upsert conversation_state → 'awaiting_intent'
    //     Respeita human_handoff: atualiza só o updated_at se já estiver em handoff.
    await client.query(
      `INSERT INTO conversation_states
         (tenant_id, customer_id, state_key, payload, updated_at)
       VALUES ($1, $2, 'awaiting_intent', '{}', now())
       ON CONFLICT (tenant_id, customer_id, state_key) DO UPDATE
         SET updated_at = now()`,
      [tenantId, customerId],
    );

    // 4d. Audit log
    await writeAuditLog(client, {
      tenantId,
      action:   'WHATSAPP_INBOUND_RECEIVED',
      entity:   'message',
      entityId: messageId,
      after: {
        customer_id:         customerId,
        phone:               body.phone,
        external_message_id: body.external_message_id ?? null,
        instance_key:        ctx.instanceKey,
        correlation_id:      ctx.correlationId,
        dedup_key:           dedupKey,
      },
      ip: ctx.ip,
    });

    const phoneDigits = body.phone.replace(/\D/g, '');
    const phoneLast4 = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : '****';
    await writeOperationalAuditEvent(client, {
      tenantId,
      entityType: 'message',
      entityId: messageId,
      eventType: 'inbound_message_received',
      source: 'webhook',
      requestId: ctx.requestId ?? null,
      correlationId: ctx.correlationId,
      metadata: {
        phone_last4: phoneLast4,
        external_message_id: body.external_message_id ?? null,
        instance_key: ctx.instanceKey,
      },
    });
  });

  return { ok: true, duplicate: false, messageId, customerId, tenantId };
}
