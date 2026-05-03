import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../middlewares/rbac.js';
import { createPixPaymentForHold, getPixPaymentById } from './pix.service.js';
import { processPixPaymentWebhook } from './pix-webhook.service.js';

export async function paymentRoutes(app: FastifyInstance) {
  app.post(
    '/payments/pix',
    { preHandler: requirePermission('appointments', 'create') },
    async (request: any, reply) => {
      const result = await createPixPaymentForHold(request.tenantId, request.body, {
        sub: request.user?.sub,
        role: (request.user as { role?: string })?.role,
      });
      if (result.duplicate) {
        return reply.code(200).send(result);
      }
      return reply.code(201).send(result);
    },
  );

  app.get(
    '/payments/pix/:paymentId',
    { preHandler: requirePermission('appointments', 'read') },
    async (request: any) => getPixPaymentById(request.tenantId, request.params.paymentId),
  );
}

/** Registar antes do hook global de JWT (rota pública). */
export async function pixWebhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/payments/pix', async (request, reply) => {
    const rawBody =
      (request as unknown as { rawBody?: string }).rawBody ??
      JSON.stringify((request as { body?: unknown }).body ?? {});
    const result = await processPixPaymentWebhook(rawBody, request.headers as Record<string, unknown>);
    return reply.code(200).send(result);
  });
}
