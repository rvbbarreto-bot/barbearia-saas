import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Database, Inbox, Radio, Server } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SkeletonCard } from '@/components/shared/SkeletonRows';
import { EmptyState } from '@/components/shared/EmptyState';
import { getApiErrorMessage } from '@/lib/apiErrorMessage';
import { formatDate } from '@/lib/utils';
import { formatOutboxLastError } from '@/lib/outboxErrorMessage';
import { fetchOperationalStatus, type OperationalStatusFilters } from './operacaoStatusService';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { healthBadgeClass, healthLabel, outboxCountLabel } from './operacaoStatusLabels';

const INFRA_ITEMS = [
  { key: 'api' as const, label: 'API', icon: Server },
  { key: 'database' as const, label: 'PostgreSQL', icon: Database },
  { key: 'redis' as const, label: 'Redis', icon: Activity },
  { key: 'outbox_worker' as const, label: 'Worker outbox', icon: Inbox },
  { key: 'n8n' as const, label: 'n8n', icon: Radio },
  { key: 'evolution' as const, label: 'Evolution', icon: Radio },
];

export function OperacaoStatusPage() {
  const [filters, setFilters] = useState<OperationalStatusFilters>({});
  const [draft, setDraft] = useState<OperationalStatusFilters>({});

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['operational-status', filters],
    queryFn: () => fetchOperationalStatus(filters),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Operação — status</h1>
        <div className="grid gap-4 md:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <EmptyState
          title="Não foi possível carregar o status operacional"
          description={getApiErrorMessage(error)}
          actionLabel="Tentar novamente"
          onAction={() => refetch()}
        />
      </div>
    );
  }

  const outboxStatuses = ['pending', 'processing', 'sent', 'failed', 'dead'] as const;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operação — status</h1>
          <p className="text-sm text-muted-foreground">
            Atualizado {formatDate(data.generated_at)}
            {isFetching ? ' · atualizando…' : ''}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Filtros (erros recentes)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="ops-status">Status</Label>
            <select
              id="ops-status"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={draft.status ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value || undefined }))}
            >
              <option value="">failed + dead</option>
              <option value="failed">failed</option>
              <option value="dead">dead</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ops-from">De</Label>
            <Input
              id="ops-from"
              type="datetime-local"
              value={draft.from?.slice(0, 16) ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  from: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ops-to">Até</Label>
            <Input
              id="ops-to"
              type="datetime-local"
              value={draft.to?.slice(0, 16) ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  to: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ops-corr">Correlation ID</Label>
            <Input
              id="ops-corr"
              value={draft.correlation_id ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, correlation_id: e.target.value || undefined }))}
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="button" size="sm" onClick={() => setFilters({ ...draft })}>
              Aplicar filtros
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft({});
                setFilters({});
              }}
            >
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Infraestrutura</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INFRA_ITEMS.map(({ key, label, icon: Icon }) => {
            const state = data.infrastructure[key];
            return (
              <Card key={key}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{label}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${healthBadgeClass(state)}`}>
                    {healthLabel(state)}
                  </span>
                  {key === 'database' && data.infrastructure.errors.database && (
                    <p className="mt-2 text-xs text-muted-foreground">{data.infrastructure.errors.database}</p>
                  )}
                  {key === 'redis' && data.infrastructure.errors.redis && (
                    <p className="mt-2 text-xs text-muted-foreground">{data.infrastructure.errors.redis}</p>
                  )}
                  {key === 'n8n' && data.infrastructure.errors.n8n && (
                    <p className="mt-2 text-xs text-muted-foreground">{data.infrastructure.errors.n8n}</p>
                  )}
                  {key === 'evolution' && data.infrastructure.errors.evolution && (
                    <p className="mt-2 text-xs text-muted-foreground">{data.infrastructure.errors.evolution}</p>
                  )}
                  {key === 'n8n' && state === 'not_probed' && (
                    <p className="mt-2 text-xs text-muted-foreground">Defina N8N_WEBHOOK_URL para probe automático.</p>
                  )}
                  {key === 'evolution' && state === 'not_probed' && (
                    <p className="mt-2 text-xs text-muted-foreground">Defina EVOLUTION_API_URL para probe automático.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Fila de mensagens (outbox)</h2>
          <Button variant="link" className="h-auto p-0 text-sm" asChild>
            <Link to="/operacao/mensagens">Ver fila completa</Link>
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
          {outboxStatuses.map((st) => (
            <Card key={st}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{outboxCountLabel(st)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{data.outbox.counts[st] ?? 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Últimos erros (sanitizados)</h2>
        {data.outbox.recent_errors.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma mensagem com falha recente neste tenant.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {data.outbox.recent_errors.map((row) => {
              const err = formatOutboxLastError(row.last_error);
              return (
                <Card key={row.id}>
                  <CardContent className="flex flex-wrap gap-4 py-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Status </span>
                      <span className="font-medium">{row.status}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Classe </span>
                      <span className="font-medium">{row.error_class ?? '—'}</span>
                    </div>
                    <div className="min-w-[12rem] flex-1">
                      <span className="text-muted-foreground">Erro </span>
                      <span title={err.technical ?? undefined}>{err.friendly}</span>
                    </div>
                    {row.correlation_id && (
                      <div className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                        {row.correlation_id}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">{formatDate(row.created_at)}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
