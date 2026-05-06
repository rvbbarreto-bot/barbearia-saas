import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { Wallet } from 'lucide-react';
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
import type { AppointmentFinancialListRow } from '@/types/api';
import { listAppointmentFinancialsPage } from './financeiroService';
import { formatCentsBrl } from './formatCentsBrl';

function finRow(r: AppointmentFinancialListRow) {
  const f = r.financial as Record<string, unknown> | null;
  if (!f) return { service: 0, deposit: 0, discount: 0, settled: false };
  return {
    service: Number(f.service_price_cents ?? 0),
    deposit: Number(f.deposit_paid_cents ?? 0),
    discount: Number(f.discount_cents ?? 0),
    settled: Boolean(f.settled_at),
  };
}

const columns: Column<AppointmentFinancialListRow>[] = [
  {
    key: 'starts_at',
    header: 'Início',
    cell: (r) => format(new Date(r.starts_at), 'dd/MM HH:mm'),
  },
  {
    key: 'appointment',
    header: 'Agendamento',
    cell: (r) => <span className="font-mono text-xs">{r.appointment_id.slice(0, 8)}…</span>,
  },
  {
    key: 'status',
    header: 'Estado ag.',
    cell: (r) => r.appointment_status,
  },
  {
    key: 'service',
    header: 'Serviço',
    cell: (r) => formatCentsBrl(finRow(r).service),
  },
  {
    key: 'deposit',
    header: 'Sinal',
    cell: (r) => formatCentsBrl(finRow(r).deposit),
  },
  {
    key: 'discount',
    header: 'Desconto',
    cell: (r) => formatCentsBrl(finRow(r).discount),
  },
  {
    key: 'balance',
    header: 'Saldo',
    cell: (r) => formatCentsBrl(r.balance_due_cents),
  },
  {
    key: 'fin',
    header: 'Liquidação',
    cell: (r) => (finRow(r).settled ? 'Liquidado' : 'Aberto'),
  },
];

export function FinanceiroPage() {
  const [page, setPage] = useState(1);
  const limit = 20;
  const [fromDate, setFromDate] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [financialStatus, setFinancialStatus] = useState<'open' | 'settled' | 'all'>('all');
  const [profId, setProfId] = useState('');

  const fromIso = useMemo(() => `${fromDate}T00:00:00.000Z`, [fromDate]);
  const toIso = useMemo(() => `${toDate}T23:59:59.999Z`, [toDate]);

  const { data: profs } = useQuery({
    queryKey: ['financeiro-profs'],
    queryFn: () => listProfissionais({ page: 1, limit: 200, search: '' }),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['financeiro-list', page, fromIso, toIso, financialStatus, profId],
    queryFn: () =>
      listAppointmentFinancialsPage({
        page,
        limit,
        from: fromIso,
        to: toIso,
        financial_status: financialStatus,
        professional_id: profId || undefined,
      }),
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Financeiro</h1>
        <p className="text-sm text-muted-foreground">
          Leitura DEV/QA — sem liquidação, desconto nem cobrança a partir desta UI.
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
          <Label>Liquidação</Label>
          <Select
            value={financialStatus}
            onValueChange={(v) => {
              setFinancialStatus(v as typeof financialStatus);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="open">Aberto</SelectItem>
              <SelectItem value="settled">Liquidado</SelectItem>
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
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled
            title="Disponível após validação QA"
          >
            Liquidar
          </Button>
          <Button type="button" variant="secondary" disabled title="Disponível após validação QA">
            Desconto
          </Button>
        </div>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error)?.message ?? 'Erro ao carregar financeiro.'}
        </div>
      )}

      {!isLoading && !isError && !(data?.data.length ?? 0) ? (
        <EmptyState icon={Wallet} title="Sem linhas" description="Ajuste o período ou crie agendamentos com snapshot financeiro." />
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
