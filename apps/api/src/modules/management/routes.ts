import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../middlewares/rbac.js';
import { managementDashboardToCsv } from './csv-export.js';
import { getManagementDashboard } from './service.js';

export async function managementRoutes(app: FastifyInstance) {
  app.get(
    '/management/dashboard',
    { preHandler: requirePermission('management', 'readDashboard') },
    async (request: any) => getManagementDashboard(request.tenantId, request.query as Record<string, unknown>),
  );

  app.get(
    '/management/dashboard/export.csv',
    { preHandler: requirePermission('management', 'readDashboard') },
    async (request: any, reply) => {
      const dashboard = await getManagementDashboard(request.tenantId, request.query as Record<string, unknown>);
      const csv = managementDashboardToCsv(dashboard);
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="dashboard-export.csv"')
        .send(csv);
    },
  );
}
