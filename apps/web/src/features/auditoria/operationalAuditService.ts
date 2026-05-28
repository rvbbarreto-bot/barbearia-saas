import { api } from '@/lib/api';
import type { OperationalAuditEventRow, PaginatedResponse } from '@/types/api';
import type { OperationalAuditQuery } from './operationalAuditPageModel';

export async function listOperationalAuditEvents(
  q: OperationalAuditQuery,
): Promise<PaginatedResponse<OperationalAuditEventRow>> {
  const { data } = await api.get<PaginatedResponse<OperationalAuditEventRow>>(
    '/api/v1/operational-audit-events',
    {
      params: {
        page: q.page,
        limit: q.limit,
        event_type: q.event_type,
        entity_type: q.entity_type,
        entity_id: q.entity_id,
        actor_user_id: q.actor_user_id,
        correlation_id: q.correlation_id,
        from: q.from,
        to: q.to,
      },
    },
  );
  return data;
}
