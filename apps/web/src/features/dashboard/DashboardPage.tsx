import { useQueries } from '@tanstack/react-query';
import { format, startOfDay, endOfDay } from 'date-fns';
import { countNoShowsInResponse } from './countNoShowsInResponse';
import {
  CalendarDays,
  ListOrdered,
  Users,
  User,
  Clock,
  UserX,
  Radio,
  Inbox,
  Wallet,
  Percent,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useMemo } from 'react';
import { SkeletonCard } from '@/components/shared/SkeletonRows';
import { AppointmentStatusBadge } from '@/components/shared/AppointmentStatusBadge';
import type { Appointment, CommissionEntryRow, PaginatedResponse, WaitlistEntry } from '@/types/api';
import { formatCentsBrl } from '@/features/financeiro/formatCentsBrl';

function todayRangeIso() {
  const from = startOfDay(new Date()).toISOString();
  const to = endOfDay(new Date()).toISOString();
  return { from, to };
}

function logDashboardKpiFailure(kpiLabel: string, err: unknown) {
  console.error(`[Dashboard] KPI "${kpiLabel}": falha na consulta à API`, err);
}

async function fetchTodayAppointments() {
  const { from, to } = todayRangeIso();
  try {
    const { data } = await api.get<PaginatedResponse<Appointment>>('/api/v1/appointments', {
      params: { from, to, limit: 5, page: 1 },
    });
    return data;
  } catch (e) {
    logDashboardKpiFailure('Agendamentos hoje', e);
    throw e;
  }
}

async function fetchTodayAppointmentsForNoShow() {
  const { from, to } = todayRangeIso();
  try {
    const { data } = await api.get<PaginatedResponse<Appointment>>('/api/v1/appointments', {
      params: { from, to, limit: 500, page: 1 },
    });
    return countNoShowsInResponse(data);
  } catch (e) {
    logDashboardKpiFailure('No-show hoje', e);
    throw e;
  }
}

async function fetchTotalClientes() {
  try {
    const { data } = await api.get<PaginatedResponse<unknown>>('/api/v1/customers', { params: { limit: 1, page: 1 } });
    return data.total;
  } catch (e) {
    logDashboardKpiFailure('Clientes', e);
    throw e;
  }
}

async function fetchTotalProfissionais() {
  try {
    const { data } = await api.get<PaginatedResponse<unknown>>('/api/v1/professionals', { params: { limit: 1, page: 1 } });
    return data.total;
  } catch (e) {
    logDashboardKpiFailure('Profissionais', e);
    throw e;
  }
}

async function fetchWaitlistActiveTotal() {
  try {
    const { data } = await api.get<PaginatedResponse<WaitlistEntry>>('/api/v1/waitlist', {
      params: { page: 1, limit: 1, status: 'active' },
    });
    return data.total;
  } catch (e) {
    logDashboardKpiFailure('Fila de espera (ativas)', e);
    throw e;
  }
}

async function fetchRecallCandidatesTotal() {
  try {
    const { data } = await api.get<{ total: number }>('/api/v1/recall/candidates', {
      params: { only_sendable: 'false', limit: 1, offset: 0 },
    });
    return data.total;
  } catch (e) {
    logDashboardKpiFailure('Recall (candidatos)', e);
    throw e;
  }
}

async function fetchOutboxSummary() {
  try {
    const { data } = await api.get<{ pending: number; dead: number }>(
      '/api/v1/integrations/outbound/outbox-summary',
    );
    return data;
  } catch (e) {
    logDashboardKpiFailure('Outbox', e);
    throw e;
  }
}

async function fetchTodayRevenueCents() {
  const date = format(new Date(), 'yyyy-MM-dd');
  try {
    const { data } = await api.get<{ revenue?: { grand_total_cents?: number } }>('/api/v1/finance/reports/daily', {
      params: { date },
    });
    return data.revenue?.grand_total_cents ?? null;
  } catch (e) {
    logDashboardKpiFailure('Receita hoje (relatório)', e);
    throw e;
  }
}

async function fetchCommissionPendingTotal() {
  try {
    const { data } = await api.get<PaginatedResponse<CommissionEntryRow>>('/api/v1/commission/entries', {
      params: { status: 'pending', limit: 1, page: 1 },
    });
    return data.total;
  } catch (e) {
    logDashboardKpiFailure('Comissão pendente', e);
    throw e;
  }
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

const ROLE_LEVEL: Record<string, number> = {
  viewer: 10,
  attendant: 20,
  professional: 30,
  manager: 40,
  tenant_admin: 50,
  tenant_owner: 60,
  platform_admin: 100,
};

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const lv = ROLE_LEVEL[user?.role ?? 'viewer'] ?? 0;

  const waitlistKpiEnabled = useMemo(() => lv >= ROLE_LEVEL.attendant, [lv]);
  const noShowEnabled = useMemo(() => lv >= ROLE_LEVEL.viewer, [lv]);
  const recallEnabled = useMemo(() => lv >= ROLE_LEVEL.viewer, [lv]);
  const outboxEnabled = useMemo(() => lv >= ROLE_LEVEL.manager, [lv]);
  const revenueEnabled = useMemo(() => lv >= ROLE_LEVEL.tenant_admin, [lv]);
  const commissionPendingEnabled = useMemo(() => lv >= ROLE_LEVEL.manager, [lv]);

  const results = useQueries({
    queries: [
      { queryKey: ['dashboard-today'], queryFn: fetchTodayAppointments, staleTime: 60_000 },
      { queryKey: ['dashboard-clientes'], queryFn: fetchTotalClientes, staleTime: 120_000 },
      { queryKey: ['dashboard-profissionais'], queryFn: fetchTotalProfissionais, staleTime: 120_000 },
      {
        queryKey: ['dashboard-waitlist-active'],
        queryFn: fetchWaitlistActiveTotal,
        staleTime: 60_000,
        enabled: waitlistKpiEnabled,
      },
      {
        queryKey: ['dashboard-no-show'],
        queryFn: fetchTodayAppointmentsForNoShow,
        staleTime: 60_000,
        enabled: noShowEnabled,
      },
      {
        queryKey: ['dashboard-recall-total'],
        queryFn: fetchRecallCandidatesTotal,
        staleTime: 120_000,
        enabled: recallEnabled,
      },
      {
        queryKey: ['dashboard-outbox'],
        queryFn: fetchOutboxSummary,
        staleTime: 60_000,
        enabled: outboxEnabled,
      },
      {
        queryKey: ['dashboard-revenue-day'],
        queryFn: fetchTodayRevenueCents,
        staleTime: 120_000,
        enabled: revenueEnabled,
      },
      {
        queryKey: ['dashboard-commission-pending'],
        queryFn: fetchCommissionPendingTotal,
        staleTime: 120_000,
        enabled: commissionPendingEnabled,
      },
    ],
  });

  const [
    todayQ,
    clientesQ,
    profQ,
    waitQ,
    noShowQ,
    recallQ,
    outboxQ,
    revenueQ,
    commissionQ,
  ] = results;

  const isLoading = results.some((r) => r.isLoading);

  const kpis = [
    {
      label: 'Agendamentos hoje',
      value: todayQ.isError ? '—' : (todayQ.data?.total ?? '—'),
      valueTitle: todayQ.isError ? 'Indicador indisponível — ver consola (F12).' : undefined,
      icon: CalendarDays,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Clientes',
      value: clientesQ.isError ? '—' : (clientesQ.data ?? '—'),
      valueTitle: clientesQ.isError ? 'Indicador indisponível — ver consola (F12).' : undefined,
      icon: Users,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: 'Profissionais',
      value: profQ.isError ? '—' : (profQ.data ?? '—'),
      valueTitle: profQ.isError ? 'Indicador indisponível — ver consola (F12).' : undefined,
      icon: User,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Fila de espera (ativas)',
      value: !waitlistKpiEnabled ? '—' : waitQ.isError ? '—' : String(waitQ.data ?? 0),
      valueTitle: waitlistKpiEnabled && waitQ.isError ? 'Indicador indisponível — ver consola (F12).' : undefined,
      icon: ListOrdered,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      label: 'No-show hoje',
      value: !noShowEnabled ? '—' : noShowQ.isError ? '—' : String(noShowQ.data ?? 0),
      valueTitle:
        noShowEnabled && noShowQ.isError
          ? 'Falha técnica ao obter dados — não é “zero real”. Ver consola (F12).'
          : undefined,
      icon: UserX,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
    },
    {
      label: 'Recall (candidatos)',
      value: !recallEnabled ? '—' : recallQ.isError ? '—' : String(recallQ.data ?? 0),
      valueTitle: recallEnabled && recallQ.isError ? 'Indicador indisponível — ver consola (F12).' : undefined,
      icon: Radio,
      color: 'text-cyan-600',
      bg: 'bg-cyan-50',
    },
    {
      label: 'Outbox pendente',
      value: !outboxEnabled ? '—' : outboxQ.isError ? '—' : String(outboxQ.data?.pending ?? 0),
      valueTitle: outboxEnabled && outboxQ.isError ? 'Indicador indisponível — ver consola (F12).' : undefined,
      icon: Inbox,
      color: 'text-amber-700',
      bg: 'bg-amber-50',
    },
    {
      label: 'Outbox dead',
      value: !outboxEnabled ? '—' : outboxQ.isError ? '—' : String(outboxQ.data?.dead ?? 0),
      valueTitle: outboxEnabled && outboxQ.isError ? 'Indicador indisponível — ver consola (F12).' : undefined,
      icon: Inbox,
      color: 'text-red-700',
      bg: 'bg-red-50',
    },
    {
      label: 'Receita hoje (relatório)',
      value: !revenueEnabled ? '—' : revenueQ.isError ? formatCentsBrl(null) : formatCentsBrl(revenueQ.data ?? undefined),
      valueTitle: revenueEnabled && revenueQ.isError ? 'Indicador temporariamente indisponível' : undefined,
      icon: Wallet,
      color: 'text-emerald-700',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Comissão pendente',
      value: !commissionPendingEnabled ? '—' : commissionQ.isError ? '—' : String(commissionQ.data ?? 0),
      valueTitle: commissionPendingEnabled && commissionQ.isError ? 'Indicador indisponível — ver consola (F12).' : undefined,
      icon: Percent,
      color: 'text-indigo-700',
      bg: 'bg-indigo-50',
    },
  ];

  const nextAppointments = todayQ.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {greeting()}, {user?.name?.split(' ')[0] ?? 'usuario'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: undefined })}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm">
              <div className={`flex size-11 items-center justify-center rounded-xl ${k.bg}`}>
                <k.icon className={`size-5 ${k.color}`} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-muted-foreground">{k.label}</span>
                <span className="text-2xl font-bold text-foreground" title={'valueTitle' in k ? k.valueTitle : undefined}>
                  {k.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">Proximos agendamentos hoje</h2>
        {todayQ.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : nextAppointments.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border bg-card px-5 py-4">
            <Clock className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum agendamento para hoje.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {nextAppointments.map((a: Appointment) => (
              <div key={a.id} className="flex items-center justify-between rounded-xl border bg-card px-5 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{a.customer_name ?? 'Cliente'}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.professional_name ?? '—'} · {format(new Date(a.starts_at), 'HH:mm')}
                  </span>
                </div>
                <AppointmentStatusBadge status={a.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
