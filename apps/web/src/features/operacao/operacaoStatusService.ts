import { api } from '@/lib/api';

export type OperationalStatusFilters = {
  status?: string;
  from?: string;
  to?: string;
  correlation_id?: string;
};

export type OperationalStatusResponse = {
  generated_at: string;
  infrastructure: {
    api: 'ok';
    database: 'ok' | 'degraded' | 'not_probed';
    redis: 'ok' | 'degraded' | 'not_probed';
    outbox_worker: 'ok' | 'degraded' | 'not_probed';
    n8n: 'ok' | 'degraded' | 'not_probed';
    evolution: 'ok' | 'degraded' | 'not_probed';
    errors: {
      database: string | null;
      redis: string | null;
      n8n: string | null;
      evolution: string | null;
    };
  };
  outbox: {
    counts: Record<string, number>;
    recent_errors: Array<{
      id: string;
      status: string;
      error_class: string | null;
      last_error: string | null;
      correlation_id: string | null;
      appointment_id: string | null;
      destination: string | null;
      created_at: string;
    }>;
    filters_applied: OperationalStatusFilters;
  };
};

export async function fetchOperationalStatus(
  filters: OperationalStatusFilters = {},
): Promise<OperationalStatusResponse> {
  const { data } = await api.get<OperationalStatusResponse>('/api/v1/operational/status', {
    params: filters,
  });
  return data;
}
