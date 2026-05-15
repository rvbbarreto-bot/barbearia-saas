import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../middlewares/rbac.js';
import { listOutboxMessages } from './list-messages.service.js';

export async function outboxRoutes(app: FastifyInstance) {
  app.get(
    '/outbox/messages',
    { preHandler: requirePermission('outbox', 'read') },
    async (request: any) => listOutboxMessages(request.tenantId, request.query as Record<string, unknown>),
  );
}
