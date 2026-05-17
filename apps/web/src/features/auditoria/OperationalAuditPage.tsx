import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatDate } from '@/lib/utils';
import type { OperationalAuditEventRow } from '@/types/api';
import { buildOperationalAuditQuery } from './operationalAuditPageModel';
import { listOperationalAuditEvents } from './operationalAuditService';
import { summarizeOperationalAuditMetadata } from './operationalAuditSummary';

const columns: Column<OperationalAuditEventRow>[] = [
  { key: 'created_at', header: 'Data / hora', cell: (r) => formatDate(r.created_at) },
  { key: 'event_type', header: 'Ação', cell: (r) => r.event_type },
  { key: 'entity_type', header: 'Entidade', cell: (r) => r.entity_type },
  { key: 'entity_id', header: 'Entidade (id)', cell: (r) => r.entity_id ?? '—' },
  { key: 'actor_user_id', header: 'Utilizador', cell: (r) => r.actor_user_id ?? '—' },
  {
    key: 'correlation_id',
    header: 'Correlation',
    cell: (r) =>
      r.correlation_id ? (
        <Link
          className="text-primary underline-offset-2 hover:underline"
          to={`/operacao/mensagens?correlation_id=${encodeURIComponent(r.correlation_id)}`}
        >
          {r.correlation_id.length > 24 ? `${r.correlation_id.slice(0, 21)}…` : r.correlation_id}
        </Link>
      ) : (
        '—'
      ),
  },
  {
    key: 'metadata',
    header: 'Metadata',
    cell: (r) => (
      <span className="line-clamp-2 text-muted-foreground text-sm">
        {summarizeOperationalAuditMetadata(r.metadata)}
      </span>
    ),
  },
];

export function OperationalAuditPage() {
  const [searchParams] = useSearchParams();
  const initialCorrelation = searchParams.get('correlation_id') ?? '';

  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [correlationId, setCorrelationId] = useState(initialCorrelation);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const limit = 20;

  const filters = useMemo(
    () =>
      buildOperationalAuditQuery({
        page,
        limit,
        eventType,
        entityType,
        entityId,
        actorUserId,
        correlationId,
        from,
        to,
      }),
    [page, limit, eventType, entityType, entityId, actorUserId, correlationId, from, to],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['operational-audit-events', filters],
    queryFn: () => listOperationalAuditEvents(filters),
  });

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="operational-audit-page">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Auditoria operacional</h1>
        <p className="text-sm text-muted-foreground">
          Eventos críticos (agenda, outbox, inbound). Somente leitura — gestão+.
        </p>
      </div>

      <div
        className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-2 lg:grid-cols-3"
        data-testid="operational-audit-filters"
      >
        <div className="space-y-2">
          <Label htmlFor="oa-event">Ação (event_type)</Label>
          <Input
            id="oa-event"
            value={eventType}
            onChange={(e) => {
              setEventType(e.target.value);
              setPage(1);
            }}
            placeholder="ex.: appointment_confirmed"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="oa-entity-type">Entidade</Label>
          <Input
            id="oa-entity-type"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
            placeholder="ex.: appointment"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="oa-entity-id">Entidade (id)</Label>
          <Input
            id="oa-entity-id"
            value={entityId}
            onChange={(e) => {
              setEntityId(e.target.value);
              setPage(1);
            }}
            placeholder="UUID"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="oa-actor">Utilizador (user id)</Label>
          <Input
            id="oa-actor"
            value={actorUserId}
            onChange={(e) => {
              setActorUserId(e.target.value);
              setPage(1);
            }}
            placeholder="UUID"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="oa-corr">correlation_id</Label>
          <Input
            id="oa-corr"
            data-testid="operational-audit-filter-correlation"
            value={correlationId}
            onChange={(e) => {
              setCorrelationId(e.target.value);
              setPage(1);
            }}
            placeholder="UUID ou id de rastreio"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="oa-from">De (ISO)</Label>
          <Input
            id="oa-from"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            placeholder="2026-05-01T00:00:00Z"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="oa-to">Até (ISO)</Label>
          <Input
            id="oa-to"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            placeholder="2026-05-31T23:59:59Z"
          />
        </div>
        <div className="flex items-end">
          <Button type="button" variant="secondary" onClick={() => void refetch()}>
            Aplicar filtros
          </Button>
        </div>
      </div>

      {isError && (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          data-testid="operational-audit-error"
        >
          {(error as Error)?.message ?? 'Erro ao carregar auditoria operacional.'}
        </div>
      )}

      {!isLoading && !isError && !data?.data.length ? (
        <EmptyState
          icon={ClipboardList}
          title="Sem registos"
          description="Ajuste filtros ou aguarde atividade auditada."
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
            emptyTitle="Sem resultados"
            emptyDescription="Tente outros filtros."
          />
        </div>
      )}
    </div>
  );
}
