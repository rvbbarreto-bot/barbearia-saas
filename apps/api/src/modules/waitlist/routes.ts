import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../middlewares/rbac.js';
import { cancelWaitlistEntry, createWaitlistEntry, listWaitlistEntries } from './service.js';

export async function waitlistRoutes(app: FastifyInstance) {
  app.get(
    '/waitlist',
    { preHandler: requirePermission('waitlist', 'read') },
    async (request: any) => listWaitlistEntries(request.tenantId, request.query as Record<string, unknown>),
  );

  app.post(
    '/waitlist',
    { preHandler: requirePermission('waitlist', 'create') },
    async (request: any, reply) => {
      const row = await createWaitlistEntry(request.tenantId, request.body, request.user?.sub);
      return reply.code(201).send(row);
    },
  );

  app.patch(
    '/waitlist/:entryId/cancel',
    { preHandler: requirePermission('waitlist', 'cancel') },
    async (request: any) =>
      cancelWaitlistEntry(request.tenantId, request.params.entryId, request.user?.sub),
  );
}
