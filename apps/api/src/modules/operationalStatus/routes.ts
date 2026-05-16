import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../middlewares/rbac.js';
import { parseOperationalStatusQuery } from './operational-status-query.js';
import { getOperationalStatus } from './service.js';

export async function operationalStatusRoutes(app: FastifyInstance) {
  app.get(
    '/operational/status',
    { preHandler: requirePermission('operationalDashboard', 'read') },
    async (request: any) => {
      const query = parseOperationalStatusQuery((request.query ?? {}) as Record<string, unknown>);
      return getOperationalStatus(request.tenantId, query);
    },
  );
}
