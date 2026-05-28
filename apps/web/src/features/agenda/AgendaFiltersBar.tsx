import { addDays, format, formatISO, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Professional } from '@/types/api';
import './agenda-filters.css';

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos os status' },
  { value: 'draft', label: 'Rascunho' },
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

interface AgendaFiltersBarProps {
  calDate: Date;
  calView: 'day' | 'week';
  profFilter: string;
  statusFilter: string;
  profissionais: Professional[];
  lockedProfId: string | null;
  onDateChange: (date: Date) => void;
  onViewChange: (view: 'day' | 'week') => void;
  onProfFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
}

/** Barra de filtros da agenda — alinhada ao tema escuro e ao bloco do calendário. */
export function AgendaFiltersBar({
  calDate,
  calView,
  profFilter,
  statusFilter,
  profissionais,
  lockedProfId,
  onDateChange,
  onViewChange,
  onProfFilterChange,
  onStatusFilterChange,
}: AgendaFiltersBarProps) {
  const periodLabel =
    calView === 'week'
      ? `Semana de ${format(calDate, "d 'de' MMMM", { locale: ptBR })}`
      : format(calDate, "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <section
      className="agenda-filters rounded-xl border border-border bg-card/90 p-4 shadow-sm backdrop-blur-sm"
      aria-label="Filtros da agenda"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <CalendarDays className="size-4 text-primary" aria-hidden />
        <span className="font-medium capitalize text-foreground">{periodLabel}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px] lg:items-end">
        {/* Período + vista */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Período
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="agenda-nav-btn size-9 shrink-0"
              aria-label={calView === 'week' ? 'Semana anterior' : 'Dia anterior'}
              onClick={() => onDateChange(addDays(calDate, calView === 'week' ? -7 : -1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Input
              type="date"
              aria-label="Data da agenda"
              className="agenda-date-input h-9 w-[min(100%,10.5rem)] shrink-0 font-medium"
              value={formatISO(calDate, { representation: 'date' })}
              onChange={(e) => {
                const v = e.target.value;
                if (v) onDateChange(startOfDay(new Date(`${v}T12:00:00`)));
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="agenda-nav-btn size-9 shrink-0"
              aria-label={calView === 'week' ? 'Próxima semana' : 'Próximo dia'}
              onClick={() => onDateChange(addDays(calDate, calView === 'week' ? 7 : 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-3 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => onDateChange(startOfDay(new Date()))}
            >
              Hoje
            </Button>
            <div
              className="agenda-view-toggle ml-0.5 flex gap-0.5 rounded-lg border p-0.5 sm:ml-1"
              role="group"
              aria-label="Tipo de vista"
            >
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 border-0 px-3 shadow-none"
                data-active={calView === 'day' ? 'true' : 'false'}
                onClick={() => onViewChange('day')}
              >
                Dia
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 border-0 px-3 shadow-none"
                data-active={calView === 'week' ? 'true' : 'false'}
                onClick={() => onViewChange('week')}
              >
                Semana
              </Button>
            </div>
          </div>
        </div>

        {/* Profissional */}
        {lockedProfId ? (
          <div className="flex flex-col gap-2 lg:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Profissional
            </span>
            <p className="flex h-9 items-center text-sm text-muted-foreground">
              A visualizar a <span className="font-medium text-foreground">sua agenda</span> (perfil
              profissional).
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label
              htmlFor="agenda-filter-professional"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Profissional
            </label>
            <Select value={profFilter} onValueChange={onProfFilterChange}>
              <SelectTrigger id="agenda-filter-professional" className="agenda-select-trigger w-full">
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
          </div>
        )}

        {/* Status */}
        <div className={cn('flex flex-col gap-2', lockedProfId && 'lg:col-start-3')}>
          <label
            htmlFor="agenda-filter-status"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Status
          </label>
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger id="agenda-filter-status" className="agenda-select-trigger w-full">
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
      </div>
    </section>
  );
}
