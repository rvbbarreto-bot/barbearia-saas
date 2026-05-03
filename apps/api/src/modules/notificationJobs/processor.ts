import type { PoolClient } from 'pg';
import { env } from '../../config/env.js';
import { enqueueOutboundMessage } from '../../infra/queues/outbox.service.js';
import { blocksTransactionalReminders, loadCustomerConsentFlags } from './consent.js';
import { NotificationJobType } from './types.js';
import { resolveWhatsAppOutboundRouting } from './routing.js';
import { executeRecallPromotional } from '../recall/process-send.js';

type JobRow = {
  id: string;
  tenant_id: string;
  job_type: string;
  run_at: Date;
  payload: Record<string, unknown>;
  appointment_id: string | null;
  customer_id: string | null;
};

function formatStartLabel(startsAt: string | Date): string {
  const d = typeof startsAt === 'string' ? new Date(startsAt) : startsAt;
  return d.toISOString();
}

async function loadAppointmentForNotifications(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
): Promise<{ id: string; customer_id: string; starts_at: Date; status: string } | null> {
  const r = await client.query<{
    id: string;
    customer_id: string;
    starts_at: Date;
    status: string;
  }>(
    `SELECT id, customer_id, starts_at, status::text AS status
       FROM appointments
      WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, appointmentId],
  );
  return r.rows[0] ?? null;
}

/**
 * Processa um job dentro de transação com `app.tenant_id` já definido (RLS).
 */
export async function processNotificationJob(client: PoolClient, job: JobRow): Promise<void> {
  const tenantId = job.tenant_id;
  const customerId = job.customer_id;

  const fail = async (msg: string) => {
    await client.query(
      `UPDATE notification_jobs
          SET status = 'failed', last_error = $2, updated_at = now()
        WHERE id = $1`,
      [job.id, msg],
    );
  };

  const skipSent = async (reason: string) => {
    await client.query(
      `UPDATE notification_jobs
          SET status = 'sent', last_error = $2, updated_at = now()
        WHERE id = $1`,
      [job.id, reason],
    );
  };

  if (!customerId) {
    await skipSent('SKIP_NO_CUSTOMER');
    return;
  }

  try {
    switch (job.job_type) {
      case NotificationJobType.appointmentConfirmed: {
        const routing = await resolveWhatsAppOutboundRouting(client, tenantId, customerId);
        if (!routing) {
          await skipSent('SKIP_NO_ROUTING');
          return;
        }
        const apptId = String(job.payload.appointment_id ?? job.appointment_id ?? '');
        const appt = apptId ? await loadAppointmentForNotifications(client, tenantId, apptId) : null;
        if (!appt || appt.status !== 'confirmed') {
          await skipSent('SKIP_APPOINTMENT_NOT_CONFIRMED');
          return;
        }
        const startLabel = formatStartLabel(appt.starts_at);
        const text = `O seu agendamento foi confirmado (ID ${String(appt.id).slice(0, 8)}…) para ${startLabel}. Obrigado.`;
        await enqueueOutboundMessage(
          {
            tenantId,
            customerId,
            payload: { type: 'text', text },
            metadata: {
              phone: routing.phone,
              instance_name: routing.instance_name,
              provider: 'evolution',
            },
            idempotencyKey: `appointment_confirm:${appt.id}`,
            correlationId: appt.id,
          },
          client,
        );
        break;
      }

      case NotificationJobType.reminderD1: {
        const flags = await loadCustomerConsentFlags(client, tenantId, customerId);
        if (
          blocksTransactionalReminders(
            flags.whatsapp_opt_in,
            flags.whatsapp_opt_out,
            flags.latest.transactional,
          )
        ) {
          await skipSent('SKIP_REMINDER_CONSENT');
          return;
        }
        const routing = await resolveWhatsAppOutboundRouting(client, tenantId, customerId);
        if (!routing) {
          await skipSent('SKIP_NO_ROUTING');
          return;
        }
        const apptId = String(job.payload.appointment_id ?? job.appointment_id ?? '');
        const appt = apptId ? await loadAppointmentForNotifications(client, tenantId, apptId) : null;
        if (!appt || appt.status !== 'confirmed') {
          await skipSent('SKIP_APPOINTMENT_NOT_CONFIRMED');
          return;
        }
        const startLabel = formatStartLabel(appt.starts_at);
        const text = `Lembrete: tem agendamento confirmado em ${startLabel} (ID ${String(appt.id).slice(0, 8)}).`;
        await enqueueOutboundMessage(
          {
            tenantId,
            customerId,
            payload: { type: 'text', text },
            metadata: {
              phone: routing.phone,
              instance_name: routing.instance_name,
              provider: 'evolution',
            },
            idempotencyKey: `reminder_d1:${appt.id}`,
            correlationId: appt.id,
          },
          client,
        );
        break;
      }

      case NotificationJobType.reminderH2: {
        const flags = await loadCustomerConsentFlags(client, tenantId, customerId);
        if (
          blocksTransactionalReminders(
            flags.whatsapp_opt_in,
            flags.whatsapp_opt_out,
            flags.latest.transactional,
          )
        ) {
          await skipSent('SKIP_REMINDER_CONSENT');
          return;
        }
        const routing = await resolveWhatsAppOutboundRouting(client, tenantId, customerId);
        if (!routing) {
          await skipSent('SKIP_NO_ROUTING');
          return;
        }
        const apptId = String(job.payload.appointment_id ?? job.appointment_id ?? '');
        const appt = apptId ? await loadAppointmentForNotifications(client, tenantId, apptId) : null;
        if (!appt || appt.status !== 'confirmed') {
          await skipSent('SKIP_APPOINTMENT_NOT_CONFIRMED');
          return;
        }
        const startLabel = formatStartLabel(appt.starts_at);
        const text = [
          `Lembrete: o seu agendamento é às ${startLabel} (ID ${String(appt.id).slice(0, 8)}).`,
          `Para confirmar responda CONFIRMAR; para cancelar responda CANCELAR; para remarcar responda REMARCAR.`,
        ].join(' ');
        await enqueueOutboundMessage(
          {
            tenantId,
            customerId,
            payload: { type: 'text', text },
            metadata: {
              phone: routing.phone,
              instance_name: routing.instance_name,
              provider: 'evolution',
            },
            idempotencyKey: `reminder_h2:${appt.id}`,
            correlationId: appt.id,
          },
          client,
        );
        break;
      }

      case NotificationJobType.recallPromotional:
      case NotificationJobType.recallEligibility: {
        const sourceAppointmentId = String(
          job.payload.source_appointment_id ?? job.payload.appointment_id ?? job.appointment_id ?? '',
        );
        if (!sourceAppointmentId) {
          await skipSent('SKIP_NO_SOURCE_APPOINTMENT');
          return;
        }
        const sid = job.payload.service_id;
        const ex = await executeRecallPromotional(client, {
          tenantId,
          customerId,
          sourceAppointmentId,
          serviceId: typeof sid === 'string' ? sid : null,
          templateKeyFromPayload:
            typeof job.payload.template_key === 'string' ? job.payload.template_key : undefined,
        });
        if (ex.result === 'skip') {
          await skipSent(ex.lastError ?? 'SKIP');
          return;
        }
        break;
      }

      case NotificationJobType.financeMinPostComplete: {
        await skipSent('SKIP_FINANCE_INTERNAL_NO_OUTBOUND');
        return;
      }

      case NotificationJobType.waitlistSlotAvailable: {
        if (!env.WAITLIST_SLOT_NOTIFY_ENABLED) {
          await skipSent('WAITLIST_NOTIFY_DISABLED_PO_SCOPE');
          return;
        }
        const flags = await loadCustomerConsentFlags(client, tenantId, customerId);
        if (
          blocksTransactionalReminders(
            flags.whatsapp_opt_in,
            flags.whatsapp_opt_out,
            flags.latest.transactional,
          )
        ) {
          await skipSent('SKIP_WAITLIST_CONSENT');
          return;
        }
        const routing = await resolveWhatsAppOutboundRouting(client, tenantId, customerId);
        if (!routing) {
          await skipSent('SKIP_NO_ROUTING');
          return;
        }
        const slotStart = String(job.payload.freed_starts_at ?? '');
        const label = slotStart ? formatStartLabel(slotStart) : 'horário compatível';
        const text = [
          `Abriu-se uma vaga na fila de espera (${label}).`,
          `Se ainda pretende agendar, contacte-nos ou use o canal habitual para marcar.`,
        ].join(' ');
        await enqueueOutboundMessage(
          {
            tenantId,
            customerId,
            payload: { type: 'text', text },
            metadata: {
              phone: routing.phone,
              instance_name: routing.instance_name,
              provider: 'evolution',
            },
            idempotencyKey: `waitlist_slot:${String(job.payload.waitlist_entry_id ?? '')}:${String(job.payload.source_appointment_id ?? '')}`,
            correlationId: String(job.payload.waitlist_entry_id ?? job.id),
          },
          client,
        );
        break;
      }

      default:
        await fail(`UNKNOWN_JOB_TYPE:${job.job_type}`);
        return;
    }

    await client.query(
      `UPDATE notification_jobs SET status = 'sent', last_error = NULL, updated_at = now() WHERE id = $1`,
      [job.id],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await fail(msg);
  }
}
