import { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../infra/db/pool.js';

export async function tenantMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const headerTenant = request.headers['x-tenant-id'];
  const tokenTenant = (request.user as { tenant_id?: string | null; sub?: string })?.tenant_id;
  const tenantId = tokenTenant || (Array.isArray(headerTenant) ? headerTenant[0] : headerTenant);

  if (!tenantId || typeof tenantId !== 'string') {
    return reply.code(401).send({ error: 'TENANT_REQUIRED' });
  }

  const headerTenantId = Array.isArray(headerTenant) ? headerTenant[0] : headerTenant;
  if (typeof headerTenantId === 'string' && tokenTenant && headerTenantId !== tokenTenant) {
    const actorUserId = (request.user as { sub?: string })?.sub ?? null;
    try {
      await pool.query(
        `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity, before, after)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
        [
          tokenTenant,
          actorUserId,
          'TENANT_HEADER_MISMATCH_BLOCKED',
          'security',
          JSON.stringify({ header_x_tenant_id: headerTenantId }),
          JSON.stringify({ jwt_tenant_id: tokenTenant }),
        ],
      );
    } catch {
      /* auditoria não deve bloquear a resposta 403 */
    }
    return reply.code(403).send({ error: 'TENANT_MISMATCH' });
  }

  (request as FastifyRequest & { tenantId: string }).tenantId = tenantId;
}
