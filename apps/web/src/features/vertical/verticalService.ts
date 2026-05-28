import { api } from '@/lib/api';
import type { VerticalLabels } from '@/lib/vertical/labels';

export type TenantVerticalContext = {
  vertical: 'barbershop' | 'car_wash';
  labels: VerticalLabels;
  car_wash: {
    require_vehicle: boolean;
    require_checklist_on_arrival: boolean;
    notify_when_ready: boolean;
    default_slot_interval_minutes: number;
  };
};

export async function fetchTenantVertical(): Promise<TenantVerticalContext> {
  const { data } = await api.get<TenantVerticalContext>('/api/v1/tenant-settings/vertical');
  return data;
}
