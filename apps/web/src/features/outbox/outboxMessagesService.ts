import { api } from '@/lib/api';
import type { OutboxMessageRow, PaginatedResponse } from '@/types/api';

export type OutboxMessagesQuery = {
  page: number;
  limit: number;
  status?: string;
  provider?: string;
  from?: string;
  to?: string;
  correlation_id?: string;
  appointment_id?: string;
  destination?: string;
  customer_id?: string;
  error_class?: string;
};

export async function listOutboxMessages(q: OutboxMessagesQuery): Promise<PaginatedResponse<OutboxMessageRow>> {
  const { data } = await api.get<PaginatedResponse<OutboxMessageRow>>('/api/v1/outbox/messages', {
    params: {
      page: q.page,
      limit: q.limit,
      status: q.status || undefined,
      provider: q.provider || undefined,
      from: q.from || undefined,
      to: q.to || undefined,
      correlation_id: q.correlation_id || undefined,
      appointment_id: q.appointment_id || undefined,
      destination: q.destination || undefined,
      customer_id: q.customer_id || undefined,
      error_class: q.error_class || undefined,
    },
  });
  return data;
}

export async function getOutboxMessage(id: string): Promise<OutboxMessageRow> {
  const { data } = await api.get<OutboxMessageRow>(`/api/v1/outbox/messages/${id}`);
  return data;
}

export async function retryOutboxMessage(id: string): Promise<{ id: string; status: string }> {
  const { data } = await api.post<{ id: string; status: string }>(`/api/v1/outbox/messages/${id}/retry`, {});
  return data;
}
