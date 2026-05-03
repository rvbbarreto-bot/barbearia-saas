import { api } from '@/lib/api';
import type { PaginatedResponse, Professional } from '@/types/api';

export interface BusinessHour {
  id: string;
  professional_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  slot_interval_minutes: number;
}

export async function listProfissionais(params: { page: number; limit: number; search: string }): Promise<PaginatedResponse<Professional>> {
  const { data } = await api.get<PaginatedResponse<Professional>>('/api/v1/professionals', {
    params: { page: params.page, limit: params.limit },
  });
  return data;
}

export async function getProfissional(id: string): Promise<Professional> {
  const { data } = await api.get<Professional>(`/api/v1/professionals/${id}`);
  return data;
}

export async function createProfissional(body: Partial<Professional>): Promise<Professional> {
  const { data } = await api.post<Professional>('/api/v1/professionals', body);
  return data;
}

export async function updateProfissional(id: string, body: Partial<Professional>): Promise<Professional> {
  const { data } = await api.patch<Professional>(`/api/v1/professionals/${id}`, body);
  return data;
}

export async function listBusinessHours(professionalId: string): Promise<BusinessHour[]> {
  const { data } = await api.get<BusinessHour[]>(`/api/v1/professionals/${professionalId}/business-hours`);
  return data;
}

export async function createBusinessHour(
  professionalId: string,
  body: Omit<BusinessHour, 'id' | 'professional_id'>,
): Promise<BusinessHour> {
  const { data } = await api.post<BusinessHour>(`/api/v1/professionals/${professionalId}/business-hours`, body);
  return data;
}

export async function updateBusinessHour(
  professionalId: string,
  bhId: string,
  body: Partial<Omit<BusinessHour, 'id' | 'professional_id'>>,
): Promise<BusinessHour> {
  const { data } = await api.patch<BusinessHour>(`/api/v1/professionals/${professionalId}/business-hours/${bhId}`, body);
  return data;
}
