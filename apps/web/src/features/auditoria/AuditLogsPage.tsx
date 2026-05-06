import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatDate } from '@/lib/utils';
import type { AuditLogRow } from '@/types/api';
import { listAuditLogs } from './auditLogsService';
import { summarizeAuditLogRow } from './auditLogSummary';

const columns: Column<AuditLogRow>[] = [
  { key: 'created_at', header: 'Data / hora', cell: (r) => formatDate(r.created_at) },
  { key: 'actor_name', header: 'Ator', cell: (r) => r.actor_name ?? '—' },
  { key: 'entity', header: 'Entidade', cell: (r) => r.entity },
  { key: 'entity_id', header: 'Entidade (id)', cell: (r) => r.entity_id ?? '—' },
  { key: 'action', header: 'Ação', cell: (r) => r.action },
  {
    key: 'summary',
    header: 'Resumo',
    cell: (r) => <span className="line-clamp-2 text-muted-foreground text-sm">{summarizeAuditLogRow(r)}</span>,
  },
];

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const limit = 20;

  const filters = useMemo(
    () => ({
      page,
      limit,
      entity: entity.trim() || undefined,
      action: action.trim() || undefined,
      from: from.trim() || undefined,
      to: to.trim() || undefined,
      actor_user_id: actorUserId.trim() || undefined,
    }),
    [page, limit, entity, action, from, to, actorUserId],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => listAuditLogs(filters),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Auditoria</h1>
        <p className="text-sm text-muted-foreground">Registo de alterações (somente leitura).</p>
      </div>

      <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="al-entity">Entidade</Label>
          <Input id="al-entity" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} placeholder="ex.: appointment" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="al-action">Ação</Label>
          <Input id="al-action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} placeholder="ex.: UPDATE" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="al-actor">Ator (user id)</Label>
          <Input id="al-actor" value={actorUserId} onChange={(e) => { setActorUserId(e.target.value); setPage(1); }} placeholder="UUID" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="al-from">De (ISO)</Label>
          <Input id="al-from" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} placeholder="2026-05-01T00:00:00Z" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="al-to">Até (ISO)</Label>
          <Input id="al-to" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} placeholder="2026-05-31T23:59:59Z" />
        </div>
        <div className="flex items-end">
          <Button type="button" variant="secondary" onClick={() => void refetch()}>
            Aplicar filtros
          </Button>
        </div>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error)?.message ?? 'Erro ao carregar auditoria.'}
        </div>
      )}

      {!isLoading && !isError && !data?.data.length ? (
        <EmptyState icon={ClipboardList} title="Sem registos" description="Ajuste filtros ou aguarde atividade auditada." />
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
            emptyTitle="Sem resultados"
            emptyDescription="Tente outros filtros."
          />
        </div>
      )}
    </div>
  );
}
