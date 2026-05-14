import type { IncomingMessage } from 'node:http';
import { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../infra/db/pool.js';

/** Normaliza pathname sem query string e sem barra final (exceto raiz). */
export function normalizeRequestPathname(url: string | undefined): string {
  let raw = (url ?? '').split('?')[0] ?? '';
  if (raw.length > 0 && !raw.startsWith('/')) raw = `/${raw}`;
  if (raw.length > 1 && raw.endsWith('/')) return raw.slice(0, -1);
  return raw;
}

/** Caminho efetivo para RBAC (Fastify `request.url`, fallback ao socket HTTP raw). */
export function getEffectiveRequestPathname(request: FastifyRequest): string {
  const fromFastify = normalizeRequestPathname(request.url);
  const raw = (request as { raw?: IncomingMessage }).raw?.url;
  const fromRaw = normalizeRequestPathname(typeof raw === 'string' ? raw : undefined);
  if (fromFastify === '/api/v1/tenants' || fromFastify.endsWith('/api/v1/tenants')) return '/api/v1/tenants';
  if (fromRaw === '/api/v1/tenants' || fromRaw.endsWith('/api/v1/tenants')) return '/api/v1/tenants';
  return fromFastify || fromRaw;
}

/**
 * Listagem e criação global de tenants (Cenário A — plataforma).
 * `platform_admin` com `tenant_id` NULL no JWT não deve ser obrigado a enviar `x-tenant-id`.
 */
export function isPlatformTenantsCollectionRoute(method: string, pathname: string): boolean {
  const p = normalizeRequestPathname(pathname);
  if (p !== '/api/v1/tenants') return false;
  const m = method.toUpperCase();
  return m === 'GET' || m === 'POST';
}

export async function tenantMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const role = (request.user as { role?: string })?.role;
  const pathname = getEffectiveRequestPathname(request);

  if (role === 'platform_admin' && isPlatformTenantsCollectionRoute(request.method, pathname)) {
    const headerTenant = request.headers['x-tenant-id'];
    const tokenTenant = (request.user as { tenant_id?: string | null; sub?: string })?.tenant_id;
    const headerRaw = Array.isArray(headerTenant) ? headerTenant[0] : headerTenant;
    const headerTenantId =
      typeof headerRaw === 'string' && headerRaw.trim() !== '' ? headerRaw.trim() : undefined;
    const tokenStr =
      typeof tokenTenant === 'string' && tokenTenant.trim() !== '' ? tokenTenant.trim() : undefined;
    if (headerTenantId && tokenStr && headerTenantId !== tokenStr) {
      const actorUserId = (request.user as { sub?: string })?.sub ?? null;
      try {
        await pool.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity, before, after)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
          [
            tokenStr,
            actorUserId,
            'TENANT_HEADER_MISMATCH_BLOCKED',
            'security',
            JSON.stringify({ header_x_tenant_id: headerTenantId }),
            JSON.stringify({ jwt_tenant_id: tokenStr }),
          ],
        );
      } catch {
        /* auditoria não deve bloquear a resposta 403 */
      }
      return reply.code(403).send({ error: 'TENANT_MISMATCH' });
    }
    (request as FastifyRequest & { tenantId?: string }).tenantId = undefined;
    return;
  }

  const headerTenant = request.headers['x-tenant-id'];
  const tokenTenant = (request.user as { tenant_id?: string | null; sub?: string })?.tenant_id;
  const headerRaw = Array.isArray(headerTenant) ? headerTenant[0] : headerTenant;
  const headerTenantId =
    typeof headerRaw === 'string' && headerRaw.trim() !== '' ? headerRaw.trim() : undefined;
  const tokenStr =
    typeof tokenTenant === 'string' && tokenTenant.trim() !== '' ? tokenTenant.trim() : undefined;

  /** CT-020: `x-tenant-id` tem prioridade quando enviado; senão usa `tenant_id` do JWT. */
  const tenantId = headerTenantId ?? tokenStr;

  if (!tenantId) {
    return reply.code(401).send({ error: 'TENANT_REQUIRED' });
  }

  if (headerTenantId && tokenStr && headerTenantId !== tokenStr) {
    const actorUserId = (request.user as { sub?: string })?.sub ?? null;
    try {
      await pool.query(
        `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity, before, after)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
        [
          tokenStr,
          actorUserId,
          'TENANT_HEADER_MISMATCH_BLOCKED',
          'security',
          JSON.stringify({ header_x_tenant_id: headerTenantId }),
          JSON.stringify({ jwt_tenant_id: tokenStr }),
        ],
      );
    } catch {
      /* auditoria não deve bloquear a resposta 403 */
    }
    return reply.code(403).send({ error: 'TENANT_MISMATCH' });
  }

  (request as FastifyRequest & { tenantId: string }).tenantId = tenantId;
}
