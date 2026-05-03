import { FastifyInstance } from 'fastify';
import { requireRole } from '../../middlewares/rbac.js';
import { createCalendarBlock, deleteCalendarBlock, listCalendarBlocks, updateCalendarBlock } from './service.js';

export async function calendarBlockRoutes(app: FastifyInstance) {
  app.get(
    '/calendar-blocks',
    { preHandler: requireRole('viewer') },
    async (request: any) =>
      listCalendarBlocks(request.tenantId, request.query as Record<string, unknown>),
  );

  app.post(
    '/calendar-blocks',
    { preHandler: requireRole('manager') },
    async (request: any, reply) => {
      const created = await createCalendarBlock(request.tenantId, request.body, request.user?.sub);
      return reply.code(201).send(created);
    },
  );

  app.patch(
    '/calendar-blocks/:blockId',
    { preHandler: requireRole('manager') },
    async (request: any) =>
      updateCalendarBlock(request.tenantId, request.params.blockId, request.body ?? {}, request.user?.sub),
  );

  app.delete(
    '/calendar-blocks/:blockId',
    { preHandler: requireRole('manager') },
    async (request: any, reply) => {
      await deleteCalendarBlock(request.tenantId, request.params.blockId, request.user?.sub);
      return reply.code(204).send();
    },
  );
}
