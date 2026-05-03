import { Badge } from '@/components/ui/badge';
import type { AppointmentStatus } from '@/types/api';

const STATUS_MAP: Partial<
  Record<AppointmentStatus, { label: string; variant: 'default' | 'success' | 'destructive' | 'warning' | 'muted' }>
> = {
  awaiting_confirmation: { label: 'Aguardando confirmação', variant: 'muted' },
  confirmed: { label: 'Confirmado', variant: 'default' },
  completed: { label: 'Concluído', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  no_show: { label: 'Não compareceu', variant: 'warning' },
  offered: { label: 'Ofertado', variant: 'muted' },
  awaiting_payment: { label: 'Aguardando pagamento', variant: 'warning' },
  no_show_pending: { label: 'Possível no-show', variant: 'warning' },
  checked_in: { label: 'Check-in', variant: 'default' },
  in_service: { label: 'Em atendimento', variant: 'success' },
  rescheduled: { label: 'Remarcado', variant: 'muted' },
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, variant } = STATUS_MAP[status] ?? { label: status, variant: 'muted' as const };
  return <Badge variant={variant}>{label}</Badge>;
}
