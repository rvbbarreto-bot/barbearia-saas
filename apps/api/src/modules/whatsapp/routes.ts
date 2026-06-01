import { randomUUID } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../../shared/errors.js';
import { inboundBodySchema } from './inbound.schemas.js';
import {
  processInboundWebhook,
} from './inbound.service.js';

import { agentDispatchRoutes } from './agent-dispatch.routes.js';

export async function whatsappRoutes(app: FastifyInstance) {
  await agentDispatchRoutes(app);
  app.post('/webhooks/whatsapp/inbound', async (request, reply) => {

    // ── Headers obrigatórios / opcionais ──────────────────────────────────
    const rawInstance = request.headers['x-webhook-instance'];
    const instanceKey = (Array.isArray(rawInstance) ? rawInstance[0] : rawInstance)?.trim();

    if (!instanceKey) {
      return reply.code(400).send({
        error:      'WEBHOOK_INSTANCE_REQUIRED',
        message:    'Header x-webhook-instance é obrigatório',
        request_id: request.id,
      });
    }

    // x-correlation-id: usa o enviado ou gera um novo
    const rawCorr = request.headers['x-correlation-id'];
    const correlationId = (Array.isArray(rawCorr) ? rawCorr[0] : rawCorr) ?? randomUUID();

    // Suporta x-webhook-signature (Evolution) e x-hub-signature-256 (Meta)
    const rawSig =
      request.headers['x-webhook-signature'] ??
      request.headers['x-hub-signature-256'];
    const webhookSignature = Array.isArray(rawSig) ? rawSig[0] : rawSig;

    const rawToken = request.headers['x-webhook-token'];
    const webhookToken = Array.isArray(rawToken) ? rawToken[0] : rawToken;

    // rawBody capturado pelo content-type parser do server.ts
    const rawBody =
      (request as unknown as { rawBody?: string }).rawBody ??
      JSON.stringify(request.body);

    // ── Validação do body ─────────────────────────────────────────────────
    let body;
    try {
      body = inboundBodySchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({
          error:      'PAYLOAD_INVALID',
          message:    'Payload inbound inválido',
          issues:     err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          request_id: request.id,
        });
      }
      throw err;
    }

    // ── Processamento ─────────────────────────────────────────────────────
    try {
      const result = await processInboundWebhook(body, {
        instanceKey,
        rawBody,
        webhookToken,
        webhookSignature,
        correlationId,
        ip: request.ip,
        requestId: request.id,
      });

      // Log estruturado sem expor segredos
      request.log.info({
        event:          'whatsapp_inbound',
        instance_key:   instanceKey,
        correlation_id: correlationId,
        duplicate:      result.duplicate,
        ...(!result.duplicate && {
          tenant_id:   result.tenantId,
          customer_id: result.customerId,
          message_id:  result.messageId,
        }),
      });

      if (result.duplicate) {
        return reply.code(200).send({ ok: true, duplicate: true });
      }

      return reply.code(200).send({
        ok: true,
        duplicate: false,
        tenantId: result.tenantId,
        customerId: result.customerId,
        messageId: result.messageId,
        conversationContext: result.conversationContext,
        agentDispatch: result.agentDispatch,
      });

    } catch (err) {
      if (err instanceof AppError) {
        // Loga sem expor segredo (token/HMAC nunca entra no log)
        request.log.warn({
          event:          'whatsapp_inbound_rejected',
          code:           err.code,
          instance_key:   instanceKey,
          correlation_id: correlationId,
        });
        return reply.code(err.statusCode).send({
          error:      err.code,
          message:    err.message,
          request_id: request.id,
        });
      }
      throw err;
    }
  });
}
