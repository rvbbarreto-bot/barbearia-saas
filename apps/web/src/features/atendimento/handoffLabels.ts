import type { HandoffReasonCode } from '@/types/api';

export const HANDOFF_REASON_OPTIONS: { value: HandoffReasonCode; label: string }[] = [
  { value: 'ia_uncertain', label: 'IA incerta' },
  { value: 'customer_angry', label: 'Cliente irritado' },
  { value: 'payment_failed', label: 'Pagamento falhou' },
  { value: 'schedule_conflict', label: 'Conflito de agenda' },
  { value: 'customer_restricted', label: 'Cliente restrito' },
  { value: 'ambiguous_two_turns', label: 'Mensagem ambígua (duas interações)' },
  { value: 'out_of_scope', label: 'Pedido fora do escopo' },
];

export function handoffReasonLabel(code: string | null | undefined): string {
  if (!code) return '—';
  const row = HANDOFF_REASON_OPTIONS.find((o) => o.value === code);
  return row?.label ?? code;
}

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

export function priorityLabel(p: string): string {
  return PRIORITY_LABEL[p] ?? p;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em atendimento',
  waiting_customer: 'Aguarda cliente',
  resolved: 'Resolvido',
  closed: 'Encerrado',
};

export function ticketStatusLabel(s: string): string {
  return STATUS_LABEL[s] ?? s;
}
