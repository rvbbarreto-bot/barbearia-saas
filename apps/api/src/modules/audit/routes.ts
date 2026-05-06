import { FastifyInstance } from 'fastify';
import { requireRole } from '../../middlewares/rbac.js';
import { listAuditLogs } from './service.js';

export async function auditRoutes(app: FastifyInstance) {
  app.get(
    '/audit-logs',
    { preHandler: requireRole('tenant_admin') },
    async (request: any) => listAuditLogs(request.tenantId as string, request.query as Record<string, unknown>),
  );
}
