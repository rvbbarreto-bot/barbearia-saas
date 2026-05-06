import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { Percent } from 'lucide-react';
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
import { listProfissionais } from '@/features/profissionais/profissionaisService';
import type { CommissionEntryRow } from '@/types/api';
import { listCommissionEntriesPage } from './comissaoService';
import { formatCentsBrl } from '@/features/financeiro/formatCentsBrl';

const columns: Column<CommissionEntryRow>[] = [
  {
    key: 'completed_at',
    header: 'Concluído',
    cell: (r) => (r.completed_at ? format(new Date(r.completed_at), 'dd/MM/yyyy HH:mm') : '—'),
  },
  {
    key: 'rule',
    header: 'Regra',
    cell: (r) => (
      <span className="font-mono text-xs">{r.commission_rule_id ? r.commission_rule_id.slice(0, 8) + '…' : '—'}</span>
    ),
  },
  {
    key: 'base',
    header: 'Base',
    cell: (r) => formatCentsBrl(Number(r.base_amount_cents)),
  },
  {
    key: 'commission',
    header: 'Comissão',
    cell: (r) => formatCentsBrl(Number(r.commission_cents)),
  },
  {
    key: 'branch',
    header: 'Unidade',
    cell: (r) => (r.branch_id ? <span className="font-mono text-xs">{r.branch_id.slice(0, 8)}…</span> : '—'),
  },
  {
    key: 'status',
    header: 'Estado',
    cell: (r) => r.status,
  },
];

export function ComissaoPage() {
  const [page, setPage] = useState(1);
  const limit = 20;
  const [fromDate, setFromDate] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [status, setStatus] = useState<string>('all');
  const [profId, setProfId] = useState('');

  const fromIso = useMemo(() => `${fromDate}T00:00:00.000Z`, [fromDate]);
  const toIso = useMemo(() => `${toDate}T23:59:59.999Z`, [toDate]);

  const { data: profs } = useQuery({
    queryKey: ['comissao-profs'],
    queryFn: () => listProfissionais({ page: 1, limit: 200, search: '' }),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['comissao-entries', page, fromIso, toIso, status, profId],
    queryFn: () =>
      listCommissionEntriesPage({
        page,
        limit,
        from: fromIso,
        to: toIso,
        status: status === 'all' ? undefined : status,
        professional_id: profId || undefined,
      }),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Comissões</h1>
        <p className="text-sm text-muted-foreground">
          Leitura DEV/QA — sem aprovação nem edição de regras a partir desta UI.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>De</Label>
          <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1">
          <Label>Até</Label>
          <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1">
          <Label>Estado</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="approved">Aprovado</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Profissional</Label>
          <Select
            value={profId || '__all__'}
            onValueChange={(v) => {
              setProfId(v === '__all__' ? '' : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {(profs?.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="secondary" disabled title="Disponível após validação QA">
          Aprovar
        </Button>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error)?.message ?? 'Erro ao carregar comissões.'}
        </div>
      )}

      {!isLoading && !isError && !(data?.data.length ?? 0) ? (
        <EmptyState icon={Percent} title="Sem lançamentos" description="Ative comissões no tenant e conclua agendamentos." />
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
          />
        </div>
      )}
    </div>
  );
}
