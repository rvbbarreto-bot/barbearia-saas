import { withTenant } from '../../infra/db/pool.js';

export type OutboxStatusCounts = Record<string, number>;

/**
 * Contagens por `message_outbox.status` no tenant (read-only).
 * Usado em dashboards operacionais — não altera fila.
 */
export async function getMessageOutboxStatusSummary(tenantId: string): Promise<{
  by_status: OutboxStatusCounts;
  pending: number;
  dead: number;
}> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query<{ status: string; n: string }>(
      `SELECT status::text AS status, COUNT(*)::text AS n
         FROM message_outbox
        WHERE tenant_id = $1
        GROUP BY status`,
      [tenantId],
    );
    const by_status: OutboxStatusCounts = {};
    for (const row of r.rows) {
      by_status[row.status] = Number(row.n);
    }
    const pending = (by_status.pending ?? 0) + (by_status.processing ?? 0);
    const dead = by_status.dead ?? 0;
    return { by_status, pending, dead };
  });
}
