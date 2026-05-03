import { api } from '@/lib/api';
import type { HandoffReasonCode, PaginatedResponse, SupportTicketDetailResponse, SupportTicketListRow } from '@/types/api';

export async function listSupportTickets(params: {
  page?: number;
  limit?: number;
  /** `open` (default) = fila operacional; `all` inclui encerrados. */
  scope?: 'open' | 'all';
}): Promise<PaginatedResponse<SupportTicketListRow>> {
  const { data } = await api.get<PaginatedResponse<SupportTicketListRow>>('/api/v1/support-tickets', {
    params: { page: params.page ?? 1, limit: params.limit ?? 50, scope: params.scope ?? 'open' },
  });
  return data;
}

export async function getSupportTicket(id: string): Promise<SupportTicketDetailResponse> {
  const { data } = await api.get<SupportTicketDetailResponse>(`/api/v1/support-tickets/${id}`);
  return data;
}

export async function createSupportTicket(body: {
  customer_id: string;
  subject: string;
  body?: string;
  handoff_reason_code: HandoffReasonCode;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}): Promise<SupportTicketListRow> {
  const { data } = await api.post<SupportTicketListRow>('/api/v1/support-tickets', body);
  return data;
}

export async function claimSupportTicket(id: string): Promise<SupportTicketListRow> {
  const { data } = await api.patch<SupportTicketListRow>(`/api/v1/support-tickets/${id}/claim`, {});
  return data;
}

export async function sendSupportTicketMessage(
  id: string,
  body: { text: string; idempotency_key?: string },
): Promise<{ ok: boolean; idempotency_key: string }> {
  const { data } = await api.post(`/api/v1/support-tickets/${id}/messages`, body);
  return data;
}

export async function closeSupportTicket(id: string, resolution: string): Promise<SupportTicketListRow> {
  const { data } = await api.patch<SupportTicketListRow>(`/api/v1/support-tickets/${id}/close`, { resolution });
  return data;
}
