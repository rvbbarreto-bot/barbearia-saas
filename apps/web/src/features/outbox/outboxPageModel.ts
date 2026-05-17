import type { OutboxMessagesQuery } from './outboxMessagesService';
import { hasMinRole } from '@/lib/rbac';

export type OutboxFilterFormState = {
  page: number;
  limit: number;
  status: string;
  provider: string;
  from: string;
  to: string;
  correlationId: string;
  appointmentId: string;
  destination: string;
  customerId: string;
  errorClass: string;
};

export function buildOutboxMessagesQuery(state: OutboxFilterFormState): OutboxMessagesQuery {
  return {
    page: state.page,
    limit: state.limit,
    status: state.status === '__all__' ? undefined : state.status,
    provider: state.provider.trim() || undefined,
    from: state.from.trim() || undefined,
    to: state.to.trim() || undefined,
    correlation_id: state.correlationId.trim() || undefined,
    appointment_id: state.appointmentId.trim() || undefined,
    destination: state.destination.trim() || undefined,
    customer_id: state.customerId.trim() || undefined,
    error_class: state.errorClass === '__all__' ? undefined : state.errorClass,
  };
}

export function canShowOutboxRetryButton(
  role: string | undefined,
  status: string | undefined,
): boolean {
  if (!role || !hasMinRole(role, 'manager')) return false;
  return status === 'failed' || status === 'dead';
}
