import { FastifyInstance } from 'fastify';
import { hasRequiredRole, requireRole } from '../../middlewares/rbac.js';
import { createService, getServiceById, listServices, updateService } from './service.js';

export async function serviceRoutes(app: FastifyInstance) {
  app.get(
    '/services',
    { preHandler: requireRole('viewer') },
    async (request: any) =>
      listServices(request.tenantId, request.query as Record<string, unknown>, {
        allowInactiveListing: hasRequiredRole(request.user?.role as string | undefined, 'manager'),
      }),
  );

  app.get(
    '/services/:serviceId',
    { preHandler: requireRole('viewer') },
    async (request: any) =>
      getServiceById(request.tenantId, request.params.serviceId, {
        allowInactiveDetail: hasRequiredRole(request.user?.role as string | undefined, 'manager'),
      }),
  );

  app.post(
    '/services',
    { preHandler: requireRole('manager') },
    async (request: any, reply) => {
      const created = await createService(request.tenantId, request.body ?? {}, request.user?.sub);
      return reply.code(201).send(created);
    },
  );

  app.patch(
    '/services/:serviceId',
    { preHandler: requireRole('manager') },
    async (request: any) =>
      updateService(request.tenantId, request.params.serviceId, request.body ?? {}, request.user?.sub),
  );
}
