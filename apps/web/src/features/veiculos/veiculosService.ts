import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/types/api';

export type Vehicle = {
  id: string;
  customer_id: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  vehicle_type: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listVehicles(params: {
  page?: number;
  limit?: number;
  search?: string;
  customer_id?: string;
}): Promise<PaginatedResponse<Vehicle>> {
  const { data } = await api.get<PaginatedResponse<Vehicle>>('/api/v1/vehicles', { params });
  return data;
}

export async function createVehicle(body: {
  customer_id: string;
  plate?: string;
  brand?: string;
  model?: string;
  color?: string;
  vehicle_type?: string;
  notes?: string;
}): Promise<Vehicle> {
  const { data } = await api.post<Vehicle>('/api/v1/vehicles', body);
  return data;
}

export async function updateVehicle(
  id: string,
  body: Partial<{
    plate: string;
    brand: string;
    model: string;
    color: string;
    vehicle_type: string;
    notes: string;
    is_active: boolean;
  }>,
): Promise<Vehicle> {
  const { data } = await api.patch<Vehicle>(`/api/v1/vehicles/${id}`, body);
  return data;
}
