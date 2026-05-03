import { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useRoleGate } from '@/hooks/useRoleGate';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import type { Customer } from '@/types/api';
import { listClientes } from './clientesService';
import { ClienteDrawer } from './ClienteDrawer';
import { formatDate } from '@/lib/utils';

const columns: Column<Customer>[] = [
  { key: 'name',       header: 'Nome',       cell: (r) => r.name ?? <span className="text-muted-foreground">—</span> },
  { key: 'phone',      header: 'Telefone',   cell: (r) => r.phone },
  { key: 'email',      header: 'Email',      cell: (r) => r.email ?? <span className="text-muted-foreground">—</span> },
  { key: 'created_at', header: 'Cadastrado', cell: (r) => formatDate(r.created_at) },
];

export function ClientesPage() {
  const canManage = useRoleGate('attendant');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Customer | undefined>();

  const { data, isLoading, search, setSearch, page, setPage, limit } = usePaginatedQuery<Customer>({
    queryKey: 'clientes',
    fetcher: listClientes,
  });

  function openCreate() { setSelected(undefined); setDrawerOpen(true); }
  function openEdit(c: Customer) { setSelected(c); setDrawerOpen(true); }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} cliente{(data?.total ?? 0) !== 1 ? 's' : ''}</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            <span>Novo Cliente</span>
          </Button>
        )}
      </div>

      <Input
        placeholder="Buscar por nome ou telefone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {!isLoading && !data?.data.length && !search ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente cadastrado"
          description="Adicione o primeiro cliente."
          actionLabel={canManage ? 'Novo Cliente' : undefined}
          onAction={canManage ? openCreate : undefined}
        />
      ) : (
        <div className="rounded-xl border bg-card shadow-sm">
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            isLoading={isLoading}
            total={data?.total ?? 0}
            page={page}
            limit={limit}
            onPageChange={setPage}
            onRowClick={openEdit}
            emptyTitle="Nenhum resultado"
            emptyDescription="Tente um outro termo de busca."
          />
        </div>
      )}

      <ClienteDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} cliente={selected} />
    </div>
  );
}
