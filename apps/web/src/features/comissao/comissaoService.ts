import { api } from '@/lib/api';
import type { CommissionEntryRow, PaginatedResponse } from '@/types/api';

export type CommissionEntriesParams = {
  page: number;
  limit: number;
  from?: string;
  to?: string;
  professional_id?: string;
  branch_id?: string;
  status?: string;
};

export async function listCommissionEntriesPage(
  params: CommissionEntriesParams,
): Promise<PaginatedResponse<CommissionEntryRow>> {
  const { data } = await api.get<PaginatedResponse<CommissionEntryRow>>('/api/v1/commission/entries', {
    params: {
      page: params.page,
      limit: params.limit,
      from: params.from,
      to: params.to,
      professional_id: params.professional_id || undefined,
      branch_id: params.branch_id || undefined,
      status: params.status || undefined,
    },
  });
  return data;
}
