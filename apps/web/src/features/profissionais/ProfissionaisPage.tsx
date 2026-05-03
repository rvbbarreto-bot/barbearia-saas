import { useState } from 'react';
import { Plus, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkeletonCard } from '@/components/shared/SkeletonRows';
import { EmptyState } from '@/components/shared/EmptyState';
import { useRoleGate } from '@/hooks/useRoleGate';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import type { Professional } from '@/types/api';
import { listProfissionais } from './profissionaisService';
import { ProfissionalDrawer } from './ProfissionalDrawer';

function InitialsAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
      {initials}
    </div>
  );
}

export function ProfissionaisPage() {
  const canManage = useRoleGate('manager');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Professional | undefined>();

  const { data, isLoading, search, setSearch } = usePaginatedQuery<Professional>({
    queryKey: 'profissionais',
    fetcher: listProfissionais,
  });

  function openCreate() { setSelected(undefined); setDrawerOpen(true); }
  function openEdit(p: Professional) { setSelected(p); setDrawerOpen(true); }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Profissionais</h1>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} profissional{(data?.total ?? 0) !== 1 ? 'is' : ''} cadastrado{(data?.total ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            <span>Novo Profissional</span>
          </Button>
        )}
      </div>

      <Input
        placeholder="Buscar profissional..."
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
          icon={User}
          title="Nenhum profissional cadastrado"
          description="Adicione profissionais para comecar a agendar."
          actionLabel={canManage ? 'Novo Profissional' : undefined}
          onAction={canManage ? openCreate : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map((p) => (
            <div
              key={p.id}
              onClick={() => openEdit(p)}
              className="flex cursor-pointer items-start gap-4 rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
            >
              <InitialsAvatar name={p.name} />
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">{p.name}</span>
                <span className="text-xs text-muted-foreground">@{p.slug}</span>
                {p.phone && <span className="text-xs text-muted-foreground">{p.phone}</span>}
                <span className="mt-1 text-xs text-muted-foreground">
                  {(p.service_ids?.length ?? 0)} servico{(p.service_ids?.length ?? 0) !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProfissionalDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} profissional={selected} />
    </div>
  );
}
