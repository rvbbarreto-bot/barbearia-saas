import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../middlewares/rbac.js';
import {
  createRecurringTimeOff,
  listRecurringTimeOff,
  removeRecurringTimeOff,
  updateRecurringTimeOff,
} from './service.js';

export async function professionalRecurringTimeOffRoutes(app: FastifyInstance) {
  app.get(
    '/professionals/:professionalId/recurring-time-off',
    { preHandler: requirePermission('professionalRecurringTimeOff', 'read') },
    async (request: any) => {
      return listRecurringTimeOff(request.tenantId, request.params.professionalId);
    },
  );

  app.post(
    '/professionals/:professionalId/recurring-time-off',
    { preHandler: requirePermission('professionalRecurringTimeOff', 'create') },
    async (request: any, reply) => {
      const created = await createRecurringTimeOff(
        request.tenantId,
        {
          professional_id: request.params.professionalId,
          weekday: request.body?.weekday,
          starts_at: request.body?.starts_at,
          ends_at: request.body?.ends_at,
          reason: request.body?.reason,
          valid_from: request.body?.valid_from,
          valid_until: request.body?.valid_until,
        },
        request.user?.sub,
      );
      return reply.code(201).send(created);
    },
  );

  app.patch(
    '/professionals/:professionalId/recurring-time-off/:recurringTimeOffId',
    { preHandler: requirePermission('professionalRecurringTimeOff', 'update') },
    async (request: any) => {
      return updateRecurringTimeOff(
        request.tenantId,
        request.params.recurringTimeOffId,
        request.body ?? {},
        request.user?.sub,
      );
    },
  );

  app.delete(
    '/professionals/:professionalId/recurring-time-off/:recurringTimeOffId',
    { preHandler: requirePermission('professionalRecurringTimeOff', 'remove') },
    async (request: any) => {
      return removeRecurringTimeOff(request.tenantId, request.params.recurringTimeOffId, request.user?.sub);
    },
  );
}
