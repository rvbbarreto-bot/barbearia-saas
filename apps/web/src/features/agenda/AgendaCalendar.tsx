import { useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './agenda-calendar.css';
import type { Appointment, AppointmentStatus, CalendarBlock } from '@/types/api';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }),
  getDay,
  locales: { 'pt-BR': ptBR },
});

/** Cores alinhadas ao tema escuro — contraste AA em fundo navy */
const STATUS_COLOR: Partial<Record<AppointmentStatus, string>> = {
  awaiting_confirmation: '#64748b',
  confirmed: '#38bdf8',
  completed: '#4ade80',
  cancelled: '#f87171',
  no_show: '#fb923c',
  offered: '#c084fc',
  awaiting_payment: '#facc15',
  no_show_pending: '#fdba74',
  checked_in: '#22d3ee',
  in_service: '#2dd4bf',
};

const STATUS_LABEL: Partial<Record<AppointmentStatus, string>> = {
  awaiting_confirmation: 'Aguard. conf.',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'No-show',
  offered: 'Ofertado',
  awaiting_payment: 'Aguard. pag.',
  no_show_pending: 'Poss. no-show',
  checked_in: 'Check-in',
  in_service: 'Em atendimento',
};

const BLOCK_COLOR = '#64748b';

const SOURCE_SHORT: Partial<Record<string, string>> = {
  whatsapp: 'WA',
  manual: 'Man',
  walk_in: 'W-in',
  admin: 'Adm',
};

function appointmentEventTitle(a: Appointment): string {
  const src = a.source ?? '';
  const short = src ? SOURCE_SHORT[src] ?? src.slice(0, 4) : '';
  const tag = short ? ` [${short}]` : '';
  return `${a.customer_name ?? 'Cliente'}${tag} · ${a.status}`;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: { kind: 'appointment'; appointment: Appointment } | { kind: 'block'; block: CalendarBlock };
}

interface Props {
  appointments: Appointment[];
  calendarBlocks: CalendarBlock[];
  date: Date;
  /** Vista diária (P2.1) ou semanal simples (P2.2.1). */
  calendarView?: 'day' | 'week';
  onNavigate: (d: Date) => void;
  onSelectAppointment: (appointment: Appointment) => void;
}

/** Agenda operacional: dia ou semana, eventos + bloqueios de calendário. */
export function AgendaCalendar({
  appointments,
  calendarBlocks,
  date,
  calendarView = 'day',
  onNavigate,
  onSelectAppointment,
}: Props) {
  const events = useMemo<CalendarEvent[]>(() => {
    const ap = appointments.map((a) => ({
      id: `appt-${a.id}`,
      title: appointmentEventTitle(a),
      start: new Date(a.starts_at),
      end: new Date(a.ends_at),
      resource: { kind: 'appointment' as const, appointment: a },
    }));
    const blk = calendarBlocks.map((b) => ({
      id: `block-${b.id}`,
      title: b.reason?.trim() ? `Bloqueio · ${b.reason}` : 'Bloqueio',
      start: new Date(b.starts_at),
      end: new Date(b.ends_at),
      resource: { kind: 'block' as const, block: b },
    }));
    return [...ap, ...blk];
  }, [appointments, calendarBlocks]);

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    if (event.resource.kind === 'block') {
      return {
        style: {
          backgroundColor: BLOCK_COLOR,
          borderRadius: '6px',
          border: 'none',
          color: '#fff',
          fontSize: '12px',
          padding: '2px 6px',
          opacity: 0.92,
        },
      };
    }
    const st = event.resource.appointment.status;
    return {
      style: {
        backgroundColor: STATUS_COLOR[st] ?? '#94a3b8',
        borderRadius: '6px',
        border: 'none',
        color: '#fff',
        fontSize: '12px',
        padding: '2px 6px',
      },
    };
  }, []);

  const view = calendarView === 'week' ? Views.WEEK : Views.DAY;
  const views = calendarView === 'week' ? { week: true } : { day: true };

  const legendStatuses = (
    [
      'confirmed',
      'awaiting_confirmation',
      'checked_in',
      'in_service',
      'completed',
      'cancelled',
      'no_show',
    ] as AppointmentStatus[]
  ).filter((s) => STATUS_COLOR[s]);

  return (
    <div className="agenda-calendar rbc-wrapper flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3 text-xs text-muted-foreground"
        aria-label="Legenda de status dos agendamentos"
      >
        <span className="font-medium text-foreground">Legenda:</span>
        {legendStatuses.map((st) => (
          <span key={st} className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: STATUS_COLOR[st] }}
              aria-hidden
            />
            {STATUS_LABEL[st] ?? st}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-sm bg-slate-500" aria-hidden />
          Bloqueio
        </span>
      </div>
      <div className="h-[min(720px,calc(100vh-16rem))] min-h-[480px]">
      <Calendar
        localizer={localizer}
        events={events}
        date={date}
        view={view}
        views={views}
        onNavigate={onNavigate}
        onView={() => {}}
        toolbar={false}
        onSelectEvent={(e) => {
          const ev = e as CalendarEvent;
          if (ev.resource.kind === 'appointment') onSelectAppointment(ev.resource.appointment);
        }}
        eventPropGetter={eventStyleGetter}
        defaultView={view}
        culture="pt-BR"
        messages={{
          week: 'Semana',
          day: 'Dia',
          agenda: 'Lista',
          today: 'Hoje',
          previous: 'Anterior',
          next: 'Próximo',
          showMore: (n: number) => `+${n} mais`,
          noEventsInRange: 'Nenhum evento neste período.',
        }}
      />
      </div>
    </div>
  );
}
