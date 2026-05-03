import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from './SkeletonRows';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  total?: number;
  page?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  total = 0,
  page = 1,
  limit = 20,
  onPageChange,
  emptyTitle = 'Nenhum resultado',
  emptyDescription = 'Tente ajustar os filtros.',
  onRowClick,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (isLoading) return <SkeletonRows rows={6} cols={columns.length} />;

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={i}
                onClick={() => onRowClick?.(row)}
                className={`border-b transition-colors last:border-0 ${
                  onRowClick ? 'cursor-pointer hover:bg-muted/40' : ''
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-foreground">
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} de {total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
