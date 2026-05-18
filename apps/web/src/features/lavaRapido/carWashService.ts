import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/types/api';

export type CarWashJob = {
  id: string;
  appointment_id: string;
  vehicle_id: string;
  stage: string;
  stage_changed_at: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  customer_id: string;
  customer_name: string | null;
  service_name: string | null;
  starts_at: string;
  professional_name: string | null;
};

export async function listCarWashJobs(params?: {
  stage?: string;
  date?: string;
  plate?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<CarWashJob>> {
  const { data } = await api.get<PaginatedResponse<CarWashJob>>('/api/v1/car-wash/jobs', { params });
  return data;
}

export async function carWashJobAction(
  jobId: string,
  action: 'arrive' | 'start' | 'quality-check' | 'ready' | 'deliver' | 'cancel',
): Promise<CarWashJob> {
  const { data } = await api.patch<CarWashJob>(`/api/v1/car-wash/jobs/${jobId}/${action}`, {});
  return data;
}

export async function createChecklist(
  jobId: string,
  body: {
    checklist_type: 'arrival' | 'delivery';
    items: Record<string, unknown>;
    notes?: string;
  },
): Promise<unknown> {
  const { data } = await api.post(`/api/v1/car-wash/jobs/${jobId}/checklists`, body);
  return data;
}
