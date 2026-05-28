import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { BarChart3, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonRows } from '@/components/shared/SkeletonRows';
import { formatCentsBrl } from '@/features/financeiro/formatCentsBrl';
import { useAuthStore } from '@/store/authStore';
import {
  fetchManagementDashboard,
  managementDashboardExportUrl,
  type ManagementDashboard,
} from './managementDashboardService';

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function ManagementDashboardPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);
  const [fromDate, setFromDate] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const params = useMemo(
    () => ({
      from: new Date(`${fromDate}T00:00:00`).toISOString(),
      to: new Date(`${toDate}T23:59:59`).toISOString(),
    }),
    [fromDate, toDate],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['management-dashboard', params],
    queryFn: () => fetchManagementDashboard(params),
  });

  const exportHref = useMemo(() => managementDashboardExportUrl(params), [params]);

  const handleExport = () => {
    const headers = new Headers();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    if (tenantId) headers.set('X-Tenant-Id', tenantId);
    fetch(exportHref, { headers })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'dashboard-export.csv';
        a.click();
      });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-7 w-7" />
          Dashboard gerencial
        </h1>
        <SkeletonRows rows={6} cols={3} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          title="Erro ao carregar dashboard"
          description={error instanceof Error ? error.message : 'Tente novamente.'}
          actionLabel="Tentar de novo"
          onAction={() => refetch()}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <EmptyState title="Sem dados" description="Ajuste o período ou aguarde novos agendamentos." />
      </div>
    );
  }

  return (
    <DashboardContent
      data={data}
      fromDate={fromDate}
      toDate={toDate}
      setFromDate={setFromDate}
      setToDate={setToDate}
      onExport={handleExport}
    />
  );
}

function DashboardContent({
  data,
  fromDate,
  toDate,
  setFromDate,
  setToDate,
  onExport,
}: {
  data: ManagementDashboard;
  fromDate: string;
  toDate: string;
  setFromDate: (v: string) => void;
  setToDate: (v: string) => void;
  onExport: () => void;
}) {
  const { kpis } = data;
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-7 w-7" />
          Dashboard gerencial
        </h1>
        <Button variant="outline" onClick={onExport}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <Label htmlFor="from">De</Label>
          <Input id="from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="to">Até</Label>
          <Input id="to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Faturamento bruto" value={formatCentsBrl(kpis.gross_revenue_cents)} />
        <KpiCard label="Faturamento líquido" value={formatCentsBrl(kpis.net_revenue_cents)} />
        <KpiCard label="Ticket médio" value={formatCentsBrl(kpis.average_ticket_cents)} />
        <KpiCard label="Taxa conclusão" value={`${(kpis.completion_rate * 100).toFixed(1)}%`} />
        <KpiCard label="Agend. criados" value={String(kpis.appointments_created)} />
        <KpiCard label="Concluídos" value={String(kpis.appointments_completed)} />
        <KpiCard label="Cancelamentos" value={String(kpis.appointments_cancelled)} />
        <KpiCard label="No-show" value={String(kpis.no_show_count)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h2 className="font-semibold mb-3">Serviços mais vendidos</h2>
          {data.top_services.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum serviço no período.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.top_services.map((s) => (
                <li key={s.service_id} className="flex justify-between">
                  <span>{s.service_name}</span>
                  <span className="tabular-nums">
                    {s.count} · {formatCentsBrl(s.revenue_cents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border p-4">
          <h2 className="font-semibold mb-3">Profissionais mais produtivos</h2>
          {data.top_professionals.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum dado no período.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.top_professionals.map((p) => (
                <li key={p.professional_id} className="flex justify-between">
                  <span>{p.professional_name}</span>
                  <span className="tabular-nums">
                    {p.completed} · {formatCentsBrl(p.revenue_cents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="font-semibold mb-2">Outbox por status</h2>
        <p className="text-sm text-muted-foreground">
          Pendentes: {data.outbox.pending} · Dead: {data.outbox.dead}
        </p>
        <ul className="mt-2 flex flex-wrap gap-3 text-sm">
          {Object.entries(data.outbox.by_status).map(([status, count]) => (
            <li key={status} className="rounded bg-muted px-2 py-1">
              {status}: {count}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
