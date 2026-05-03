import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../middlewares/rbac.js';
import {
  createBusinessHours,
  listBusinessHours,
  removeBusinessHours,
  updateBusinessHours,
} from './service.js';

export async function businessHoursRoutes(app: FastifyInstance) {
  app.get(
    '/professionals/:professionalId/business-hours',
    { preHandler: requirePermission('businessHours', 'read') },
    async (request: any) => {
      return listBusinessHours(request.tenantId, request.params.professionalId);
    },
  );

  app.post(
    '/professionals/:professionalId/business-hours',
    { preHandler: requirePermission('businessHours', 'create') },
    async (request: any, reply) => {
      const created = await createBusinessHours(
        request.tenantId,
        {
          professional_id: request.params.professionalId,
          weekday: request.body?.weekday,
          starts_at: request.body?.starts_at,
          ends_at: request.body?.ends_at,
          slot_interval_minutes: request.body?.slot_interval_minutes,
        },
        request.user?.sub,
      );
      return reply.code(201).send(created);
    },
  );

  app.patch(
    '/professionals/:professionalId/business-hours/:businessHoursId',
    { preHandler: requirePermission('businessHours', 'update') },
    async (request: any) => {
      return updateBusinessHours(request.tenantId, request.params.businessHoursId, request.body ?? {}, request.user?.sub);
    },
  );

  app.delete(
    '/professionals/:professionalId/business-hours/:businessHoursId',
    { preHandler: requirePermission('businessHours', 'remove') },
    async (request: any) => {
      return removeBusinessHours(request.tenantId, request.params.businessHoursId, request.user?.sub);
    },
  );
}
