import { useCallback, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import type { Appointment, AppointmentStatus, CalendarBlock } from '@/types/api';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 0 }),
  getDay,
  locales: { 'pt-BR': ptBR },
});

const STATUS_COLOR: Partial<Record<AppointmentStatus, string>> = {
  awaiting_confirmation: '#94a3b8',
  confirmed: '#3b82f6',
  completed: '#22c55e',
  cancelled: '#ef4444',
  no_show: '#f97316',
  offered: '#a855f7',
  awaiting_payment: '#eab308',
  no_show_pending: '#fb923c',
  checked_in: '#0ea5e9',
  in_service: '#16a34a',
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
  onNavigate: (d: Date) => void;
  onSelectAppointment: (appointment: Appointment) => void;
}

/** Agenda diária operacional: dia único, eventos + bloqueios de calendário. */
export function AgendaCalendar({
  appointments,
  calendarBlocks,
  date,
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

  return (
    <div className="rbc-wrapper h-[720px] rounded-xl border bg-card p-4 shadow-sm">
      <Calendar
        localizer={localizer}
        events={events}
        date={date}
        view={Views.DAY}
        views={{ day: true }}
        onNavigate={onNavigate}
        onView={() => {}}
        toolbar
        onSelectEvent={(e) => {
          const ev = e as CalendarEvent;
          if (ev.resource.kind === 'appointment') onSelectAppointment(ev.resource.appointment);
        }}
        eventPropGetter={eventStyleGetter}
        defaultView={Views.DAY}
        culture="pt-BR"
        messages={{
          week: 'Semana',
          day: 'Dia',
          agenda: 'Lista',
          today: 'Hoje',
          previous: 'Anterior',
          next: 'Proximo',
          showMore: (n: number) => `+${n} mais`,
          noEventsInRange: 'Nenhum evento neste dia.',
        }}
      />
    </div>
  );
}
