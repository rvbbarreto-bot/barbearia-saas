import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from './useDebounce';
import type { PaginatedResponse } from '@/types/api';

interface UsePaginatedQueryOptions<T> {
  queryKey: string;
  fetcher: (params: { page: number; limit: number; search: string }) => Promise<PaginatedResponse<T>>;
  limit?: number;
  staleTime?: number;
}

export function usePaginatedQuery<T>({
  queryKey,
  fetcher,
  limit = 20,
  staleTime = 30_000,
}: UsePaginatedQueryOptions<T>) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const query = useQuery({
    queryKey: [queryKey, page, debouncedSearch],
    queryFn: () => fetcher({ page, limit, search: debouncedSearch }),
    staleTime,
    placeholderData: (prev) => prev,
  });

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  return {
    ...query,
    data: query.data,
    page,
    search,
    setPage,
    setSearch: handleSearchChange,
    limit,
  };
}
