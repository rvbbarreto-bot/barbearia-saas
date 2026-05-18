import { api } from '@/lib/api';
import type { PaginatedResponse, WaitlistEntry } from '@/types/api';

export type WaitlistListParams = {
  page: number;
  limit: number;
  status?: 'active' | 'cancelled' | 'converted' | 'all';
  professional_id?: string;
  service_id?: string;
};

export async function listWaitlistEntries(params: WaitlistListParams): Promise<PaginatedResponse<WaitlistEntry>> {
  const { data } = await api.get<PaginatedResponse<WaitlistEntry>>('/api/v1/waitlist', {
    params: {
      page: params.page,
      limit: params.limit,
      status: params.status ?? 'active',
      professional_id: params.professional_id || undefined,
      service_id: params.service_id || undefined,
    },
  });
  return data;
}

export type CreateWaitlistBody = {
  customer_id: string;
  service_id: string;
  professional_id?: string | null;
  preferred_date_from: string;
  preferred_date_to: string;
  shift_preference?: 'morning' | 'afternoon' | 'evening' | 'any';
  deposit_priority?: boolean;
};

export async function createWaitlistEntry(body: CreateWaitlistBody): Promise<WaitlistEntry> {
  const { data } = await api.post<WaitlistEntry>('/api/v1/waitlist', body);
  return data;
}

export async function cancelWaitlistEntry(entryId: string): Promise<WaitlistEntry> {
  const { data } = await api.patch<WaitlistEntry>(`/api/v1/waitlist/${entryId}/cancel`, {});
  return data;
}

export async function convertWaitlistEntry(entryId: string, appointmentId: string): Promise<WaitlistEntry> {
  const { data } = await api.post<WaitlistEntry>(`/api/v1/waitlist/${entryId}/convert`, {
    appointment_id: appointmentId,
  });
  return data;
}

export type WaitlistSlotSuggestion = {
  waitlist_entry_id: string;
  professional_id: string;
  service_id: string;
  date: string | null;
  slot: { starts_at: string; ends_at: string } | null;
};

export async function suggestWaitlistSlot(entryId: string): Promise<WaitlistSlotSuggestion> {
  const { data } = await api.get<WaitlistSlotSuggestion>(`/api/v1/waitlist/${entryId}/suggest-slot`);
  return data;
}
