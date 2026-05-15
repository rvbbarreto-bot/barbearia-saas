import { AppError } from '../../shared/errors.js';

/** Tolerância de 1 minuto para relógio cliente/servidor. */
export const APPOINTMENT_PAST_GRACE_MS = 60_000;

export function assertAppointmentStartsNotInPast(
  startsAtIso: string,
  nowMs: number = Date.now(),
): void {
  const startMs = Date.parse(startsAtIso);
  if (!Number.isFinite(startMs) || startMs < nowMs - APPOINTMENT_PAST_GRACE_MS) {
    throw new AppError('APPOINTMENT_IN_PAST', 'Não é possível agendar no passado.', 422);
  }
}
