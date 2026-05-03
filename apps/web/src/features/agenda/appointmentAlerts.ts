import type { Appointment } from '@/types/api';

function overlaps(a: Appointment, b: Appointment): boolean {
  if (a.id === b.id) return false;
  const sa = new Date(a.starts_at).getTime();
  const ea = new Date(a.ends_at).getTime();
  const sb = new Date(b.starts_at).getTime();
  const eb = new Date(b.ends_at).getTime();
  return sa < eb && sb < ea;
}

/** Alertas operacionais derivados do agendamento e do conjunto do dia (sem estado local inventado). */
export function buildAppointmentAlerts(appointment: Appointment, sameDayAppointments: Appointment[]): string[] {
  const alerts: string[] = [];

  if (appointment.status === 'awaiting_payment') alerts.push('Aguardando pagamento');
  if (appointment.status === 'no_show_pending') alerts.push('Possível no-show (pendente)');
  if (appointment.status === 'confirmed' && appointment.late_within_tolerance) {
    alerts.push('Dentro da tolerância de atraso — convidar check-in');
  }

  if (appointment.customer_manual_booking_only) {
    alerts.push('Cliente restrito — só agendamento humano/aprovado');
  } else if (appointment.customer_requires_deposit) {
    alerts.push('Cliente com histórico — pode exigir sinal');
  }

  const notes = (appointment.customer_notes ?? '').toLowerCase();
  if (notes.includes('restrit') || notes.includes('[restrito]')) {
    alerts.push('Cliente com observação restritiva');
  }

  const peers = sameDayAppointments.filter(
    (o) => o.professional_id === appointment.professional_id && o.id !== appointment.id,
  );
  if (peers.some((o) => overlaps(appointment, o))) {
    alerts.push('Conflito de horário (sobreposição)');
  }

  if (notes.includes('handoff') || notes.includes('humano')) {
    alerts.push('Handoff / atendimento humano');
  }

  return alerts;
}
