import { useQueries } from '@tanstack/react-query';
import { format, startOfDay, endOfDay } from 'date-fns';
import { CalendarDays, Users, User, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { SkeletonCard } from '@/components/shared/SkeletonRows';
import { AppointmentStatusBadge } from '@/components/shared/AppointmentStatusBadge';
import type { PaginatedResponse, Appointment } from '@/types/api';

async function fetchTodayAppointments() {
  const from = format(startOfDay(new Date()), "yyyy-MM-dd'T'HH:mm:ss");
  const to   = format(endOfDay(new Date()),   "yyyy-MM-dd'T'HH:mm:ss");
  const { data } = await api.get<PaginatedResponse<Appointment>>('/api/v1/appointments', {
    params: { from, to, limit: 5, page: 1 },
  });
  return data;
}

async function fetchTotalClientes() {
  const { data } = await api.get<PaginatedResponse<unknown>>('/api/v1/customers', { params: { limit: 1, page: 1 } });
  return data.total;
}

async function fetchTotalProfissionais() {
  const { data } = await api.get<PaginatedResponse<unknown>>('/api/v1/professionals', { params: { limit: 1, page: 1 } });
  return data.total;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  const [todayQ, clientesQ, profQ] = useQueries({
    queries: [
      { queryKey: ['dashboard-today'], queryFn: fetchTodayAppointments, staleTime: 60_000 },
      { queryKey: ['dashboard-clientes'], queryFn: fetchTotalClientes,       staleTime: 120_000 },
      { queryKey: ['dashboard-profissionais'], queryFn: fetchTotalProfissionais, staleTime: 120_000 },
    ],
  });

  const isLoading = todayQ.isLoading || clientesQ.isLoading || profQ.isLoading;

  const kpis = [
    {
      label: 'Agendamentos hoje',
      value: todayQ.data?.total ?? '—',
      icon: CalendarDays,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Clientes',
      value: clientesQ.data ?? '—',
      icon: Users,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: 'Profissionais',
      value: profQ.data ?? '—',
      icon: User,
      color: 'text-green-600',
      bg: 'bg-green-50',
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {kpis.map((k) => (
            <div key={k.label} className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm">
              <div className={`flex size-11 items-center justify-center rounded-xl ${k.bg}`}>
                <k.icon className={`size-5 ${k.color}`} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-muted-foreground">{k.label}</span>
                <span className="text-3xl font-bold text-foreground">{k.value}</span>
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
                  <span className="text-sm font-medium text-foreground">
                    {a.customer_name ?? 'Cliente'}
                  </span>
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
