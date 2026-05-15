import { z } from 'zod';
import pg from 'pg';
import type { PoolClient } from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { writeAuditLog } from '../../shared/audit.js';
import { enqueueOutboundMessage } from '../../infra/queues/outbox.service.js';
import { sqlAppointmentSlotBlockingStatusesIn } from '../../shared/appointment-status.js';
import {
  assertEndsMatchServiceDuration,
  expandFootprintUtc,
  loadBookableService,
} from '../catalog/booking-rules.js';
import { withAppointmentLock } from '../appointments/lock.js';
import {
  expireStaleAppointmentHoldsWithClient,
  releaseHoldForBooking,
} from '../appointments/appointment-holds.service.js';
import {
  confirmAppointmentInDb,
  throwIfExclusionViolation,
  writeAppointmentEvent,
} from '../appointments/service.js';
import { assertCustomerBookingAllowed } from '../appointments/customer-restrictions.service.js';
import { cancelAllPendingNotificationJobsForAppointment } from '../notificationJobs/schedule.js';
import { createSupportTicket, createSupportTicketWithClient } from '../supportTickets/service.js';
import { resolveWhatsAppOutboundRouting } from '../notificationJobs/routing.js';
import { createMockPixCharge } from './mock-psp.js';
import { recordFinancialDepositPaid } from '../finance/service.js';

const createPixBodySchema = z.object({
  hold_id: z.string().uuid(),
  deposit_amount_cents: z.number().int().min(1),
  idempotency_key: z.string().min(8).max(200),
  source: z.enum(['whatsapp', 'web', 'manual', 'api', 'walk_in', 'admin']).default('web'),
  notes: z.string().max(2000).optional(),
});

const DEFAULT_PAYMENT_TTL_MINUTES = 15;

function throwIfApptIdempotency(err: unknown): void {
  if (
    err instanceof pg.DatabaseError &&
    err.code === '23505' &&
    err.constraint === 'appointments_tenant_id_idempotency_key_key'
  ) {
    throw new AppError(
      'DUPLICATE_IDEMPOTENCY_KEY',
      'Requisição duplicada: idempotency_key já utilizada para este tenant.',
      409,
    );
  }
}

export async function getPixPaymentById(tenantId: string, paymentId: string) {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT p.*, a.status::text AS appointment_status, a.starts_at, a.ends_at
         FROM pix_payments p
         JOIN appointments a ON a.id = p.appointment_id AND a.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1 AND p.id = $2 LIMIT 1`,
      [tenantId, paymentId],
    );
    if (!r.rowCount) throw new AppError('PIX_PAYMENT_NOT_FOUND', 'Cobrança Pix não encontrada', 404);
    return r.rows[0];
  });
}

export async function createPixPaymentForHold(
  tenantId: string,
  rawBody: unknown,
  caller: { sub?: string; role?: string } | undefined,
) {
  const data = createPixBodySchema.parse(rawBody);

  const holdMeta = await withTenant(tenantId, async (client) => {
    await expireStaleAppointmentHoldsWithClient(client, tenantId);
    const h = await client.query(
      `SELECT professional_id, starts_at, ends_at, status, expires_at
         FROM appointment_holds
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, data.hold_id],
    );
    return h.rows[0] as
      | {
          professional_id: string;
          starts_at: string;
          ends_at: string;
          status: string;
          expires_at: string;
        }
      | undefined;
  });

  if (!holdMeta) throw new AppError('HOLD_NOT_FOUND', 'Reserva temporária não encontrada', 404);
  if (String(holdMeta.status) !== 'active') {
    throw new AppError('HOLD_INVALID', 'Reserva inválida ou já utilizada', 409);
  }
  if (new Date(holdMeta.expires_at) < new Date()) {
    throw new AppError('HOLD_EXPIRED', 'Reserva expirada', 409);
  }

  const lockKey = `lock:appointment:${tenantId}:${holdMeta.professional_id}:${holdMeta.starts_at}:${holdMeta.ends_at}`;

  try {
    return await withAppointmentLock(lockKey, async () =>
      withTenant(tenantId, async (client) => {
        const dup = await client.query(
          `SELECT p.*, a.status::text AS appointment_status
             FROM pix_payments p
             JOIN appointments a ON a.id = p.appointment_id AND a.tenant_id = p.tenant_id
            WHERE p.tenant_id = $1 AND p.idempotency_key = $2 LIMIT 1`,
          [tenantId, data.idempotency_key],
        );
        if (dup.rowCount) {
          return { duplicate: true as const, payment: dup.rows[0] };
        }

        await expireStaleAppointmentHoldsWithClient(client, tenantId);

        const holdRes = await client.query(
          `SELECT * FROM appointment_holds WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
          [tenantId, data.hold_id],
        );
        if (!holdRes.rowCount) throw new AppError('HOLD_NOT_FOUND', 'Reserva temporária não encontrada', 404);
        const hold = holdRes.rows[0] as Record<string, unknown>;
        if (String(hold.status) !== 'active') {
          throw new AppError('HOLD_INVALID', 'Reserva inválida ou já utilizada', 409);
        }
        if (new Date(hold.expires_at as string) < new Date()) {
          throw new AppError('HOLD_EXPIRED', 'Reserva expirada', 409);
        }
        if (!hold.customer_id) {
          throw new AppError('CUSTOMER_REQUIRED', 'Hold sem cliente: associe customer_id antes do Pix.', 422);
        }

        const customerId = String(hold.customer_id);
        const professionalId = String(hold.professional_id);
        const serviceId = String(hold.service_id ?? '');
        if (!serviceId) throw new AppError('SERVICE_REQUIRED', 'Hold sem serviço associado.', 422);
        const startsAt = String(hold.starts_at);
        const endsAt = String(hold.ends_at);

        await assertCustomerBookingAllowed(client, tenantId, customerId, caller);

        const svc = await loadBookableService(client, tenantId, professionalId, serviceId);
        if (data.deposit_amount_cents > Number(svc.price_cents)) {
          throw new AppError('DEPOSIT_TOO_HIGH', 'Valor do sinal não pode exceder o preço do serviço.', 422);
        }

        assertEndsMatchServiceDuration({
          startsAtIso: startsAt,
          endsAtIso: endsAt,
          durationMinutes: svc.duration_minutes,
        });

        const { footprintStartIso, footprintEndIso } = expandFootprintUtc(
          startsAt,
          endsAt,
          svc.buffer_before_minutes,
          svc.buffer_after_minutes,
        );

        const conflictAppt = await client.query(
          `SELECT a.id FROM appointments a
             LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
            WHERE a.tenant_id = $1 AND a.professional_id = $2
              AND a.status IN (${sqlAppointmentSlotBlockingStatusesIn()})
              AND tstzrange(
                a.starts_at - ((COALESCE(s.buffer_before_minutes, 0)::text || ' minutes')::interval),
                a.ends_at + ((COALESCE(s.buffer_after_minutes, 0)::text || ' minutes')::interval),
                '[)'
              ) && tstzrange($3::timestamptz, $4::timestamptz, '[)')
            LIMIT 1`,
          [tenantId, professionalId, footprintStartIso, footprintEndIso],
        );
        if (conflictAppt.rowCount) {
          throw new AppError('SLOT_UNAVAILABLE', 'Horário já ocupado por agendamento.', 409);
        }

        const mode = process.env.PIX_PSP_MODE ?? 'mock';
        if (mode !== 'mock') {
          throw new AppError('PIX_PSP_NOT_CONFIGURED', 'PSP Pix homologado não configurado (use PIX_PSP_MODE=mock).', 503);
        }

        const charge = createMockPixCharge({
          amountCents: data.deposit_amount_cents,
          ttlMinutes: Number(process.env.PIX_PAYMENT_TTL_MINUTES ?? DEFAULT_PAYMENT_TTL_MINUTES),
          referenceId: `${data.hold_id}:${data.idempotency_key.slice(0, 48)}`,
        });

        const apptIdempotencyKey = `pix_appt:${data.idempotency_key}`;
        let appointmentId: string;
        let apptRow: Record<string, unknown>;
        try {
          const insAppt = await client.query(
            `INSERT INTO appointments
               (tenant_id, customer_id, professional_id, service_id, starts_at, ends_at,
                status, source, idempotency_key, notes)
             VALUES ($1,$2,$3,$4,$5,$6,'awaiting_payment',$7,$8,$9)
             RETURNING *`,
            [
              tenantId,
              customerId,
              professionalId,
              serviceId,
              startsAt,
              endsAt,
              data.source,
              apptIdempotencyKey,
              data.notes ?? null,
            ],
          );
          apptRow = insAppt.rows[0];
          appointmentId = apptRow.id as string;
        } catch (e) {
          throwIfExclusionViolation(e);
          throwIfApptIdempotency(e);
          throw e;
        }

        await writeAppointmentEvent(client, {
          tenantId,
          appointmentId,
          eventType: 'CREATED',
          actorUserId: caller?.sub ?? null,
          payload: {
            status: 'awaiting_payment',
            hold_id: data.hold_id,
            deposit_amount_cents: data.deposit_amount_cents,
          },
        });

        const payIns = await client.query(
          `INSERT INTO pix_payments
             (tenant_id, appointment_id, hold_id, amount_cents, status, provider, provider_charge_id,
              copy_paste, qr_payload, expires_at, idempotency_key, metadata)
           VALUES ($1,$2,$3,$4,'payment_pending','mock',$5,$6,$7,$8,$9,$10::jsonb)
           RETURNING *`,
          [
            tenantId,
            appointmentId,
            data.hold_id,
            data.deposit_amount_cents,
            charge.provider_charge_id,
            charge.copy_paste,
            charge.qr_payload,
            charge.expiresAtIso,
            data.idempotency_key,
            JSON.stringify({ deposit_amount_cents: data.deposit_amount_cents }),
          ],
        );

        await releaseHoldForBooking(client, tenantId, data.hold_id, {
          professional_id: professionalId,
          service_id: serviceId,
          starts_at: startsAt,
          ends_at: endsAt,
        });

        await writeAuditLog(client, {
          tenantId,
          actorUserId: caller?.sub ?? null,
          action: 'PIX_PAYMENT_CREATED',
          entity: 'pix_payment',
          entityId: payIns.rows[0].id as string,
          after: {
            appointment_id: appointmentId,
            provider_charge_id: charge.provider_charge_id,
            expires_at: charge.expiresAtIso,
          },
        });

        return {
          duplicate: false as const,
          payment: payIns.rows[0],
          appointment: apptRow,
          copy_paste: charge.copy_paste,
          qr_payload: charge.qr_payload,
          expires_at: charge.expiresAtIso,
        };
      }),
    );
  } catch (err) {
    if (err instanceof AppError && err.code === 'PIX_PSP_NOT_CONFIGURED') {
      try {
        const holdForTicket = await withTenant(tenantId, async (c) => {
          const h = await c.query(
            `SELECT customer_id::text AS customer_id FROM appointment_holds WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
            [tenantId, data.hold_id],
          );
          return h.rows[0] as { customer_id: string } | undefined;
        });
        if (holdForTicket?.customer_id) {
          await createSupportTicket(tenantId, {
            customer_id: holdForTicket.customer_id,
            subject: 'Falha ao gerar cobrança Pix (sinal)',
            body: `Erro: ${err.message}. hold_id=${data.hold_id}`,
            handoff_reason_code: 'payment_failed',
            metadata: { hold_id: data.hold_id, code: err.code },
          }, caller?.sub, null);
        }
      } catch {
        /* best-effort handoff */
      }
    }
    throw err;
  }
}

async function notifyCustomerPixExpired(
  client: PoolClient,
  tenantId: string,
  customerId: string,
  appointmentId: string,
): Promise<void> {
  const routing = await resolveWhatsAppOutboundRouting(client, tenantId, customerId);
  if (!routing) return;
  await enqueueOutboundMessage(
    {
      tenantId,
      customerId,
      payload: {
        type: 'text',
        text: 'O prazo para pagamento do sinal (Pix) expirou e o horário foi libertado. Quer tentar novamente?',
      },
      metadata: {
        phone: routing.phone,
        instance_name: routing.instance_name,
        provider: 'evolution',
      },
      idempotencyKey: `pix_expired:${appointmentId}`,
      correlationId: appointmentId,
    },
    client,
  );
}

async function finalizePixExpiryOnClient(
  client: PoolClient,
  tenantId: string,
  row: { id: string; appointment_id: string; customer_id: string },
): Promise<void> {
  await client.query(
    `UPDATE pix_payments SET status = 'payment_expired', updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, row.id],
  );
  await client.query(
    `UPDATE appointments
        SET status = 'expired',
            notes = COALESCE(NULLIF(trim(notes), ''), '') || $3,
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND status = 'awaiting_payment'`,
    [tenantId, row.appointment_id, '\n[pix] Pagamento do sinal expirou; horário libertado.'],
  );
  await cancelAllPendingNotificationJobsForAppointment(client, tenantId, row.appointment_id);
  await writeAppointmentEvent(client, {
    tenantId,
    appointmentId: row.appointment_id,
    eventType: 'PAYMENT_EXPIRED',
    actorUserId: null,
    payload: { pix_payment_id: row.id },
  });
  await notifyCustomerPixExpired(client, tenantId, row.customer_id, row.appointment_id);
}

export async function applyPixWebhookPaid(
  client: PoolClient,
  tenantId: string,
  providerChargeId: string,
  actorUserId: string | null,
): Promise<{ ok: true; appointmentId: string } | { ok: false; reason: string }> {
  const pay = await client.query(
    `SELECT * FROM pix_payments
      WHERE tenant_id = $1 AND provider_charge_id = $2 FOR UPDATE`,
    [tenantId, providerChargeId],
  );
  if (!pay.rowCount) return { ok: false, reason: 'PAYMENT_NOT_FOUND' };
  const row = pay.rows[0] as Record<string, unknown>;
  if (String(row.status) === 'payment_paid') {
    return { ok: true, appointmentId: String(row.appointment_id) };
  }
  if (String(row.status) !== 'payment_pending') {
    return { ok: false, reason: 'INVALID_STATUS' };
  }

  await client.query(
    `UPDATE pix_payments SET status = 'payment_paid', updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, row.id],
  );

  await writeAppointmentEvent(client, {
    tenantId,
    appointmentId: String(row.appointment_id),
    eventType: 'PAYMENT_CONFIRMED',
    actorUserId,
    payload: { provider_charge_id: providerChargeId, pix_payment_id: row.id },
  });

  await confirmAppointmentInDb(client, tenantId, String(row.appointment_id), {
    sub: actorUserId ?? undefined,
  });

  await recordFinancialDepositPaid(
    client,
    tenantId,
    String(row.appointment_id),
    Number(row.amount_cents),
  );

  await writeAuditLog(client, {
    tenantId,
    actorUserId,
    action: 'PIX_PAYMENT_PAID',
    entity: 'pix_payment',
    entityId: String(row.id),
    after: { appointment_id: row.appointment_id, provider_charge_id: providerChargeId },
  });

  return { ok: true, appointmentId: String(row.appointment_id) };
}

export async function applyPixWebhookExpiredForCharge(
  client: PoolClient,
  tenantId: string,
  providerChargeId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const pay = await client.query(
    `SELECT p.id, p.appointment_id, a.customer_id::text AS customer_id, p.status::text AS status
       FROM pix_payments p
       JOIN appointments a ON a.id = p.appointment_id AND a.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1 AND p.provider_charge_id = $2
      FOR UPDATE OF p`,
    [tenantId, providerChargeId],
  );
  if (!pay.rowCount) return { ok: false, reason: 'PAYMENT_NOT_FOUND' };
  const row = pay.rows[0] as {
    id: string;
    appointment_id: string;
    customer_id: string;
    status: string;
  };
  if (row.status === 'payment_expired') {
    return { ok: true };
  }
  if (row.status !== 'payment_pending') {
    return { ok: false, reason: 'INVALID_STATUS' };
  }

  await finalizePixExpiryOnClient(client, tenantId, {
    id: row.id,
    appointment_id: row.appointment_id,
    customer_id: row.customer_id,
  });

  await writeAuditLog(client, {
    tenantId,
    action: 'PIX_PAYMENT_EXPIRED_WEBHOOK',
    entity: 'pix_payment',
    entityId: row.id,
    after: { appointment_id: row.appointment_id },
  });

  return { ok: true };
}

export async function applyPixWebhookFailedForCharge(
  client: PoolClient,
  tenantId: string,
  providerChargeId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const pay = await client.query(
    `SELECT p.id, p.appointment_id, p.status::text AS status, a.customer_id::text AS customer_id,
            a.status::text AS appointment_status
       FROM pix_payments p
       JOIN appointments a ON a.id = p.appointment_id AND a.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1 AND p.provider_charge_id = $2
      FOR UPDATE OF p, a`,
    [tenantId, providerChargeId],
  );
  if (!pay.rowCount) return { ok: false, reason: 'PAYMENT_NOT_FOUND' };
  const row = pay.rows[0] as {
    id: string;
    appointment_id: string;
    status: string;
    customer_id: string;
    appointment_status: string;
  };

  if (row.status === 'failed') {
    return { ok: true };
  }
  if (row.status !== 'payment_pending') {
    return { ok: false, reason: 'INVALID_STATUS' };
  }

  await client.query(
    `UPDATE pix_payments SET status = 'failed', updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, row.id],
  );

  await client.query(
    `UPDATE appointments
        SET status = 'cancelled',
            notes = COALESCE(NULLIF(trim(notes), ''), '') || $3,
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND status = 'awaiting_payment'`,
    [tenantId, row.appointment_id, '\n[pix] Pagamento recusado ou falhou (PSP).'],
  );

  await cancelAllPendingNotificationJobsForAppointment(client, tenantId, row.appointment_id);

  await writeAppointmentEvent(client, {
    tenantId,
    appointmentId: row.appointment_id,
    eventType: 'PAYMENT_FAILED',
    actorUserId: null,
    payload: { pix_payment_id: row.id, provider_charge_id: providerChargeId },
  });

  try {
    await createSupportTicketWithClient(
      client,
      tenantId,
      {
        customer_id: row.customer_id,
        subject: 'Pagamento Pix do sinal falhou',
        body: `O PSP reportou falha na cobrança do sinal. appointment_id=${row.appointment_id}, charge=${providerChargeId}`,
        handoff_reason_code: 'payment_failed',
        metadata: { appointment_id: row.appointment_id, provider_charge_id: providerChargeId },
      },
      undefined,
      null,
    );
  } catch {
    /* best-effort */
  }

  await writeAuditLog(client, {
    tenantId,
    action: 'PIX_PAYMENT_FAILED',
    entity: 'pix_payment',
    entityId: row.id,
    after: { appointment_id: row.appointment_id },
  });

  return { ok: true };
}

export async function applyPixWebhookRefundedForCharge(
  client: PoolClient,
  tenantId: string,
  providerChargeId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const pay = await client.query(
    `SELECT p.id, p.appointment_id, p.status::text AS status, a.customer_id::text AS customer_id,
            a.status::text AS appointment_status
       FROM pix_payments p
       JOIN appointments a ON a.id = p.appointment_id AND a.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1 AND p.provider_charge_id = $2
      FOR UPDATE OF p`,
    [tenantId, providerChargeId],
  );
  if (!pay.rowCount) return { ok: false, reason: 'PAYMENT_NOT_FOUND' };
  const row = pay.rows[0] as {
    id: string;
    appointment_id: string;
    status: string;
    customer_id: string;
    appointment_status: string;
  };

  if (row.status === 'refunded') {
    return { ok: true };
  }
  if (row.status === 'payment_pending') {
    await client.query(
      `UPDATE pix_payments SET status = 'refunded', updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, row.id],
    );
    await client.query(
      `UPDATE appointments
          SET status = 'cancelled',
              notes = COALESCE(NULLIF(trim(notes), ''), '') || $3,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND status = 'awaiting_payment'`,
      [tenantId, row.appointment_id, '\n[pix] Cobrança reembolsada antes da confirmação.'],
    );
    await cancelAllPendingNotificationJobsForAppointment(client, tenantId, row.appointment_id);
    await writeAppointmentEvent(client, {
      tenantId,
      appointmentId: row.appointment_id,
      eventType: 'PAYMENT_REFUNDED',
      actorUserId: null,
      payload: { pix_payment_id: row.id },
    });
    await writeAuditLog(client, {
      tenantId,
      action: 'PIX_PAYMENT_REFUNDED',
      entity: 'pix_payment',
      entityId: row.id,
      after: { appointment_id: row.appointment_id, phase: 'pending' },
    });
    return { ok: true };
  }

  if (row.status !== 'payment_paid') {
    return { ok: false, reason: 'INVALID_STATUS' };
  }

  await client.query(
    `UPDATE pix_payments SET status = 'refunded', updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, row.id],
  );

  await writeAppointmentEvent(client, {
    tenantId,
    appointmentId: row.appointment_id,
    eventType: 'PAYMENT_REFUNDED',
    actorUserId: null,
    payload: { pix_payment_id: row.id },
  });

  if (row.appointment_status === 'confirmed') {
    try {
      await createSupportTicketWithClient(
        client,
        tenantId,
        {
          customer_id: row.customer_id,
          subject: 'Reembolso Pix do sinal (agendamento já confirmado)',
          body: `O PSP reportou reembolso da cobrança do sinal. Verifique o agendamento ${row.appointment_id}.`,
          handoff_reason_code: 'payment_refunded',
          metadata: { appointment_id: row.appointment_id, provider_charge_id: providerChargeId },
        },
        undefined,
        null,
      );
    } catch {
      /* best-effort */
    }
  }

  await writeAuditLog(client, {
    tenantId,
    action: 'PIX_PAYMENT_REFUNDED',
    entity: 'pix_payment',
    entityId: row.id,
    after: { appointment_id: row.appointment_id },
  });

  return { ok: true };
}

export async function expirePendingPixPaymentsForTenant(tenantId: string): Promise<number> {
  return withTenant(tenantId, async (client) => {
    const due = await client.query(
      `SELECT p.id, p.appointment_id, p.amount_cents, a.customer_id::text AS customer_id
         FROM pix_payments p
         JOIN appointments a ON a.id = p.appointment_id AND a.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1
          AND p.status = 'payment_pending'
          AND p.expires_at < now()
          AND a.status = 'awaiting_payment'`,
      [tenantId],
    );

    let n = 0;
    for (const row of due.rows as { id: string; appointment_id: string; customer_id: string }[]) {
      await finalizePixExpiryOnClient(client, tenantId, row);
      n += 1;
    }

    if (n > 0) {
      await writeAuditLog(client, {
        tenantId,
        action: 'PIX_PAYMENT_EXPIRED_BATCH',
        entity: 'pix_payment',
        after: { count: n },
      });
    }
    return n;
  });
}
