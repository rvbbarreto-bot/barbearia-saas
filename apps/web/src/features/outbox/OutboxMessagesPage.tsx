import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatDate } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/apiErrorMessage';
import { formatOutboxLastError } from '@/lib/outboxErrorMessage';
import { hasMinRole } from '@/lib/rbac';
import { useAuthStore } from '@/store/authStore';
import type { OutboxMessageRow } from '@/types/api';
import { getOutboxMessage, listOutboxMessages, retryOutboxMessage } from './outboxMessagesService';
import { toast } from 'sonner';

const STATUS_OPTS = ['__all__', 'pending', 'processing', 'sent', 'failed', 'dead'] as const;

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  processing: 'Processando',
  sent: 'Enviada',
  failed: 'Falhou',
  dead: 'Encerrada',
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'sent':
      return 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400';
    case 'pending':
    case 'processing':
      return 'bg-amber-600/15 text-amber-800 dark:text-amber-300';
    case 'failed':
    case 'dead':
      return 'bg-destructive/15 text-destructive';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function OutboxMessagesPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canRetry = !!user && hasMinRole(user.role, 'manager');

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('__all__');
  const [provider, setProvider] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [correlationId, setCorrelationId] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [destination, setDestination] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmRetryOpen, setConfirmRetryOpen] = useState(false);
  const limit = 20;

  const filters = useMemo(
    () => ({
      page,
      limit,
      status: status === '__all__' ? undefined : status,
      provider: provider.trim() || undefined,
      from: from.trim() || undefined,
      to: to.trim() || undefined,
      correlation_id: correlationId.trim() || undefined,
      appointment_id: appointmentId.trim() || undefined,
      destination: destination.trim() || undefined,
    }),
    [page, limit, status, provider, from, to, correlationId, appointmentId, destination],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['outbox-messages', filters],
    queryFn: () => listOutboxMessages(filters),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['outbox-message', detailId],
    queryFn: () => getOutboxMessage(detailId!),
    enabled: !!detailId,
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => retryOutboxMessage(id),
    onSuccess: async () => {
      toast.success('Mensagem re-enfileirada para envio.');
      setConfirmRetryOpen(false);
      setDetailId(null);
      await qc.invalidateQueries({ queryKey: ['outbox-messages'] });
    },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Não foi possível re-enfileirar.')),
  });

  const columns: Column<OutboxMessageRow>[] = useMemo<Column<OutboxMessageRow>[]>(
    () => [
      { key: 'created_at', header: 'Data', cell: (r: OutboxMessageRow) => formatDate(r.created_at) },
      {
        key: 'status',
        header: 'Estado',
        cell: (r: OutboxMessageRow) => (
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(r.status)}`}>
            {STATUS_LABELS[r.status] ?? r.status}
          </span>
        ),
      },
      { key: 'destination', header: 'Destino', cell: (r: OutboxMessageRow) => r.destination ?? '—' },
      { key: 'provider', header: 'Provider', cell: (r: OutboxMessageRow) => r.provider ?? '—' },
      { key: 'attempts', header: 'Tent.', cell: (r: OutboxMessageRow) => `${r.attempts}/${r.max_attempts}` },
      {
        key: 'last_error',
        header: 'Último erro',
        cell: (r: OutboxMessageRow) => {
          const { friendly } = formatOutboxLastError(r.last_error);
          return <span className="line-clamp-2 max-w-[14rem] text-xs text-destructive">{friendly}</span>;
        },
      },
      {
        key: 'action',
        header: 'Ação',
        cell: () => <span className="text-xs text-muted-foreground">Ver detalhe</span>,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Mensagens (outbox)</h1>
          <p className="text-sm text-muted-foreground">
            Fila de envio do tenant — dados sanitizados (sem tokens nem payload completo).
          </p>
        </div>
        <Button type="button" variant="secondary" disabled={isFetching} onClick={() => void refetch()}>
          <RefreshCw className={`mr-2 size-4 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar lista
        </Button>
      </div>

      <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label>Estado</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === '__all__' ? 'Todos' : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ob-provider">Provider</Label>
          <Input
            id="ob-provider"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setPage(1);
            }}
            placeholder="evolution"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ob-dest">Destino (substring)</Label>
          <Input
            id="ob-dest"
            value={destination}
            onChange={(e) => {
              setDestination(e.target.value);
              setPage(1);
            }}
            placeholder="5511…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ob-from">De (ISO)</Label>
          <Input
            id="ob-from"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            placeholder="2026-05-01T00:00:00Z"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ob-to">Até (ISO)</Label>
          <Input
            id="ob-to"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            placeholder="2026-05-31T23:59:59Z"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ob-corr">correlation_id</Label>
          <Input
            id="ob-corr"
            value={correlationId}
            onChange={(e) => {
              setCorrelationId(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ob-appt">appointment_id</Label>
          <Input
            id="ob-appt"
            value={appointmentId}
            onChange={(e) => {
              setAppointmentId(e.target.value);
              setPage(1);
            }}
            placeholder="UUID (usa correlation_id)"
          />
        </div>
        <div className="flex items-end">
          <Button type="button" variant="secondary" onClick={() => void refetch()}>
            Aplicar filtros
          </Button>
        </div>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {getApiErrorMessage(error, 'Erro ao carregar mensagens.')}
        </div>
      )}

      {!isLoading && !isError && !data?.data.length ? (
        <EmptyState icon={Inbox} title="Sem mensagens" description="Ajuste filtros ou aguarde enfileiramento." />
      ) : (
        <div className="rounded-xl border bg-card shadow-sm">
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            isLoading={isLoading}
            page={page}
            total={data?.total ?? 0}
            limit={limit}
            onPageChange={setPage}
            emptyTitle="Sem resultados"
            emptyDescription="Tente outros filtros."
            onRowClick={(row) => setDetailId(row.id)}
          />
        </div>
      )}

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhe da mensagem</DialogTitle>
          </DialogHeader>
          {detailLoading || !detail ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <DetailRow label="Estado" value={STATUS_LABELS[detail.status] ?? detail.status} />
              <DetailRow label="Provider" value={detail.provider ?? '—'} />
              <DetailRow label="Destino" value={detail.destination ?? '—'} />
              <DetailRow label="Tentativas" value={`${detail.attempts} / ${detail.max_attempts}`} />
              <DetailRow
                label="Último erro (operacional)"
                value={formatOutboxLastError(detail.last_error).friendly}
              />
              {formatOutboxLastError(detail.last_error).technical ? (
                <div className="rounded-md border bg-muted/40 p-2 text-xs">
                  <span className="text-muted-foreground">Diagnóstico técnico</span>
                  <p className="mt-1 font-mono break-all text-muted-foreground">
                    {formatOutboxLastError(detail.last_error).technical}
                  </p>
                </div>
              ) : null}
              <DetailRow label="Criado" value={formatDate(detail.created_at)} />
              <DetailRow label="Atualizado" value={formatDate(detail.updated_at)} />
              <DetailRow label="Enviado" value={detail.sent_at ? formatDate(detail.sent_at) : '—'} />
              <DetailRow label="correlation_id" value={detail.correlation_id ?? '—'} mono />
              <DetailRow label="appointment_id" value={detail.appointment_id ?? '—'} mono />
              <DetailRow label="idempotency_key" value={detail.idempotency_key ?? '—'} mono />
              <div>
                <span className="text-muted-foreground">Pré-visualização</span>
                <p className="mt-1 rounded-md border bg-muted/30 p-2 text-muted-foreground">
                  {detail.payload_summary.preview ?? '—'}
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setDetailId(null)}>
              Fechar
            </Button>
            {canRetry && detail && (detail.status === 'failed' || detail.status === 'dead') && (
              <Button type="button" onClick={() => setConfirmRetryOpen(true)}>
                Tentar novamente
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRetryOpen} onOpenChange={setConfirmRetryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-enfileirar envio?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A mensagem volta para a fila como <strong>pending</strong>. O envio só é concluído após confirmação do
            provider.
          </p>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmRetryOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!detailId || retryMut.isPending}
              onClick={() => detailId && retryMut.mutate(detailId)}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-medium ${mono ? 'font-mono text-xs break-all' : ''}`}>{value}</span>
    </div>
  );
}
