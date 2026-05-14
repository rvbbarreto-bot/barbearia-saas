import { FastifyInstance } from 'fastify';
import { requireRole } from '../../middlewares/rbac.js';
import { createTenant, getTenantById, listTenants, updateTenant } from './service.js';

export async function tenantRoutes(app: FastifyInstance) {
  app.get(
    '/tenants',
    { preHandler: requireRole('platform_admin') },
    async (request: any) => listTenants(request.query as Record<string, unknown>),
  );

  /** Tenant do JWT/`x-tenant-id` — para `tenant_owner` e restantes perfis tenant (mín. `tenant_admin`). */
  app.get(
    '/tenants/current',
    { preHandler: requireRole('tenant_admin') },
    async (request: any) => getTenantById(request.tenantId as string),
  );

  app.get(
    '/tenants/:tenantId',
    { preHandler: requireRole('tenant_admin') },
    async (request: any) => {
      const role = request.user?.role as string;
      const jwtTenantId = request.tenantId as string;
      const { tenantId } = request.params as { tenantId: string };
      if (role !== 'platform_admin' && jwtTenantId !== tenantId) {
        const { AppError } = await import('../../shared/errors.js');
        throw new AppError('FORBIDDEN', 'Acesso negado ao tenant', 403);
      }
      return getTenantById(tenantId);
    },
  );

  app.post(
    '/tenants',
    { preHandler: requireRole('platform_admin') },
    async (request: any, reply) => {
      const created = await createTenant(request.body);
      return reply.code(201).send(created);
    },
  );

  app.patch(
    '/tenants/:tenantId',
    { preHandler: requireRole('tenant_owner') },
    async (request: any) => {
      const role = request.user?.role as string;
      const jwtTenantId = request.tenantId as string;
      const { tenantId } = request.params as { tenantId: string };
      if (role !== 'platform_admin' && jwtTenantId !== tenantId) {
        const { AppError } = await import('../../shared/errors.js');
        throw new AppError('FORBIDDEN', 'Acesso negado ao tenant', 403);
      }
      return updateTenant(tenantId, request.body ?? {});
    },
  );
}
