import { useState } from 'react';
import { Plus, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/shared/SkeletonRows';
import { EmptyState } from '@/components/shared/EmptyState';
import { useRoleGate } from '@/hooks/useRoleGate';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import type { Service } from '@/types/api';
import { listServicos } from './servicosService';
import { ServicoDrawer } from './ServicoDrawer';

export function ServicosPage() {
  const canManage = useRoleGate('manager');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Service | undefined>();

  const { data, isLoading, search, setSearch } = usePaginatedQuery<Service>({
    queryKey: 'servicos',
    fetcher: listServicos,
  });

  function openCreate() { setSelected(undefined); setDrawerOpen(true); }
  function openEdit(s: Service) { setSelected(s); setDrawerOpen(true); }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Servicos</h1>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} servico{(data?.total ?? 0) !== 1 ? 's' : ''} cadastrado{(data?.total ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            <span>Novo Servico</span>
          </Button>
        )}
      </div>

      <Input
        placeholder="Buscar servico..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : !data?.data.length ? (
        <EmptyState
          icon={Scissors}
          title="Nenhum servico cadastrado"
          description="Crie o primeiro servico da barbearia."
          actionLabel={canManage ? 'Novo Servico' : undefined}
          onAction={canManage ? openCreate : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map((s) => (
            <div
              key={s.id}
              onClick={() => canManage && openEdit(s)}
              className={`flex flex-col gap-2 rounded-xl border bg-card p-5 shadow-sm transition-colors ${canManage ? 'cursor-pointer hover:border-primary/40' : ''}`}
            >
              <div className="flex items-start justify-between">
                <span className="font-medium text-foreground">{s.name}</span>
                <Badge variant={s.active ? 'success' : 'muted'}>
                  {s.active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{s.duration_minutes} min</p>
              <p className="text-lg font-semibold text-foreground">
                {(s.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
          ))}
        </div>
      )}

      <ServicoDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} servico={selected} />
    </div>
  );
}
