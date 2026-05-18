import { FastifyInstance } from 'fastify';
import { requireRole } from '../../middlewares/rbac.js';
import { createCustomer, getCustomerById, listCustomers, updateCustomer } from './service.js';
import { getCustomerOverview } from './overview.js';

export async function customerRoutes(app: FastifyInstance) {
  app.get(
    '/customers',
    { preHandler: requireRole('attendant') },
    async (request: any) => listCustomers(request.tenantId, request.query as Record<string, unknown>),
  );

  app.get(
    '/customers/:customerId',
    { preHandler: requireRole('attendant') },
    async (request: any) => getCustomerById(request.tenantId, request.params.customerId),
  );

  app.get(
    '/customers/:customerId/overview',
    { preHandler: requireRole('attendant') },
    async (request: any) => getCustomerOverview(request.tenantId, request.params.customerId),
  );

  app.post(
    '/customers',
    { preHandler: requireRole('attendant') },
    async (request: any, reply) => {
      const created = await createCustomer(request.tenantId, request.body, request.user?.sub);
      return reply.code(201).send(created);
    },
  );

  app.patch(
    '/customers/:customerId',
    { preHandler: requireRole('attendant') },
    async (request: any) =>
      updateCustomer(request.tenantId, request.params.customerId, request.body ?? {}, request.user?.sub),
  );
}
