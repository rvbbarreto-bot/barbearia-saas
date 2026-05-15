/** Tipos de trabalhos na fila `notification_jobs` (regras operacionais V4). */
export const NotificationJobType = {
  appointmentConfirmed: 'appointment_confirmed',
  reminderD1: 'reminder_d1',
  /** Lembrete ~24h antes do início do agendamento (UTC-24h; alinhado P2.3). */
  reminder24h: 'reminder_24h',
  reminderH2: 'reminder_h2',
  recallEligibility: 'recall_eligibility',
  /** Recall promocional por serviço (template aprovado + outbox). */
  recallPromotional: 'recall_promotional',
  financeMinPostComplete: 'finance_min_post_complete',
  /** Slot libertado — próximo cliente na fila de espera elegível. */
  waitlistSlotAvailable: 'waitlist_slot_available',
} as const;

export type NotificationJobTypeName = (typeof NotificationJobType)[keyof typeof NotificationJobType];

export const SCHEDULED_APPOINTMENT_JOB_TYPES: readonly NotificationJobTypeName[] = [
  NotificationJobType.appointmentConfirmed,
  NotificationJobType.reminderD1,
  NotificationJobType.reminder24h,
  NotificationJobType.reminderH2,
];
