import { FastifyInstance } from 'fastify';
import { requireRole } from '../../middlewares/rbac.js';
import { createUser, deactivateUser, getUserById, listUsers, updateUser } from './service.js';

export async function userRoutes(app: FastifyInstance) {
  app.get(
    '/users',
    { preHandler: requireRole('manager') },
    async (request: any) => listUsers(request.tenantId, request.query as Record<string, unknown>),
  );

  app.get(
    '/users/:userId',
    { preHandler: requireRole('manager') },
    async (request: any) => getUserById(request.tenantId, request.params.userId),
  );

  app.post(
    '/users',
    { preHandler: requireRole('tenant_admin') },
    async (request: any, reply) => {
      const created = await createUser(request.tenantId, request.body);
      return reply.code(201).send(created);
    },
  );

  app.patch(
    '/users/:userId',
    { preHandler: requireRole('tenant_admin') },
    async (request: any) => updateUser(request.tenantId, request.params.userId, request.body ?? {}),
  );

  app.delete(
    '/users/:userId',
    { preHandler: requireRole('tenant_admin') },
    async (request: any, reply) => {
      await deactivateUser(request.tenantId, request.params.userId, request.user?.sub);
      return reply.code(204).send();
    },
  );
}
