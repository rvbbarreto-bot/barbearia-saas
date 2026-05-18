import { api } from '@/lib/api';

export type ManagementDashboard = {
  period: { from: string; to: string };
  kpis: {
    gross_revenue_cents: number;
    net_revenue_cents: number;
    appointments_created: number;
    appointments_completed: number;
    appointments_cancelled: number;
    no_show_count: number;
    average_ticket_cents: number;
    completion_rate: number;
  };
  top_services: Array<{ service_id: string; service_name: string; count: number; revenue_cents: number }>;
  top_professionals: Array<{
    professional_id: string;
    professional_name: string;
    completed: number;
    revenue_cents: number;
  }>;
  outbox: { by_status: Record<string, number>; pending: number; dead: number };
  recent_operational_errors: Array<{
    id: string;
    action: string;
    entity: string;
    entity_id: string | null;
    created_at: string;
    correlation_id: string | null;
  }>;
};

export async function fetchManagementDashboard(params: Record<string, string>) {
  const { data } = await api.get<ManagementDashboard>('/api/v1/management/dashboard', { params });
  return data;
}

export function managementDashboardExportUrl(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return `/api/v1/management/dashboard/export.csv?${qs}`;
}
