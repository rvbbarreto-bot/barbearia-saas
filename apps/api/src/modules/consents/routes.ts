import { FastifyInstance } from 'fastify';
import { requireRole } from '../../middlewares/rbac.js';
import { grantConsent, listConsents, revokeConsent } from './service.js';

export async function consentRoutes(app: FastifyInstance) {
  app.get(
    '/customers/:customerId/consents',
    { preHandler: requireRole('attendant') },
    async (request: any) => listConsents(request.tenantId, request.params.customerId),
  );

  app.post(
    '/customers/:customerId/consents',
    { preHandler: requireRole('attendant') },
    async (request: any, reply) => {
      const result = await grantConsent(
        request.tenantId,
        request.params.customerId,
        request.body,
        request.user?.sub,
      );
      return reply.code(201).send(result);
    },
  );

  app.patch(
    '/customers/:customerId/consents/:consentId/revoke',
    { preHandler: requireRole('attendant') },
    async (request: any) =>
      revokeConsent(request.tenantId, request.params.customerId, request.params.consentId, request.user?.sub),
  );
}
