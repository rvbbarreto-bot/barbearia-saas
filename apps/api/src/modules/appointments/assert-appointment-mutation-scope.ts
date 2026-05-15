import { AppError } from '../../shared/errors.js';
import {
  resolveAppointmentProfessionalFilter,
  type ListAppointmentsCaller,
} from './appointment-list-scope.js';

export type AppointmentMutationCaller = ListAppointmentsCaller & {
  requestId?: string;
  correlationId?: string;
};

/**
 * Profissional autenticado só pode mutar agendamentos do próprio `professional_id`.
 * Demais roles passam sem filtro adicional (RBAC de rota já aplicado).
 */
export async function assertAppointmentMutationScope(
  tenantId: string,
  appointment: { professional_id: unknown },
  caller?: AppointmentMutationCaller | null,
): Promise<void> {
  if (caller?.role !== 'professional') return;

  const allowedProfId = await resolveAppointmentProfessionalFilter(tenantId, caller);
  if (String(appointment.professional_id) !== allowedProfId) {
    throw new AppError(
      'FORBIDDEN',
      'Profissional só pode alterar agendamentos da própria agenda.',
      403,
    );
  }
}
