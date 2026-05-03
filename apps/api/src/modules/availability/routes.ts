import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../middlewares/rbac.js';
import { getAvailability } from './service.js';

export async function availabilityRoutes(app: FastifyInstance) {
  app.get('/availability', { preHandler: requirePermission('availability', 'read') }, async (request: any) => {
    return getAvailability(request.tenantId, request.query);
  });
}
