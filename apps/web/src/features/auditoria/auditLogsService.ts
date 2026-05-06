import { api } from '@/lib/api';
import type { AuditLogRow, PaginatedResponse } from '@/types/api';

export type AuditLogQuery = {
  page: number;
  limit: number;
  entity?: string;
  action?: string;
  from?: string;
  to?: string;
  actor_user_id?: string;
};

export async function listAuditLogs(q: AuditLogQuery): Promise<PaginatedResponse<AuditLogRow>> {
  const { data } = await api.get<PaginatedResponse<AuditLogRow>>('/api/v1/audit-logs', {
    params: {
      page: q.page,
      limit: q.limit,
      entity: q.entity || undefined,
      action: q.action || undefined,
      from: q.from || undefined,
      to: q.to || undefined,
      actor_user_id: q.actor_user_id || undefined,
    },
  });
  return data;
}
