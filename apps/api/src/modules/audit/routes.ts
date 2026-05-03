import { FastifyInstance } from 'fastify';
import { requireRole } from '../../middlewares/rbac.js';
import { pool } from '../../infra/db/pool.js';
import { parsePagination } from '../../shared/pagination.js';

export async function auditRoutes(app: FastifyInstance) {
  app.get(
    '/audit-logs',
    { preHandler: requireRole('tenant_admin') },
    async (request: any) => {
      const tenantId = request.tenantId as string;
      const query = request.query as Record<string, unknown>;
      const { limit, offset, page } = parsePagination(query);

      const filters: string[] = ['a.tenant_id = $1'];
      const params: unknown[] = [tenantId];
      let idx = 2;

      if (query.entity) { filters.push(`a.entity = $${idx++}`); params.push(query.entity); }
      if (query.action) { filters.push(`a.action = $${idx++}`); params.push(query.action); }
      if (query.from) { filters.push(`a.created_at >= $${idx++}::timestamptz`); params.push(query.from); }
      if (query.to) { filters.push(`a.created_at < $${idx++}::timestamptz`); params.push(query.to); }
      if (query.actor_user_id) { filters.push(`a.actor_user_id = $${idx++}::uuid`); params.push(query.actor_user_id); }
      if (query.entity_id) { filters.push(`a.entity_id = $${idx++}::uuid`); params.push(query.entity_id); }

      const where = `WHERE ${filters.join(' AND ')}`;

      const [data, count] = await Promise.all([
        pool.query(
          `SELECT a.id, a.actor_user_id, u.name AS actor_name, a.action, a.entity, a.entity_id,
                  a.before, a.after, a.ip, a.created_at
             FROM audit_logs a
             LEFT JOIN users u ON u.id = a.actor_user_id
             ${where}
            ORDER BY a.created_at DESC
            LIMIT $${idx} OFFSET $${idx + 1}`,
          [...params, limit, offset],
        ),
        pool.query(`SELECT COUNT(*)::int AS total FROM audit_logs a ${where}`, params),
      ]);

      return { data: data.rows, total: count.rows[0].total as number, page, limit };
    },
  );
}
