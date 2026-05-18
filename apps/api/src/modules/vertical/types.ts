export type TenantVertical = 'barbershop' | 'car_wash';

export type CarWashTenantConfig = {
  require_vehicle: boolean;
  require_checklist_on_arrival: boolean;
  notify_when_ready: boolean;
  default_slot_interval_minutes: number;
};

export type VerticalLabels = {
  customer: string;
  service: string;
  professional: string;
  professionals: string;
  appointment: string;
  agenda: string;
  patio: string;
  vehicle: string;
  vehicles: string;
};

export type TenantVerticalContext = {
  vertical: TenantVertical;
  labels: VerticalLabels;
  car_wash: CarWashTenantConfig;
};
