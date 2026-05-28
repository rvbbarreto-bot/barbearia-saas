import type { OutboxMessageRow } from '@/types/api';

export const OUTBOX_ERROR_CLASS_LABELS: Record<NonNullable<OutboxMessageRow['error_class']>, string> = {
  auth: 'Autenticação',
  network: 'Rede',
  timeout: 'Timeout',
  provider: 'Provider',
  duplicate: 'Duplicado',
  not_found: 'Não encontrado',
  other: 'Outro',
};

export function labelOutboxErrorClass(errorClass: OutboxMessageRow['error_class']): string {
  if (!errorClass) return '—';
  return OUTBOX_ERROR_CLASS_LABELS[errorClass] ?? errorClass;
}
