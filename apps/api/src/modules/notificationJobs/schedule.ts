import type { PoolClient } from 'pg';
import { NotificationJobType, SCHEDULED_APPOINTMENT_JOB_TYPES, type NotificationJobTypeName } from './types.js';

export async function cancelPendingNotificationJobsForAppointment(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
  jobTypes: readonly NotificationJobTypeName[] = SCHEDULED_APPOINTMENT_JOB_TYPES,
): Promise<void> {
  await client.query(
    `DELETE FROM notification_jobs
      WHERE tenant_id = $1
        AND appointment_id = $2
        AND status = 'pending'
        AND job_type = ANY($3::text[])`,
    [tenantId, appointmentId, jobTypes as unknown as string[]],
  );
}

/** Cancelamento do agendamento: remove toda a fila pendente associada (incl. jobs operacionais futuros). */
export async function cancelAllPendingNotificationJobsForAppointment(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
): Promise<void> {
  await client.query(
    `DELETE FROM notification_jobs
      WHERE tenant_id = $1
        AND appointment_id = $2
        AND status = 'pending'`,
    [tenantId, appointmentId],
  );
}

/**
 * Horário D-1 às 09:00 (fuso do tenant) no dia civil anterior à data do agendamento.
 * Usa PostgreSQL para evitar bugs de DST no JS puro.
 */
export async function computeReminderD1RunAt(
  client: PoolClient,
  startsAtIso: string,
  tenantTimeZone: string,
): Promise<Date | null> {
  const r = await client.query<{ d1: Date }>(
    `SELECT (
        (
          date_trunc(
            'day',
            ($1::timestamptz AT TIME ZONE $2)
          )::timestamp
          - interval '1 day'
          + interval '9 hours'
        ) AT TIME ZONE $2
      )::timestamptz AS d1`,
    [startsAtIso, tenantTimeZone],
  );
  const d1 = r.rows[0]?.d1;
  if (!d1) return null;
  return new Date(d1);
}

export function computeReminderH2RunAt(startsAtIso: string): Date {
  const start = new Date(startsAtIso);
  return new Date(start.getTime() - 2 * 60 * 60 * 1000);
}

type AppointmentRow = {
  id: string;
  customer_id: string;
  starts_at: string | Date;
};

/**
 * Após `confirmed`: confirmação imediata (job com run_at = now) + lembretes D-1 e H-2 quando aplicável.
 * Remove jobs pendentes anteriores do mesmo agendamento (reconfirmação / remarcação).
 */
export async function scheduleJobsForConfirmedAppointment(
  client: PoolClient,
  tenantId: string,
  appointment: AppointmentRow,
  tenantTimeZone: string,
): Promise<void> {
  await cancelPendingNotificationJobsForAppointment(client, tenantId, appointment.id as string);

  const startsAt =
    typeof appointment.starts_at === 'string' ? appointment.starts_at : appointment.starts_at.toISOString();
  const customerId = appointment.customer_id as string;
  const appointmentId = appointment.id as string;
  const now = new Date();

  const payloadBase = { appointment_id: appointmentId, customer_id: customerId };

  await client.query(
    `INSERT INTO notification_jobs
       (tenant_id, job_type, run_at, status, payload, appointment_id, customer_id)
     VALUES ($1, $2, now(), 'pending', $3::jsonb, $4, $5)`,
    [
      tenantId,
      NotificationJobType.appointmentConfirmed,
      JSON.stringify({ ...payloadBase, purpose: 'appointment_confirmed' }),
      appointmentId,
      customerId,
    ],
  );

  const d1 = await computeReminderD1RunAt(client, startsAt, tenantTimeZone);
  if (d1 && d1 > now) {
    await client.query(
      `INSERT INTO notification_jobs
         (tenant_id, job_type, run_at, status, payload, appointment_id, customer_id)
       VALUES ($1, $2, $3, 'pending', $4::jsonb, $5, $6)`,
      [
        tenantId,
        NotificationJobType.reminderD1,
        d1.toISOString(),
        JSON.stringify({ ...payloadBase, purpose: 'reminder_d1' }),
        appointmentId,
        customerId,
      ],
    );
  }

  const h2 = computeReminderH2RunAt(startsAt);
  if (h2 > now) {
    await client.query(
      `INSERT INTO notification_jobs
         (tenant_id, job_type, run_at, status, payload, appointment_id, customer_id)
       VALUES ($1, $2, $3, 'pending', $4::jsonb, $5, $6)`,
      [
        tenantId,
        NotificationJobType.reminderH2,
        h2.toISOString(),
        JSON.stringify({ ...payloadBase, purpose: 'reminder_h2', actions: ['confirm', 'cancel', 'reschedule'] }),
        appointmentId,
        customerId,
      ],
    );
  }
}

export async function loadTenantTimeZone(client: PoolClient, tenantId: string): Promise<string> {
  const r = await client.query<{ timezone: string }>(
    `SELECT COALESCE(timezone, 'America/Sao_Paulo') AS timezone FROM tenants WHERE id = $1 LIMIT 1`,
    [tenantId],
  );
  return r.rows[0]?.timezone?.trim() || 'America/Sao_Paulo';
}
