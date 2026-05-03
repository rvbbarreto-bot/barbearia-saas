import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../middlewares/rbac.js';
import { createTimeOff, listTimeOff, removeTimeOff, updateTimeOff } from './service.js';

export async function professionalTimeOffRoutes(app: FastifyInstance) {
  app.get(
    '/professionals/:professionalId/time-off',
    { preHandler: requirePermission('professionalTimeOff', 'read') },
    async (request: any) => {
      return listTimeOff(request.tenantId, request.params.professionalId);
    },
  );

  app.post(
    '/professionals/:professionalId/time-off',
    { preHandler: requirePermission('professionalTimeOff', 'create') },
    async (request: any, reply) => {
      const created = await createTimeOff(
        request.tenantId,
        {
          professional_id: request.params.professionalId,
          starts_at: request.body?.starts_at,
          ends_at: request.body?.ends_at,
          reason: request.body?.reason,
        },
        request.user?.sub,
      );
      return reply.code(201).send(created);
    },
  );

  app.patch(
    '/professionals/:professionalId/time-off/:timeOffId',
    { preHandler: requirePermission('professionalTimeOff', 'update') },
    async (request: any) => {
      return updateTimeOff(request.tenantId, request.params.timeOffId, request.body ?? {}, request.user?.sub);
    },
  );

  app.delete(
    '/professionals/:professionalId/time-off/:timeOffId',
    { preHandler: requirePermission('professionalTimeOff', 'remove') },
    async (request: any) => {
      return removeTimeOff(request.tenantId, request.params.timeOffId, request.user?.sub);
    },
  );
}
