/**
 * Status que ocupam o calendário (disponibilidade + parte do EXCLUDE gist em
 * migrations/009_phase4_operational_minimum.sql). Ao alterar, mantenha SQL e código alinhados.
 */
export const APPOINTMENT_SLOT_BLOCKING_STATUSES = [
  'offered',
  'hold',
  'awaiting_confirmation',
  'awaiting_payment',
  'confirmed',
  'checked_in',
  'in_service',
  'completed',
  'no_show_pending',
] as const;

export type AppointmentSlotBlockingStatus = (typeof APPOINTMENT_SLOT_BLOCKING_STATUSES)[number];

const SLOT_BLOCK_LITERALS = APPOINTMENT_SLOT_BLOCKING_STATUSES.map((s) => `'${s}'`).join(', ');

/** Literais apenas (sem entrada externa): usa em fragmento SQL `status IN (...)`. */
export function sqlAppointmentSlotBlockingStatusesIn(): string {
  return SLOT_BLOCK_LITERALS;
}

/**
 * Check-in: slot confirmado ou pendência de no-show (cliente chegou após alerta de atraso).
 * Não aplica a `in_service` — no-show definitivo continua a ser manual/política avançada.
 */
export const STATUSES_THAT_ALLOW_CHECK_IN = ['confirmed', 'no_show_pending'] as const;

/** Início do serviço na cadeira (após check-in). */
export const STATUSES_THAT_ALLOW_START_SERVICE = ['checked_in'] as const;

/** Conclusão só quando o serviço está em curso (`in_service`). */
export const STATUSES_THAT_ALLOW_COMPLETE = ['in_service'] as const;

/**
 * No-show não permitido após check-in ou durante serviço — evita marcar falta indevida.
 */
export const STATUSES_THAT_ALLOW_NO_SHOW = [
  'confirmed',
  'no_show_pending',
  'offered',
  'awaiting_confirmation',
  'awaiting_payment',
] as const;
