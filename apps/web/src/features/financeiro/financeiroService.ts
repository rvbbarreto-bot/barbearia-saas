import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/types/api';
import type { AppointmentFinancialListRow } from '@/types/api';

export type FinanceListParams = {
  page: number;
  limit: number;
  from?: string;
  to?: string;
  professional_id?: string;
  financial_status?: 'open' | 'settled' | 'all';
};

export async function listAppointmentFinancialsPage(
  params: FinanceListParams,
): Promise<PaginatedResponse<AppointmentFinancialListRow>> {
  const { data } = await api.get<PaginatedResponse<AppointmentFinancialListRow>>('/api/v1/finance/appointments', {
    params: {
      page: params.page,
      limit: params.limit,
      from: params.from,
      to: params.to,
      professional_id: params.professional_id || undefined,
      financial_status: params.financial_status === 'all' ? 'all' : params.financial_status,
    },
  });
  return data;
}
