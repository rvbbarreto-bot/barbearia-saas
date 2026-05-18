import { FastifyInstance } from 'fastify';
import { requireRole } from '../../middlewares/rbac.js';
import { createVehicle, getVehicleById, listVehicles, updateVehicle } from './service.js';

function callerFromRequest(request: { user?: { sub?: string; role?: string }; id?: string }) {
  return {
    sub: request.user?.sub,
    role: request.user?.role,
    requestId: request.id,
    correlationId: request.id,
  };
}

export async function vehicleRoutes(app: FastifyInstance) {
  app.get(
    '/vehicles',
    { preHandler: requireRole('attendant') },
    async (request: any) => listVehicles(request.tenantId, request.query as Record<string, unknown>),
  );

  app.get(
    '/vehicles/:vehicleId',
    { preHandler: requireRole('attendant') },
    async (request: any) => getVehicleById(request.tenantId, request.params.vehicleId),
  );

  app.post(
    '/vehicles',
    { preHandler: requireRole('attendant') },
    async (request: any, reply) => {
      const created = await createVehicle(request.tenantId, request.body, callerFromRequest(request));
      return reply.code(201).send(created);
    },
  );

  app.patch(
    '/vehicles/:vehicleId',
    { preHandler: requireRole('attendant') },
    async (request: any) =>
      updateVehicle(
        request.tenantId,
        request.params.vehicleId,
        request.body ?? {},
        callerFromRequest(request),
      ),
  );
}
