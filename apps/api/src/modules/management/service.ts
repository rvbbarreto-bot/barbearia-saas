import type { PoolClient } from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { getMessageOutboxStatusSummary } from '../integrations/outbox-summary.service.js';
import { managementDashboardQuerySchema, type ManagementDashboardQuery } from './schemas.js';

export type ManagementDashboard = {
  period: { from: string; to: string };
  kpis: {
    gross_revenue_cents: number;
    net_revenue_cents: number;
    appointments_created: number;
    appointments_completed: number;
    appointments_cancelled: number;
    no_show_count: number;
    average_ticket_cents: number;
    completion_rate: number;
  };
  top_services: Array<{ service_id: string; service_name: string; count: number; revenue_cents: number }>;
  top_professionals: Array<{ professional_id: string; professional_name: string; completed: number; revenue_cents: number }>;
  outbox: Awaited<ReturnType<typeof getMessageOutboxStatusSummary>>;
  recent_operational_errors: Array<{
    id: string;
    action: string;
    entity: string;
    entity_id: string | null;
    created_at: string;
    correlation_id: string | null;
  }>;
};

function buildFilterClause(
  query: ManagementDashboardQuery,
  aliasAppt: string,
): { sql: string; params: unknown[]; nextIndex: number } {
  const params: unknown[] = [];
  let i = 1;
  const parts: string[] = [];

  parts.push(`${aliasAppt}.starts_at >= $${i}::timestamptz`);
  params.push(query.from);
  i += 1;

  parts.push(`${aliasAppt}.starts_at < $${i}::timestamptz`);
  params.push(query.to);
  i += 1;

  if (query.professional_id) {
    parts.push(`${aliasAppt}.professional_id = $${i}::uuid`);
    params.push(query.professional_id);
    i += 1;
  }
  if (query.service_id) {
    parts.push(`${aliasAppt}.service_id = $${i}::uuid`);
    params.push(query.service_id);
    i += 1;
  }
  if (query.appointment_status && query.appointment_status !== 'all') {
    parts.push(`${aliasAppt}.status = $${i}::appointment_status`);
    params.push(query.appointment_status);
    i += 1;
  }

  return { sql: parts.join(' AND '), params, nextIndex: i };
}

async function loadKpis(client: PoolClient, tenantId: string, query: ManagementDashboardQuery) {
  const { sql: windowSql, params, nextIndex } = buildFilterClause(query, 'a');
  const tenantParam = `$${nextIndex}`;
  const allParams = [...params, tenantId];

  const counts = await client.query<{
    created: string;
    completed: string;
    cancelled: string;
    no_show: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE a.created_at >= $1::timestamptz AND a.created_at < $2::timestamptz)::text AS created,
       COUNT(*) FILTER (WHERE a.status = 'completed')::text AS completed,
       COUNT(*) FILTER (WHERE a.status = 'cancelled')::text AS cancelled,
       COUNT(*) FILTER (WHERE a.status IN ('no_show', 'no_show_pending'))::text AS no_show
     FROM appointments a
    WHERE a.tenant_id = ${tenantParam}
      AND ${windowSql}`,
    allParams,
  );

  const revenue = await client.query<{ gross: string; net: string }>(
    `SELECT
       COALESCE(SUM(f.service_price_cents), 0)::text AS gross,
       COALESCE(SUM(GREATEST(0, f.service_price_cents - COALESCE(f.discount_cents, 0))), 0)::text AS net
     FROM appointments a
     INNER JOIN appointment_financials f
       ON f.tenant_id = a.tenant_id AND f.appointment_id = a.id
    WHERE a.tenant_id = ${tenantParam}
      AND a.status = 'completed'
      AND ${windowSql}`,
    allParams,
  );

  const row = counts.rows[0];
  const completed = Number(row?.completed ?? 0);
  const created = Number(row?.created ?? 0);
  const gross = Number(revenue.rows[0]?.gross ?? 0);
  const net = Number(revenue.rows[0]?.net ?? 0);
  const denom = created > 0 ? created : completed + Number(row?.cancelled ?? 0) + Number(row?.no_show ?? 0);
  const completionRate = denom > 0 ? completed / denom : 0;
  const averageTicket = completed > 0 ? Math.round(gross / completed) : 0;

  return {
    gross_revenue_cents: gross,
    net_revenue_cents: net,
    appointments_created: created,
    appointments_completed: completed,
    appointments_cancelled: Number(row?.cancelled ?? 0),
    no_show_count: Number(row?.no_show ?? 0),
    average_ticket_cents: averageTicket,
    completion_rate: Math.round(completionRate * 1000) / 1000,
  };
}

async function loadTopServices(client: PoolClient, tenantId: string, query: ManagementDashboardQuery) {
  const { sql: windowSql, params, nextIndex } = buildFilterClause(query, 'a');
  const tenantParam = `$${nextIndex}`;
  const r = await client.query<{
    service_id: string;
    service_name: string;
    count: string;
    revenue_cents: string;
  }>(
    `SELECT
       s.id::text AS service_id,
       s.name AS service_name,
       COUNT(*)::text AS count,
       COALESCE(SUM(f.service_price_cents), 0)::text AS revenue_cents
     FROM appointments a
     JOIN services s ON s.tenant_id = a.tenant_id AND s.id = a.service_id
     LEFT JOIN appointment_financials f ON f.tenant_id = a.tenant_id AND f.appointment_id = a.id
    WHERE a.tenant_id = ${tenantParam}
      AND a.status = 'completed'
      AND ${windowSql}
    GROUP BY s.id, s.name
    ORDER BY COUNT(*) DESC
    LIMIT 10`,
    [...params, tenantId],
  );
  return r.rows.map((row) => ({
    service_id: row.service_id,
    service_name: row.service_name,
    count: Number(row.count),
    revenue_cents: Number(row.revenue_cents),
  }));
}

async function loadTopProfessionals(client: PoolClient, tenantId: string, query: ManagementDashboardQuery) {
  const { sql: windowSql, params, nextIndex } = buildFilterClause(query, 'a');
  const tenantParam = `$${nextIndex}`;
  const r = await client.query<{
    professional_id: string;
    professional_name: string;
    completed: string;
    revenue_cents: string;
  }>(
    `SELECT
       p.id::text AS professional_id,
       p.name AS professional_name,
       COUNT(*) FILTER (WHERE a.status = 'completed')::text AS completed,
       COALESCE(SUM(CASE WHEN a.status = 'completed' THEN f.service_price_cents ELSE 0 END), 0)::text AS revenue_cents
     FROM appointments a
     JOIN professionals p ON p.tenant_id = a.tenant_id AND p.id = a.professional_id
     LEFT JOIN appointment_financials f ON f.tenant_id = a.tenant_id AND f.appointment_id = a.id
    WHERE a.tenant_id = ${tenantParam}
      AND ${windowSql}
    GROUP BY p.id, p.name
    ORDER BY COUNT(*) FILTER (WHERE a.status = 'completed') DESC
    LIMIT 10`,
    [...params, tenantId],
  );
  return r.rows.map((row) => ({
    professional_id: row.professional_id,
    professional_name: row.professional_name,
    completed: Number(row.completed),
    revenue_cents: Number(row.revenue_cents),
  }));
}

async function loadRecentErrors(client: PoolClient, tenantId: string) {
  const r = await client.query<{
    id: string;
    action: string;
    entity: string;
    entity_id: string | null;
    created_at: string;
    correlation_id: string | null;
  }>(
    `SELECT id::text,
            event_type AS action,
            entity_type AS entity,
            entity_id::text,
            created_at::text,
            correlation_id
       FROM operational_audit_events
      WHERE tenant_id = $1
        AND (
          event_type ILIKE '%ERROR%'
          OR event_type ILIKE '%FAILED%'
          OR metadata->>'severity' = 'error'
        )
      ORDER BY created_at DESC
      LIMIT 15`,
    [tenantId],
  );
  return r.rows;
}

export async function getManagementDashboard(
  tenantId: string,
  rawQuery: Record<string, unknown>,
): Promise<ManagementDashboard> {
  const query = managementDashboardQuerySchema.parse(rawQuery);
  if (new Date(query.from).getTime() >= new Date(query.to).getTime()) {
    throw new AppError('INVALID_PERIOD', 'Período inválido: `from` deve ser anterior a `to`.', 422);
  }

  const outbox = await getMessageOutboxStatusSummary(tenantId);

  return withTenant(tenantId, async (client) => {
    const [kpis, top_services, top_professionals, recent_operational_errors] = await Promise.all([
      loadKpis(client, tenantId, query),
      loadTopServices(client, tenantId, query),
      loadTopProfessionals(client, tenantId, query),
      loadRecentErrors(client, tenantId),
    ]);

    return {
      period: { from: query.from, to: query.to },
      kpis,
      top_services,
      top_professionals,
      outbox,
      recent_operational_errors,
    };
  });
}
