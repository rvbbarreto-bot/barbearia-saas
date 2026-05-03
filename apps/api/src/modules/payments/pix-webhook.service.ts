import { createHash } from 'node:crypto';
import { withTenant } from '../../infra/db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { verifySha256WebhookSignature } from '../../shared/webhook-hmac.js';
import {
  applyPixWebhookExpiredForCharge,
  applyPixWebhookFailedForCharge,
  applyPixWebhookPaid,
  applyPixWebhookRefundedForCharge,
} from './pix.service.js';
import { pixWebhookBodySchema, type PixWebhookBody } from './pix-webhook.schemas.js';

const PROVIDER = 'pix_psp';

export type PixWebhookResult =
  | { ok: true; duplicate: true }
  | { ok: true; duplicate: false; handled: 'paid' | 'expired' | 'failed' | 'refunded' };

function readSignatureHeader(headers: Record<string, unknown>): string | undefined {
  const raw =
    headers['x-pix-signature'] ??
    headers['x-webhook-signature'] ??
    headers['x-hub-signature-256'];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === 'string' ? raw : undefined;
}

export async function processPixPaymentWebhook(
  rawBody: string,
  headers: Record<string, unknown>,
): Promise<PixWebhookResult> {
  if (env.NODE_ENV === 'production' && !env.PIX_WEBHOOK_SECRET) {
    throw new AppError(
      'PIX_WEBHOOK_NOT_CONFIGURED',
      'PIX_WEBHOOK_SECRET é obrigatório em produção.',
      503,
    );
  }

  const secret = env.PIX_WEBHOOK_SECRET;
  const sig = readSignatureHeader(headers);

  if (secret) {
    if (!sig) {
      throw new AppError(
        'PIX_WEBHOOK_SIGNATURE_REQUIRED',
        'Header x-pix-signature (ou x-webhook-signature) obrigatório.',
        401,
      );
    }
    if (!verifySha256WebhookSignature(secret, rawBody, sig)) {
      throw new AppError('PIX_WEBHOOK_SIGNATURE_INVALID', 'Assinatura HMAC inválida.', 401);
    }
  }

  let body: PixWebhookBody;
  try {
    body = pixWebhookBodySchema.parse(JSON.parse(rawBody));
  } catch {
    throw new AppError('PIX_WEBHOOK_INVALID_JSON', 'Corpo JSON inválido.', 400);
  }

  const payloadSha = createHash('sha256').update(rawBody).digest('hex');
  const dedupKey = body.delivery_id ?? `sha256:${payloadSha}`;

  return withTenant(body.tenant_id, async (client) => {
    const pay = await client.query(
      `SELECT id FROM pix_payments
        WHERE tenant_id = $1 AND provider_charge_id = $2 LIMIT 1`,
      [body.tenant_id, body.provider_charge_id],
    );
    if (!pay.rowCount) {
      throw new AppError('PIX_PAYMENT_NOT_FOUND', 'Cobrança Pix não encontrada para este tenant.', 404);
    }

    const dedup = await client.query(
      `INSERT INTO webhook_events
         (tenant_id, provider, external_message_id, payload_sha256, processed_at)
       VALUES ($1::uuid, $2, $3, $4, now())
       ON CONFLICT (tenant_id, provider, external_message_id) DO NOTHING
       RETURNING true AS inserted`,
      [body.tenant_id, PROVIDER, dedupKey, payloadSha],
    );

    if (!dedup.rowCount) {
      return { ok: true as const, duplicate: true as const };
    }

    switch (body.event) {
      case 'paid': {
        const r = await applyPixWebhookPaid(client, body.tenant_id, body.provider_charge_id, null);
        if (!r.ok) {
          throw new AppError('PIX_WEBHOOK_REJECTED', `Evento pago rejeitado: ${r.reason}`, 409);
        }
        return { ok: true as const, duplicate: false as const, handled: 'paid' as const };
      }
      case 'expired': {
        const r = await applyPixWebhookExpiredForCharge(client, body.tenant_id, body.provider_charge_id);
        if (!r.ok) {
          throw new AppError('PIX_WEBHOOK_REJECTED', `Evento expirado rejeitado: ${r.reason}`, 409);
        }
        return { ok: true as const, duplicate: false as const, handled: 'expired' as const };
      }
      case 'failed': {
        const r = await applyPixWebhookFailedForCharge(client, body.tenant_id, body.provider_charge_id);
        if (!r.ok) {
          throw new AppError('PIX_WEBHOOK_REJECTED', `Evento falha rejeitado: ${r.reason}`, 409);
        }
        return { ok: true as const, duplicate: false as const, handled: 'failed' as const };
      }
      case 'refunded': {
        const r = await applyPixWebhookRefundedForCharge(client, body.tenant_id, body.provider_charge_id);
        if (!r.ok) {
          throw new AppError('PIX_WEBHOOK_REJECTED', `Evento reembolso rejeitado: ${r.reason}`, 409);
        }
        return { ok: true as const, duplicate: false as const, handled: 'refunded' as const };
      }
      default:
        throw new AppError('PIX_WEBHOOK_UNKNOWN_EVENT', 'Evento desconhecido.', 400);
    }
  });
}
