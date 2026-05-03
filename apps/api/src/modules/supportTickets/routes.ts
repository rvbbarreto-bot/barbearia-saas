import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../middlewares/rbac.js';
import {
  claimSupportTicket,
  closeSupportTicket,
  createSupportTicket,
  getSupportTicket,
  listSupportTickets,
  sendSupportTicketMessage,
} from './service.js';

function clientIp(request: { ip?: string; headers: Record<string, unknown> }): string | null {
  const fwd = request.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0]!.trim();
  return request.ip ?? null;
}

export async function supportTicketRoutes(app: FastifyInstance) {
  app.get(
    '/support-tickets',
    { preHandler: requirePermission('supportTickets', 'read') },
    async (request: any) => listSupportTickets(request.tenantId, request.query as Record<string, unknown>),
  );

  app.get(
    '/support-tickets/:ticketId',
    { preHandler: requirePermission('supportTickets', 'read') },
    async (request: any) => getSupportTicket(request.tenantId, request.params.ticketId),
  );

  app.post(
    '/support-tickets',
    { preHandler: requirePermission('supportTickets', 'create') },
    async (request: any, reply) => {
      const row = await createSupportTicket(
        request.tenantId,
        request.body,
        request.user?.sub,
        clientIp(request),
      );
      return reply.code(201).send(row);
    },
  );

  app.patch(
    '/support-tickets/:ticketId/claim',
    { preHandler: requirePermission('supportTickets', 'claim') },
    async (request: any) =>
      claimSupportTicket(request.tenantId, request.params.ticketId, request.user.sub, clientIp(request)),
  );

  app.post(
    '/support-tickets/:ticketId/messages',
    { preHandler: requirePermission('supportTickets', 'message') },
    async (request: any) =>
      sendSupportTicketMessage(
        request.tenantId,
        request.params.ticketId,
        request.body,
        request.user.sub,
        clientIp(request),
      ),
  );

  app.patch(
    '/support-tickets/:ticketId/close',
    { preHandler: requirePermission('supportTickets', 'close') },
    async (request: any) =>
      closeSupportTicket(
        request.tenantId,
        request.params.ticketId,
        request.body,
        request.user.sub,
        clientIp(request),
      ),
  );
}
