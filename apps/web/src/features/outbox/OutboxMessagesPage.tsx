import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
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
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatDate } from '@/lib/utils';
import type { OutboxMessageRow } from '@/types/api';
import { listOutboxMessages } from './outboxMessagesService';

const STATUS_OPTS = ['__all__', 'pending', 'processing', 'sent', 'failed', 'dead'] as const;

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

const columns: Column<OutboxMessageRow>[] = [
  { key: 'created_at', header: 'Criado', cell: (r) => formatDate(r.created_at) },
  { key: 'status', header: 'Estado', cell: (r) => (
      <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(r.status)}`}>{r.status}</span>
    ) },
  { key: 'provider', header: 'Provider', cell: (r) => r.provider ?? '—' },
  { key: 'destination', header: 'Destino', cell: (r) => r.destination ?? '—' },
  {
    key: 'preview',
    header: 'Pré-visualização',
    cell: (r) => (
      <span className="line-clamp-2 text-muted-foreground text-sm">{r.payload_summary.preview ?? '—'}</span>
    ),
  },
  { key: 'attempts', header: 'Tent.', cell: (r) => `${r.attempts}/${r.max_attempts}` },
  {
    key: 'last_error',
    header: 'Último erro',
    cell: (r) => (
      <span className="line-clamp-2 max-w-xs text-xs text-destructive">{r.last_error ?? '—'}</span>
    ),
  },
  { key: 'correlation_id', header: 'correlation', cell: (r) => (
      <span className="font-mono text-xs text-muted-foreground">{r.correlation_id ?? '—'}</span>
    ) },
  { key: 'sent_at', header: 'Enviado', cell: (r) => (r.sent_at ? formatDate(r.sent_at) : '—') },
];

export function OutboxMessagesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('__all__');
  const [provider, setProvider] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [correlationId, setCorrelationId] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [destination, setDestination] = useState('');
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

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['outbox-messages', filters],
    queryFn: () => listOutboxMessages(filters),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Mensagens (outbox)</h1>
        <p className="text-sm text-muted-foreground">
          Fila de envio do tenant — dados sanitizados (sem tokens nem payload completo).
        </p>
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
          {(error as Error & { response?: { data?: { message?: string; error?: string } } })?.response?.data
            ?.message ??
            (error as Error)?.message ??
            'Erro ao carregar mensagens.'}
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
          />
        </div>
      )}
    </div>
  );
}
