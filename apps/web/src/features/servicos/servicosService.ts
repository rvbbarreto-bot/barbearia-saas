import { api } from '@/lib/api';
import type { PaginatedResponse, Service } from '@/types/api';

export async function listServicos(params: { page: number; limit: number; search: string }): Promise<PaginatedResponse<Service>> {
  const { data } = await api.get<PaginatedResponse<Service>>('/api/v1/services', {
    params: { page: params.page, limit: params.limit },
  });
  return data;
}

export async function createServico(body: { name: string; duration_minutes: number; price_cents: number; active?: boolean }): Promise<Service> {
  const { data } = await api.post<Service>('/api/v1/services', body);
  return data;
}

export async function updateServico(id: string, body: Partial<{ name: string; duration_minutes: number; price_cents: number; active: boolean }>): Promise<Service> {
  const { data } = await api.patch<Service>(`/api/v1/services/${id}`, body);
  return data;
}
