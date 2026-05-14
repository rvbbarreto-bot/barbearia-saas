import { FastifyInstance } from 'fastify';
import { requirePermission, requireRole } from '../../middlewares/rbac.js';
import { enqueueIntegrationWhatsappText } from './outbound.service.js';
import { getMessageOutboxStatusSummary } from './outbox-summary.service.js';

export async function integrationsRoutes(app: FastifyInstance) {
  app.get(
    '/integrations/outbound/outbox-summary',
    { preHandler: requireRole('manager') },
    async (request: any) => getMessageOutboxStatusSummary(request.tenantId),
  );

  app.post(
    '/integrations/outbound/whatsapp-text',
    { preHandler: requirePermission('integrations', 'enqueueOutbound') },
    async (request: any, reply) => {
      const row = await enqueueIntegrationWhatsappText(
        request.tenantId,
        request.body,
        request.user?.sub,
      );
      return reply.code(row.duplicate ? 200 : 202).send(row);
    },
  );
}
