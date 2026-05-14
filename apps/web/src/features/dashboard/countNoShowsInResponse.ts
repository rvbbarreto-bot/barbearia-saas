import type { Appointment, PaginatedResponse } from '@/types/api';

/** Conta no-shows na página devolvida pela API; tolera payload incompleto (evita falha silenciosa na UI). */
export function countNoShowsInResponse(payload: PaginatedResponse<Appointment> | undefined): number {
  const rows = payload?.data;
  if (!Array.isArray(rows)) return 0;
  return rows.filter((a) => a?.status === 'no_show').length;
}
