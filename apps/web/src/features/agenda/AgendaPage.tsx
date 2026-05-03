import { useMemo, useState } from 'react';
import { addDays, formatISO, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SkeletonRows } from '@/components/shared/SkeletonRows';
import { useRoleGate } from '@/hooks/useRoleGate';
import { hasMinRole } from '@/lib/rbac';
import { useAuthStore } from '@/store/authStore';
import type { Appointment, Professional } from '@/types/api';
import { listAppointments, listCalendarBlocks } from './agendaService';
import { listProfissionais } from '../profissionais/profissionaisService';
import { AgendaCalendar } from './AgendaCalendar';
import { NewAppointmentModal } from './NewAppointmentModal';
import { AppointmentDrawer } from './AppointmentDrawer';
import { BlockTimeModal } from './BlockTimeModal';
import { Input } from '@/components/ui/input';
import { buildAppointmentAlerts } from './appointmentAlerts';
import { Badge } from '@/components/ui/badge';

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos os status' },
  { value: 'awaiting_confirmation', label: 'Aguardando confirmação' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'awaiting_payment', label: 'Aguardando pagamento' },
  { value: 'no_show_pending', label: 'Possível no-show' },
  { value: 'checked_in', label: 'Check-in' },
  { value: 'in_service', label: 'Em atendimento' },
  { value: 'completed', label: 'Concluído' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'no_show', label: 'No-show' },
  { value: 'offered', label: 'Ofertado' },
];

/** Agenda diária operacional — dados sempre via API; filtros por dia, profissional e status. */
export function AgendaPage() {
  const user = useAuthStore((s) => s.user);
  const canBook = !!user && user.role !== 'professional' && hasMinRole(user.role, 'attendant');
  const canBlock = useRoleGate('manager');
  const isProfessional = user?.role === 'professional';
  const lockedProfId = isProfessional ? user?.professional_id ?? null : null;

  const [calDate, setCalDate] = useState(() => new Date());
  const [profFilter, setProfFilter] = useState<string>(() => (lockedProfId ? lockedProfId : 'all'));
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | undefined>();

  const dayStart = startOfDay(calDate);
  const dayEndExclusive = addDays(dayStart, 1);
  const from = formatISO(dayStart);
  const to = formatISO(dayEndExclusive);

  const profFilterResolved = useMemo(() => {
    if (lockedProfId) return lockedProfId;
    return profFilter;
  }, [lockedProfId, profFilter]);

  const blockProfessionalWithoutLink = isProfessional && !lockedProfId;

  const { data: apptData, isLoading: apptLoading } = useQuery({
    queryKey: ['appointments', from, to, profFilterResolved, statusFilter],
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
    queryKey: ['calendar-blocks', from, to],
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
          <h1 className="text-2xl font-semibold text-foreground">Agenda diária</h1>
          <p className="text-sm text-muted-foreground">
            {appointments.length} agendamento{appointments.length !== 1 ? 's' : ''} neste dia
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

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Dia anterior" onClick={() => setCalDate((d) => addDays(d, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Input
            type="date"
            className="w-[160px]"
            value={formatISO(calDate, { representation: 'date' })}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setCalDate(startOfDay(new Date(`${v}T12:00:00`)));
            }}
          />
          <Button variant="outline" size="icon" aria-label="Próximo dia" onClick={() => setCalDate((d) => addDays(d, 1))}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setCalDate(startOfDay(new Date()))}>
            Hoje
          </Button>
        </div>

        {lockedProfId ? (
          <p className="text-sm text-muted-foreground">
            A visualizar a <span className="font-medium text-foreground">sua agenda</span> (perfil profissional).
          </p>
        ) : (
          <Select value={profFilter} onValueChange={setProfFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Profissional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os profissionais</SelectItem>
              {profissionais.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {appointments.some((a) => (alertSummary.get(a.id)?.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
          <span className="font-medium text-amber-900 dark:text-amber-100">Alertas no dia:</span>
          {appointments.flatMap((a) =>
            (alertSummary.get(a.id) ?? []).map((msg, i) => (
              <Badge key={`${a.id}-${i}`} variant="outline" className="border-amber-400 text-amber-950 dark:text-amber-50">
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
