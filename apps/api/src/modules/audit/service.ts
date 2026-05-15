import { z } from 'zod';
import { pool, withTenant } from '../../infra/db/pool.js';
import { parsePagination } from '../../shared/pagination.js';

export type AuditLogListQuery = Record<string, unknown>;

/**
 * Lista audit_logs do tenant (isolamento por `tenant_id` explícito).
 * Usado por rotas HTTP e testes de integração.
 */
export async function listAuditLogs(tenantId: string, rawQuery: AuditLogListQuery) {
  const query = rawQuery;
  const { limit, offset, page } = parsePagination(query);

  const filters: string[] = ['a.tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (query.entity) {
    filters.push(`a.entity = $${idx++}`);
    params.push(query.entity);
  }
  if (query.action) {
    filters.push(`a.action = $${idx++}`);
    params.push(query.action);
  }
  if (query.from) {
    filters.push(`a.created_at >= $${idx++}::timestamptz`);
    params.push(query.from);
  }
  if (query.to) {
    filters.push(`a.created_at < $${idx++}::timestamptz`);
    params.push(query.to);
  }
  if (query.actor_user_id) {
    filters.push(`a.actor_user_id = $${idx++}::uuid`);
    params.push(query.actor_user_id);
  }
  if (query.entity_id) {
    filters.push(`a.entity_id = $${idx++}::uuid`);
    params.push(query.entity_id);
  }

  const where = `WHERE ${filters.join(' AND ')}`;

  const [data, count] = await Promise.all([
    pool.query(
      `SELECT a.id, a.tenant_id, a.actor_user_id, u.name AS actor_name, a.action, a.entity, a.entity_id,
              a.before, a.after, a.ip, a.created_at
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_user_id AND u.tenant_id = a.tenant_id
         ${where}
        ORDER BY a.created_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM audit_logs a ${where}`, params),
  ]);

  return { data: data.rows, total: count.rows[0].total as number, page, limit };
}

const operationalAuditListQuery = z.object({
  event_type: z.string().min(1).max(120).optional(),
  entity_type: z.string().min(1).max(80).optional(),
  entity_id: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/** Lista `operational_audit_events` do tenant (RLS + `withTenant`). */
export async function listOperationalAuditEvents(tenantId: string, rawQuery: Record<string, unknown>) {
  const q = operationalAuditListQuery.parse(rawQuery);
  const { limit, offset, page } = parsePagination(rawQuery);

  return withTenant(tenantId, async (client) => {
    const filters: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (q.event_type) {
      filters.push(`event_type = $${idx++}`);
      params.push(q.event_type);
    }
    if (q.entity_type) {
      filters.push(`entity_type = $${idx++}`);
      params.push(q.entity_type);
    }
    if (q.entity_id) {
      filters.push(`entity_id = $${idx++}::uuid`);
      params.push(q.entity_id);
    }
    if (q.from) {
      filters.push(`created_at >= $${idx++}::timestamptz`);
      params.push(q.from);
    }
    if (q.to) {
      filters.push(`created_at < $${idx++}::timestamptz`);
      params.push(q.to);
    }

    const where = `WHERE ${filters.join(' AND ')}`;

    const [data, count] = await Promise.all([
      client.query(
        `SELECT id, tenant_id, entity_type, entity_id, event_type, actor_user_id, actor_role, source,
                request_id, correlation_id, metadata, created_at
           FROM operational_audit_events ${where}
          ORDER BY created_at DESC
          LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset],
      ),
      client.query(`SELECT COUNT(*)::int AS total FROM operational_audit_events ${where}`, params),
    ]);

    return { data: data.rows, total: count.rows[0].total as number, page, limit };
  });
}
