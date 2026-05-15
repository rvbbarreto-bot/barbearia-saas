import { FastifyInstance } from 'fastify';
import { requirePermission, requireRole } from '../../middlewares/rbac.js';
import { listAuditLogs, listOperationalAuditEvents } from './service.js';

const listOpAuditHandler = async (request: any) =>
  listOperationalAuditEvents(request.tenantId as string, request.query as Record<string, unknown>);

export async function auditRoutes(app: FastifyInstance) {
  app.get(
    '/audit-logs',
    { preHandler: requireRole('tenant_admin') },
    async (request: any) => listAuditLogs(request.tenantId as string, request.query as Record<string, unknown>),
  );

  app.get(
    '/operational-audit-events',
    { preHandler: requirePermission('operationalAudit', 'read') },
    listOpAuditHandler,
  );

  app.get(
    '/operational-audit/events',
    { preHandler: requirePermission('operationalAudit', 'read') },
    listOpAuditHandler,
  );
}
