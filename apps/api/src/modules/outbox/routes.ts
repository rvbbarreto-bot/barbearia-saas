import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../middlewares/rbac.js';
import { resolveCorrelationId } from '../../shared/request-correlation.js';
import { getOutboxMessageById } from './get-message.service.js';
import { listOutboxMessages } from './list-messages.service.js';
import { retryOutboxMessage } from './retry-message.service.js';

export async function outboxRoutes(app: FastifyInstance) {
  app.get(
    '/outbox/messages',
    { preHandler: requirePermission('outbox', 'read') },
    async (request: any) => listOutboxMessages(request.tenantId, request.query as Record<string, unknown>),
  );

  app.get(
    '/outbox/messages/:id',
    { preHandler: requirePermission('outbox', 'read') },
    async (request: any) => getOutboxMessageById(request.tenantId, request.params.id as string),
  );

  app.post(
    '/outbox/messages/:id/retry',
    { preHandler: requirePermission('outbox', 'retry') },
    async (request: any, reply) => {
      const u = request.user as { sub?: string; role?: string } | undefined;
      const body = await retryOutboxMessage(request.tenantId, request.params.id as string, {
        actorUserId: u?.sub ?? null,
        actorRole: u?.role ?? null,
        requestId: request.requestId ?? request.id,
        correlationId:
          resolveCorrelationId(request.headers as Record<string, unknown>) ?? undefined,
      });
      return reply.code(200).send(body);
    },
  );
}
