import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../middlewares/rbac.js';
import { getOperationalSettings, patchOperationalSettings } from './service.js';
import { getTenantVerticalContext } from './vertical-context.js';

export async function tenantOperationalRoutes(app: FastifyInstance) {
  app.get(
    '/tenant-settings/vertical',
    { preHandler: requirePermission('tenantOperational', 'read') },
    async (request: any) => getTenantVerticalContext(request.tenantId),
  );

  app.get(
    '/tenant-settings/operational',
    { preHandler: requirePermission('tenantOperational', 'read') },
    async (request: any) => getOperationalSettings(request.tenantId),
  );

  app.patch(
    '/tenant-settings/operational',
    { preHandler: requirePermission('tenantOperational', 'update') },
    async (request: any) => patchOperationalSettings(request.tenantId, request.body),
  );
}
