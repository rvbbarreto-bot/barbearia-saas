import { useMemo, useState } from 'react';
import { addDays, formatISO, startOfDay, startOfWeek } from 'date-fns';
import { Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/shared/SkeletonRows';
import { hasMinRole } from '@/lib/rbac';
import { useAuthStore } from '@/store/authStore';
import type { Appointment, Professional } from '@/types/api';
import { listAppointments, listCalendarBlocks } from './agendaService';
import { listProfissionais } from '../profissionais/profissionaisService';
import { AgendaCalendar } from './AgendaCalendar';
import { NewAppointmentModal } from './NewAppointmentModal';
import { AppointmentDrawer } from './AppointmentDrawer';
import { BlockTimeModal } from './BlockTimeModal';
import { buildAppointmentAlerts } from './appointmentAlerts';
import { Badge } from '@/components/ui/badge';
import { AgendaFiltersBar } from './AgendaFiltersBar';

/** Agenda operacional — dados via API; vista dia ou semana; filtros por profissional e status. */
export function AgendaPage() {
  const user = useAuthStore((s) => s.user);
  const canBook = !!user && user.role !== 'professional' && hasMinRole(user.role, 'attendant');
  const canBlock = !!user && user.role !== 'professional' && hasMinRole(user.role, 'manager');
  const isProfessional = user?.role === 'professional';
  const lockedProfId = isProfessional ? user?.professional_id ?? null : null;

  const [calDate, setCalDate] = useState(() => new Date());
  const [calView, setCalView] = useState<'day' | 'week'>('day');
  const [profFilter, setProfFilter] = useState<string>(() => (lockedProfId ? lockedProfId : 'all'));
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | undefined>();

  const dayStart = startOfDay(calDate);
  const dayEndExclusive = addDays(dayStart, 1);
  const weekStart = startOfWeek(calDate, { weekStartsOn: 1 });
  const weekEndExclusive = addDays(weekStart, 7);
  const rangeStart = calView === 'week' ? weekStart : dayStart;
  const rangeEndExclusive = calView === 'week' ? weekEndExclusive : dayEndExclusive;
  const from = formatISO(rangeStart);
  const to = formatISO(rangeEndExclusive);

  const profFilterResolved = useMemo(() => {
    if (lockedProfId) return lockedProfId;
    return profFilter;
  }, [lockedProfId, profFilter]);

  const blockProfessionalWithoutLink = isProfessional && !lockedProfId;

  const { data: apptData, isLoading: apptLoading } = useQuery({
    queryKey: ['appointments', from, to, profFilterResolved, statusFilter, calView],
    queryFn: () =>
      listAppointments({
        from,
        to,
        professional_id: profFilterResolved !== 'all' ? profFilterResolved : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
    staleTime: 15_000,
    enabled: !blockProfessionalWithoutLink,
  });

  const { data: profData } = useQuery({
    queryKey: ['profissionais', 1, ''],
    queryFn: () => listProfissionais({ page: 1, limit: 100, search: '' }),
    staleTime: 120_000,
    enabled: !lockedProfId,
  });
  const profissionais: Professional[] = profData?.data ?? [];

  /** Sem filtro server-side por profissional: bloqueios globais (`professional_id` null) têm de aparecer em qualquer filtro. */
  const { data: blocksRaw = [] } = useQuery({
    queryKey: ['calendar-blocks', from, to, calView],
    queryFn: () => listCalendarBlocks({ from, to }),
    staleTime: 15_000,
    enabled: !blockProfessionalWithoutLink,
  });

  const calendarBlocks = useMemo(() => {
    if (profFilterResolved === 'all') return blocksRaw;
    return blocksRaw.filter((b) => !b.professional_id || b.professional_id === profFilterResolved);
  }, [blocksRaw, profFilterResolved]);

  const appointments: Appointment[] = apptData?.data ?? [];

  /** Dados frescos da lista após invalidação (ex.: check-in), sem setState em effect. */
  const appointmentForDrawer =
    selectedAppt?.id && apptData?.data?.length
      ? (apptData.data.find((a) => a.id === selectedAppt.id) ?? selectedAppt)
      : selectedAppt;

  const alertSummary = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of appointments) {
      map.set(a.id, buildAppointmentAlerts(a, appointments));
    }
    return map;
  }, [appointments]);

  if (blockProfessionalWithoutLink) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Agenda diária</h1>
          <p className="text-sm text-muted-foreground">Perfil profissional</p>
        </div>
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Não é possível visualizar a agenda: o seu utilizador não está associado a um profissional (
          <code className="rounded bg-muted px-1 font-mono text-foreground">users.professional_id</code>
          ). Peça ao gerente para concluir o vínculo e volte a iniciar sessão se necessário.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Agenda operacional</h1>
          <p className="text-sm text-muted-foreground">
            {appointments.length} agendamento{appointments.length !== 1 ? 's' : ''}{' '}
            {calView === 'week' ? 'nesta semana' : 'neste dia'}
            {calendarBlocks.length > 0 && ` · ${calendarBlocks.length} bloqueio(s)`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canBook && (
            <Button onClick={() => setNewModalOpen(true)}>
              <Plus className="size-4" />
              <span>Novo agendamento</span>
            </Button>
          )}
          {canBlock && (
            <Button variant="secondary" onClick={() => setBlockModalOpen(true)}>
              Bloquear horário
            </Button>
          )}
        </div>
      </div>

      <AgendaFiltersBar
        calDate={calDate}
        calView={calView}
        profFilter={profFilter}
        statusFilter={statusFilter}
        profissionais={profissionais}
        lockedProfId={lockedProfId}
        onDateChange={setCalDate}
        onViewChange={setCalView}
        onProfFilterChange={setProfFilter}
        onStatusFilterChange={setStatusFilter}
      />

      {appointments.some((a) => (alertSummary.get(a.id)?.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-amber-500/30 bg-amber-950/40 px-3 py-2 text-sm">
          <span className="font-medium text-amber-100">
            Alertas {calView === 'week' ? 'no período' : 'no dia'}:
          </span>
          {appointments.flatMap((a) =>
            (alertSummary.get(a.id) ?? []).map((msg, i) => (
              <Badge key={`${a.id}-${i}`} variant="outline" className="border-amber-500/50 text-amber-50">
                {a.customer_name ?? 'Cliente'} — {msg}
              </Badge>
            )),
          )}
        </div>
      )}

      {apptLoading ? (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <SkeletonRows rows={8} cols={4} />
        </div>
      ) : (
        <AgendaCalendar
          appointments={appointments}
          calendarBlocks={calendarBlocks}
          date={calDate}
          calendarView={calView}
          onNavigate={setCalDate}
          onSelectAppointment={setSelectedAppt}
        />
      )}

      <NewAppointmentModal open={newModalOpen} onClose={() => setNewModalOpen(false)} />

      <BlockTimeModal
        open={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        professionals={profissionais}
        defaultProfessionalId={profFilterResolved !== 'all' ? profFilterResolved : null}
      />

      <AppointmentDrawer appointment={appointmentForDrawer} onClose={() => setSelectedAppt(undefined)} />
    </div>
  );
}
