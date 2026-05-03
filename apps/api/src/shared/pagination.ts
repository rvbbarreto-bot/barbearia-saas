export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};

export function parsePagination(query: Record<string, unknown>): { limit: number; offset: number; page: number } {
  const page = Math.max(parseInt(String(query.page ?? '1'), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(String(query.limit ?? '20'), 10) || 20, 1), 100);
  return { limit, offset: (page - 1) * limit, page };
}
