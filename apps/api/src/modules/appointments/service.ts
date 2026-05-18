import { z } from 'zod';
import pg from 'pg';
import { PoolClient } from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { writeAuditLog } from '../../shared/audit.js';
import { effectiveCorrelationId, writeOperationalAuditEvent } from '../../shared/operational-audit.js';
import { hasRequiredRole } from '../../middlewares/rbac.js';
import {
  cancelAllPendingNotificationJobsForAppointment,
  loadTenantTimeZone,
  scheduleJobsForConfirmedAppointment,
} from '../notificationJobs/schedule.js';
import { parsePagination } from '../../shared/pagination.js';
import {
  APPOINTMENT_SLOT_BLOCKING_STATUSES,
  STATUSES_THAT_ALLOW_CHECK_IN,
  STATUSES_THAT_ALLOW_COMPLETE,
  STATUSES_THAT_ALLOW_NO_SHOW,
  STATUSES_THAT_ALLOW_START_SERVICE,
  sqlAppointmentSlotBlockingStatusesIn,
} from '../../shared/appointment-status.js';
import {
  assertEndsMatchServiceDuration,
  assertMatchingPrice,
  computeEndsAtIso,
  expandFootprintUtc,
  loadBookableService,
} from '../catalog/booking-rules.js';
import { withAppointmentLock } from './lock.js';
import {
  resolveAppointmentProfessionalFilter,
  type ListAppointmentsCaller,
} from './appointment-list-scope.js';
import {
  assertCustomerBookingAllowed,
  refreshCustomerRestrictionsAfterNoShow,
} from './customer-restrictions.service.js';
import { releaseHoldForBooking } from './appointment-holds.service.js';
import { assertAppointmentFitsBusinessHours } from './assert-appointment-business-hours.js';
import { assertAppointmentFootprintClearOfCalendarBlocks } from './assert-appointment-footprint-clear-of-calendar-blocks.js';
import { tryEnqueueWaitlistOnSlotFreed } from '../waitlist/service.js';
import { ensureFinancialOnServiceCompleted } from '../finance/service.js';
import { createCommissionEntryForCompletedAppointment } from '../commission/service.js';
import { validateImplicitAppointmentConfirmation } from './explicit-confirmation-policy.js';
import { assertAppointmentStartsNotInPast } from './appointment-scheduling-rules.js';
import { loadTenantVerticalContextWithClient } from '../vertical/tenant-vertical.service.js';
import { isCarWashVertical } from '../vertical/settings.js';
import { assertVehicleBelongsToCustomer } from '../vehicles/service.js';
import { createCarWashJobInTransaction } from '../carWash/service.js';
import {
  assertAppointmentMutationScope,
  assertProfessionalBookingBodyScope,
  type AppointmentMutationCaller,
} from './assert-appointment-mutation-scope.js';

export { resolveAppointmentProfessionalFilter, type ListAppointmentsCaller };
export type AppointmentCaller = AppointmentMutationCaller;

function calendarSlotWasBlocked(status: unknown): boolean {
  const s = String(status);
  return (APPOINTMENT_SLOT_BLOCKING_STATUSES as readonly string[]).includes(s);
}

function appointmentInstantEquals(dbVal: unknown, iso: string): boolean {
  const a = new Date(dbVal as string | Date).getTime();
  const b = Date.parse(iso);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

export function throwIfExclusionViolation(err: unknown): void {
  if (err instanceof pg.DatabaseError && err.code === '23P01') {
    throw new AppError('SLOT_UNAVAILABLE', 'Horário indisponível para este profissional.', 409);
  }
}

function throwIfIdempotencyViolation(err: unknown): void {
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

export async function writeAppointmentEvent(
  client: PoolClient,
  params: {
    tenantId: string;
    appointmentId: string;
    eventType: string;
    actorUserId: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO appointment_events (tenant_id, appointment_id, event_type, actor_user_id, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.tenantId,
      params.appointmentId,
      params.eventType,
      params.actorUserId ?? null,
      JSON.stringify(params.payload ?? {}),
    ],
  );
}

/**
 * Confirma agendamento em transação aberta (status → `confirmed`), recalcula disponibilidade e enfileira WhatsApp.
 * Idempotente se já estiver `confirmed`.
 */
export async function confirmAppointmentInDb(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
  caller?: AppointmentCaller | null,
): Promise<Record<string, unknown>> {
  const actorUserId = caller?.sub;
  const cur = await client.query(
    `SELECT * FROM appointments WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, appointmentId],
  );
  if (!cur.rowCount) throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado', 404);
  const appointment = cur.rows[0];
  await assertAppointmentMutationScope(tenantId, appointment, caller);

  if (appointment.status === 'confirmed') {
    return appointment;
  }
  if (appointment.status !== 'awaiting_confirmation' && appointment.status !== 'awaiting_payment') {
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      `Confirmação não permitida para status '${String(appointment.status)}'`,
      409,
    );
  }

  if (!appointment.service_id) {
    throw new AppError('SERVICE_REQUIRED', 'Serviço obrigatório para confirmar', 422);
  }

  const svc = await loadBookableService(
    client,
    tenantId,
    appointment.professional_id as string,
    appointment.service_id as string,
  );
  const { footprintStartIso, footprintEndIso } = expandFootprintUtc(
    appointment.starts_at as string,
    appointment.ends_at as string,
    svc.buffer_before_minutes,
    svc.buffer_after_minutes,
  );

  const conflict = await client.query(
    `SELECT a.id FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1 AND a.professional_id = $2
        AND a.id <> $3
        AND a.status IN (${sqlAppointmentSlotBlockingStatusesIn()})
        AND tstzrange(
          a.starts_at - ((COALESCE(s.buffer_before_minutes, 0)::text || ' minutes')::interval),
          a.ends_at + ((COALESCE(s.buffer_after_minutes, 0)::text || ' minutes')::interval),
          '[)'
        ) && tstzrange($4::timestamptz, $5::timestamptz, '[)')
      LIMIT 1`,
    [tenantId, appointment.professional_id, appointmentId, footprintStartIso, footprintEndIso],
  );
  if (conflict.rowCount) {
    throw new AppError('SLOT_UNAVAILABLE', 'Horário deixou de estar disponível', 409);
  }

  await assertAppointmentFootprintClearOfCalendarBlocks(
    client,
    tenantId,
    appointment.professional_id as string,
    footprintStartIso,
    footprintEndIso,
  );

  let updated;
  try {
    updated = await client.query(
      `UPDATE appointments
          SET status = 'confirmed',
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *`,
      [tenantId, appointmentId],
    );
  } catch (e) {
    throwIfExclusionViolation(e);
    throw e;
  }

  const row = updated.rows[0];
  await writeAppointmentEvent(client, {
    tenantId,
    appointmentId,
    eventType: 'CONFIRMED',
    actorUserId: actorUserId ?? null,
    payload: {
      previous_status: appointment.status,
      explicit_confirmation: true,
    },
  });
  const tz = await loadTenantTimeZone(client, tenantId);
  await scheduleJobsForConfirmedAppointment(
    client,
    tenantId,
    {
      id: row.id as string,
      customer_id: row.customer_id as string,
      starts_at: row.starts_at as string,
    },
    tz,
  );
  await writeAuditLog(client, {
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'APPOINTMENT_CONFIRMED',
    entity: 'appointment',
    entityId: appointmentId,
    before: { status: appointment.status },
    after: { status: 'confirmed' },
  });

  await writeOperationalAuditEvent(client, {
    tenantId,
    entityType: 'appointment',
    entityId: appointmentId,
    eventType: 'appointment_confirmed',
    actorUserId: actorUserId ?? null,
    actorRole: caller?.role ?? null,
    requestId: caller?.requestId ?? null,
    correlationId: effectiveCorrelationId(caller?.correlationId, appointmentId),
    metadata: { previous_status: appointment.status },
  });

  return row;
}

/** Job assíncrono para financeiro mínimo; recall promocional é feito por sweep + templates (V4). */
async function enqueuePostCompletionBackgroundJobs(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
  customerId: string | null,
): Promise<void> {
  const payloadFinance = JSON.stringify({ appointment_id: appointmentId, purpose: 'financial_minimum' });
  await client.query(
    `INSERT INTO notification_jobs (tenant_id, job_type, run_at, status, payload, appointment_id, customer_id)
     VALUES ($1, 'finance_min_post_complete', now(), 'pending', $2::jsonb, $3, $4)`,
    [tenantId, payloadFinance, appointmentId, customerId],
  );
}

export async function confirmAppointment(
  tenantId: string,
  appointmentId: string,
  caller?: AppointmentCaller,
) {
  const lockKey = `lock:appointment:${tenantId}:${appointmentId}:confirm`;
  return withAppointmentLock(lockKey, async () =>
    withTenant(tenantId, async (client) =>
      confirmAppointmentInDb(client, tenantId, appointmentId, caller),
    ),
  );
}

export const createAppointmentSchema = z.object({
  customer_id: z.string().uuid(),
  professional_id: z.string().uuid(),
  service_id: z.string().uuid(),
  /** Obrigatório em tenant `car_wash` quando `require_vehicle=true`; proibido em `barbershop`. */
  vehicle_id: z.string().uuid().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  /** Opcional · se enviado, deve coincidir com o preço do serviço (WhatsApp/painel vs cadastro). */
  price_cents: z.number().int().min(0).optional(),
  source: z.enum(['whatsapp', 'web', 'manual', 'api', 'walk_in', 'admin']).default('manual'),
  idempotency_key: z.string().min(8),
  notes: z.string().optional(),
  /** Se true, fica `awaiting_confirmation` até PATCH …/confirm. Se false, confirmação administrativa imediata (CT-073): só `tenant_admin`+ ou `walk_in` com `attendant`+; não equivale à confirmação explícita do cliente. */
  explicit_confirmation: z.boolean(),
  hold_id: z.string().uuid().optional(),
});

export async function createAppointment(
  tenantId: string,
  input: z.infer<typeof createAppointmentSchema>,
  caller?: AppointmentCaller,
) {
  const data = createAppointmentSchema.parse(input);

  await assertProfessionalBookingBodyScope(tenantId, data.professional_id, caller);

  validateImplicitAppointmentConfirmation(
    { explicit_confirmation: data.explicit_confirmation, source: data.source },
    caller,
  );

  assertAppointmentStartsNotInPast(data.starts_at);

  const actorUserId = caller?.sub;
  const lockKey = `lock:appointment:${tenantId}:${data.professional_id}:${data.starts_at}:${data.ends_at}`;
  return withAppointmentLock(lockKey, async () =>
    withTenant(tenantId, async (client) => {
      const verticalCtx = await loadTenantVerticalContextWithClient(client, tenantId);
      const carWash = isCarWashVertical(verticalCtx);

      if (data.vehicle_id && !carWash) {
        throw new AppError(
          'VEHICLE_NOT_ALLOWED',
          'vehicle_id não é permitido para tenant barbershop.',
          400,
        );
      }
      if (carWash && verticalCtx.car_wash.require_vehicle && !data.vehicle_id) {
        throw new AppError(
          'VEHICLE_REQUIRED',
          'vehicle_id é obrigatório para agendamento de lava-rápido.',
          422,
        );
      }
      if (data.vehicle_id) {
        await assertVehicleBelongsToCustomer(client, tenantId, data.vehicle_id, data.customer_id);
      }

      if (data.hold_id) {
        await releaseHoldForBooking(client, tenantId, data.hold_id, {
          professional_id: data.professional_id,
          service_id: data.service_id,
          starts_at: data.starts_at,
          ends_at: data.ends_at,
        });
      }

      const existingIdem = await client.query(
        `SELECT * FROM appointments WHERE tenant_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [tenantId, data.idempotency_key],
      );
      if (existingIdem.rowCount) {
        const row = existingIdem.rows[0] as Record<string, unknown>;
        const samePayload =
          String(row.customer_id) === data.customer_id &&
          String(row.professional_id) === data.professional_id &&
          String(row.service_id) === data.service_id &&
          String(row.source) === data.source &&
          String(row.notes ?? '') === String(data.notes ?? '') &&
          appointmentInstantEquals(row.starts_at, data.starts_at) &&
          appointmentInstantEquals(row.ends_at, data.ends_at);
        if (!samePayload) {
          throw new AppError(
            'DUPLICATE_IDEMPOTENCY_KEY',
            'Requisição duplicada: idempotency_key já utilizada para este tenant.',
            409,
          );
        }
        if (carWash) {
          const jobVehicle = await client.query<{ vehicle_id: string }>(
            `SELECT vehicle_id::text AS vehicle_id FROM car_wash_jobs
              WHERE tenant_id = $1 AND appointment_id = $2 LIMIT 1`,
            [tenantId, row.id],
          );
          const existingVehicleId = jobVehicle.rowCount
            ? (jobVehicle.rows[0].vehicle_id as string)
            : null;
          const requestedVehicleId = data.vehicle_id ?? null;
          if (existingVehicleId !== requestedVehicleId) {
            throw new AppError(
              'DUPLICATE_IDEMPOTENCY_KEY',
              'idempotency_key já utilizada com outro vehicle_id para este tenant.',
              409,
            );
          }
        }
        return row;
      }

      const svc = await loadBookableService(client, tenantId, data.professional_id, data.service_id);

      const custOk = await client.query(
        `SELECT 1 FROM customers WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, data.customer_id],
      );
      if (!custOk.rowCount) {
        throw new AppError('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.', 404);
      }

      await assertCustomerBookingAllowed(client, tenantId, data.customer_id, caller);

      assertEndsMatchServiceDuration({
        startsAtIso: data.starts_at,
        endsAtIso: data.ends_at,
        durationMinutes: svc.duration_minutes,
      });
      assertMatchingPrice(data.price_cents, svc.price_cents);

      await assertAppointmentFitsBusinessHours(
        client,
        tenantId,
        data.professional_id,
        data.starts_at,
        data.ends_at,
      );

      const { footprintStartIso, footprintEndIso } = expandFootprintUtc(
        data.starts_at,
        data.ends_at,
        svc.buffer_before_minutes,
        svc.buffer_after_minutes,
      );

      await assertAppointmentFootprintClearOfCalendarBlocks(
        client,
        tenantId,
        data.professional_id,
        footprintStartIso,
        footprintEndIso,
      );

      const conflict = await client.query(
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
        [tenantId, data.professional_id, footprintStartIso, footprintEndIso],
      );
      if (conflict.rowCount) throw new AppError('SLOT_UNAVAILABLE', 'Horário indisponível', 409);

      let result;
      try {
        result = await client.query(
          `INSERT INTO appointments
           (tenant_id, customer_id, professional_id, service_id, starts_at, ends_at, status, source, idempotency_key, notes)
           VALUES ($1,$2,$3,$4,$5,$6,'awaiting_confirmation',$7,$8,$9)
           RETURNING *`,
          [
            tenantId,
            data.customer_id,
            data.professional_id,
            data.service_id,
            data.starts_at,
            data.ends_at,
            data.source,
            data.idempotency_key,
            data.notes ?? null,
          ],
        );
      } catch (e) {
        throwIfExclusionViolation(e);
        throwIfIdempotencyViolation(e);
        throw e;
      }

      const created = result.rows[0];

      if (carWash && data.vehicle_id) {
        try {
          await createCarWashJobInTransaction(
            client,
            tenantId,
            created.id as string,
            data.vehicle_id,
            {
              sub: actorUserId,
              role: caller?.role,
              requestId: caller?.requestId,
              correlationId: effectiveCorrelationId(caller?.correlationId, created.id as string),
            },
          );
        } catch (jobErr) {
          throw jobErr;
        }
      }

      await writeAppointmentEvent(client, {
        tenantId,
        appointmentId: created.id as string,
        eventType: 'CREATED',
        actorUserId: actorUserId ?? null,
        payload: {
          source: created.source,
          starts_at: created.starts_at,
          ends_at: created.ends_at,
          explicit_confirmation_pending: data.explicit_confirmation,
          administrative_skip_client_explicit_confirm: !data.explicit_confirmation,
          hold_id: data.hold_id ?? null,
          vehicle_id: data.vehicle_id ?? null,
        },
      });
      await writeAuditLog(client, {
        tenantId,
        actorUserId: actorUserId ?? null,
        action: 'APPOINTMENT_CREATED',
        entity: 'appointment',
        entityId: created.id as string,
        after: {
          customer_id: created.customer_id,
          professional_id: created.professional_id,
          starts_at: created.starts_at,
          ends_at: created.ends_at,
          source: created.source,
          status: 'awaiting_confirmation',
        },
      });

      await writeOperationalAuditEvent(client, {
        tenantId,
        entityType: 'appointment',
        entityId: created.id as string,
        eventType: 'appointment_created',
        actorUserId: actorUserId ?? null,
        actorRole: caller?.role ?? null,
        requestId: caller?.requestId ?? null,
        correlationId: effectiveCorrelationId(caller?.correlationId, created.id as string),
        metadata: {
          explicit_confirmation: data.explicit_confirmation,
          source: data.source,
        },
      });

      if (!data.explicit_confirmation) {
        const confirmed = await confirmAppointmentInDb(client, tenantId, created.id as string, caller);
        await writeOperationalAuditEvent(client, {
          tenantId,
          entityType: 'appointment',
          entityId: created.id as string,
          eventType: 'appointment_manual_created_without_client_confirmation',
          actorUserId: actorUserId ?? null,
          actorRole: caller?.role ?? null,
          requestId: caller?.requestId ?? null,
          correlationId: effectiveCorrelationId(caller?.correlationId, created.id as string),
          metadata: { appointment_id: created.id },
        });
        return confirmed;
      }

      return created;
    }),
  );
}

export const walkInAppointmentSchema = z.object({
  customer_id: z.string().uuid(),
  professional_id: z.string().uuid(),
  service_id: z.string().uuid(),
  starts_at: z.string().datetime(),
  idempotency_key: z.string().min(8),
  notes: z.string().optional(),
});

export async function createWalkInAppointment(
  tenantId: string,
  input: z.infer<typeof walkInAppointmentSchema>,
  caller?: AppointmentCaller,
) {
  const data = walkInAppointmentSchema.parse(input);
  const ends_at = await withTenant(tenantId, async (client) => {
    const svc = await loadBookableService(client, tenantId, data.professional_id, data.service_id);
    return computeEndsAtIso(data.starts_at, svc.duration_minutes);
  });

  return createAppointment(
    tenantId,
    {
      customer_id: data.customer_id,
      professional_id: data.professional_id,
      service_id: data.service_id,
      starts_at: data.starts_at,
      ends_at,
      source: 'walk_in',
      idempotency_key: data.idempotency_key,
      notes: data.notes,
      explicit_confirmation: false,
    },
    caller,
  );
}

export const manualOverrideAppointmentSchema = z.object({
  customer_id: z.string().uuid(),
  professional_id: z.string().uuid(),
  service_id: z.string().uuid(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  manual_override_reason: z.string().min(10).max(2000),
  idempotency_key: z.string().min(8),
  notes: z.string().optional(),
  /** Se false, confirma na mesma transação (recomendado para encaixe). */
  explicit_confirmation: z.boolean().default(false),
});

export async function createManualOverrideAppointment(
  tenantId: string,
  input: z.infer<typeof manualOverrideAppointmentSchema>,
  caller?: AppointmentCaller,
) {
  const data = manualOverrideAppointmentSchema.parse(input);

  if (!caller?.sub || !hasRequiredRole(caller.role, 'manager')) {
    throw new AppError('FORBIDDEN', 'Encaixe manual apenas para gerente ou administrador.', 403);
  }

  if (!data.explicit_confirmation && caller.role === 'professional') {
    throw new AppError(
      'FORBIDDEN',
      'Perfil profissional deve criar encaixe com confirmação explícita.',
      403,
    );
  }

  const actorUserId = caller.sub;
  const lockKey = `lock:appointment:${tenantId}:${data.professional_id}:${data.starts_at}:${data.ends_at}`;
  return withAppointmentLock(lockKey, async () =>
    withTenant(tenantId, async (client) => {
      const svc = await loadBookableService(client, tenantId, data.professional_id, data.service_id);
      await assertCustomerBookingAllowed(client, tenantId, data.customer_id, caller);
      assertEndsMatchServiceDuration({
        startsAtIso: data.starts_at,
        endsAtIso: data.ends_at,
        durationMinutes: svc.duration_minutes,
      });
      assertMatchingPrice(undefined, svc.price_cents);

      let result;
      try {
        result = await client.query(
          `INSERT INTO appointments
           (tenant_id, customer_id, professional_id, service_id, starts_at, ends_at, status, source,
            idempotency_key, notes,
            manual_override, manual_override_reason, manual_override_at, manual_override_by_user_id)
           VALUES ($1,$2,$3,$4,$5,$6,'awaiting_confirmation',$7,$8,$9,
             true, $10, now(), $11::uuid)
           RETURNING *`,
          [
            tenantId,
            data.customer_id,
            data.professional_id,
            data.service_id,
            data.starts_at,
            data.ends_at,
            'admin',
            data.idempotency_key,
            data.notes ?? null,
            data.manual_override_reason,
            actorUserId,
          ],
        );
      } catch (e) {
        throwIfExclusionViolation(e);
        throwIfIdempotencyViolation(e);
        throw e;
      }

      const created = result.rows[0];
      await writeAppointmentEvent(client, {
        tenantId,
        appointmentId: created.id as string,
        eventType: 'MANUAL_OVERRIDE_CREATED',
        actorUserId,
        payload: {
          manual_override_reason: data.manual_override_reason,
          starts_at: created.starts_at,
          ends_at: created.ends_at,
        },
      });
      await writeAuditLog(client, {
        tenantId,
        actorUserId,
        action: 'APPOINTMENT_MANUAL_OVERRIDE',
        entity: 'appointment',
        entityId: created.id as string,
        after: {
          manual_override: true,
          manual_override_reason: data.manual_override_reason,
          starts_at: created.starts_at,
          ends_at: created.ends_at,
          professional_id: created.professional_id,
          customer_id: created.customer_id,
        },
      });

      if (!data.explicit_confirmation) {
        return confirmAppointmentInDb(client, tenantId, created.id as string, caller);
      }

      return created;
    }),
  );
}

const cancelAppointmentBodySchema = z.object({
  reason: z.string().min(3).max(500).optional(),
});

/** Cancela agendamento dentro de transação já aberta (ex.: cancelamento de job lava-rápido). */
export async function cancelAppointmentInDb(
  client: PoolClient,
  tenantId: string,
  appointmentId: string,
  reason: string | null | undefined,
  caller?: AppointmentCaller | null,
): Promise<Record<string, unknown>> {
  const actorUserId = caller?.sub;
  const current = await client.query(
    `SELECT * FROM appointments WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, appointmentId],
  );
  if (!current.rowCount) throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado', 404);
  const appointment = current.rows[0];
  await assertAppointmentMutationScope(tenantId, appointment, caller);
  if (appointment.status === 'cancelled') return appointment;

  const st = String(appointment.status);
  if (st === 'completed' || st === 'no_show') {
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      'Não é possível cancelar um agendamento finalizado ou marcado como falta.',
      409,
    );
  }

  const updated = await client.query(
    `UPDATE appointments
        SET status = 'cancelled',
            cancelled_at = now(),
            notes = COALESCE($3, notes),
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2
      RETURNING *`,
    [tenantId, appointmentId, reason ?? null],
  );

  await writeAppointmentEvent(client, {
    tenantId,
    appointmentId,
    eventType: 'CANCELLED',
    actorUserId: actorUserId ?? null,
    payload: { reason: reason ?? null, previous_status: appointment.status },
  });
  await writeAuditLog(client, {
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'APPOINTMENT_CANCELLED',
    entity: 'appointment',
    entityId: appointmentId,
    before: { status: appointment.status, starts_at: appointment.starts_at, ends_at: appointment.ends_at },
    after: { status: 'cancelled', reason: reason ?? null },
  });

  await writeOperationalAuditEvent(client, {
    tenantId,
    entityType: 'appointment',
    entityId: appointmentId,
    eventType: 'appointment_cancelled',
    actorUserId: actorUserId ?? null,
    actorRole: caller?.role ?? null,
    requestId: caller?.requestId ?? null,
    correlationId: effectiveCorrelationId(caller?.correlationId, appointmentId),
    metadata: { reason: reason ?? null, previous_status: appointment.status },
  });

  await cancelAllPendingNotificationJobsForAppointment(client, tenantId, appointmentId);

  const svcId = appointment.service_id as string | null;
  const profId = appointment.professional_id as string;
  if (calendarSlotWasBlocked(appointment.status) && svcId) {
    await tryEnqueueWaitlistOnSlotFreed(client, tenantId, {
      professionalId: profId,
      serviceId: svcId,
      freedStartsAtIso: String(appointment.starts_at),
      freedEndsAtIso: String(appointment.ends_at),
      sourceAppointmentId: appointmentId,
      reason: 'cancelled',
    });
  }

  return updated.rows[0];
}

export async function cancelAppointment(
  tenantId: string,
  appointmentId: string,
  body: unknown,
  caller?: AppointmentCaller,
) {
  const { reason } = cancelAppointmentBodySchema.parse(body ?? {});
  const lockKey = `lock:appointment:${tenantId}:${appointmentId}:cancel`;
  return withAppointmentLock(lockKey, async () =>
    withTenant(tenantId, async (client) =>
      cancelAppointmentInDb(client, tenantId, appointmentId, reason, caller),
    ),
  );
}

const rescheduleAppointmentBodySchema = z.object({
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  reason: z.string().min(3).max(500),
});

export async function rescheduleAppointment(
  tenantId: string,
  appointmentId: string,
  body: unknown,
  caller?: AppointmentCaller,
) {
  const data = rescheduleAppointmentBodySchema.parse(body);
  assertAppointmentStartsNotInPast(data.starts_at);
  const actorUserId = caller?.sub;
  const lockKey = `lock:appointment:${tenantId}:${appointmentId}:reschedule`;
  return withAppointmentLock(lockKey, async () =>
    withTenant(tenantId, async (client) => {
      const current = await client.query(
        `SELECT * FROM appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, appointmentId],
      );
      if (!current.rowCount) throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado', 404);
      const appointment = current.rows[0];
      await assertAppointmentMutationScope(tenantId, appointment, caller);
      if (appointment.status === 'cancelled') {
        throw new AppError('APPOINTMENT_CANCELLED', 'Não é possível remarcar um agendamento cancelado', 409);
      }

      const st = String(appointment.status);
      if (['completed', 'no_show', 'expired', 'rescheduled'].includes(st)) {
        throw new AppError(
          'INVALID_STATUS_TRANSITION',
          `Remarcação não permitida para status '${st}'.`,
          409,
        );
      }

      if (!appointment.service_id) {
        throw new AppError(
          'SERVICE_REQUIRED',
          'Remarcação exige um serviço associado ao agendamento (catálogo V4).',
          422,
        );
      }

      const svc = await loadBookableService(
        client,
        tenantId,
        appointment.professional_id as string,
        appointment.service_id as string,
      );
      assertEndsMatchServiceDuration({
        startsAtIso: data.starts_at,
        endsAtIso: data.ends_at,
        durationMinutes: svc.duration_minutes,
      });

      await assertAppointmentFitsBusinessHours(
        client,
        tenantId,
        appointment.professional_id as string,
        data.starts_at,
        data.ends_at,
      );

      const { footprintStartIso, footprintEndIso } = expandFootprintUtc(
        data.starts_at,
        data.ends_at,
        svc.buffer_before_minutes,
        svc.buffer_after_minutes,
      );

      await assertAppointmentFootprintClearOfCalendarBlocks(
        client,
        tenantId,
        appointment.professional_id as string,
        footprintStartIso,
        footprintEndIso,
      );

      const conflict = await client.query(
        `SELECT a.id FROM appointments a
           LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
          WHERE a.tenant_id = $1 AND a.professional_id = $2
            AND a.id <> $3
            AND a.status IN (${sqlAppointmentSlotBlockingStatusesIn()})
            AND tstzrange(
              a.starts_at - ((COALESCE(s.buffer_before_minutes, 0)::text || ' minutes')::interval),
              a.ends_at + ((COALESCE(s.buffer_after_minutes, 0)::text || ' minutes')::interval),
              '[)'
            ) && tstzrange($4::timestamptz, $5::timestamptz, '[)')
          LIMIT 1`,
        [tenantId, appointment.professional_id, appointmentId, footprintStartIso, footprintEndIso],
      );
      if (conflict.rowCount) throw new AppError('SLOT_UNAVAILABLE', 'Horário indisponível', 409);

      const prevStatus = String(appointment.status);
      const prevStarts = String(appointment.starts_at);
      const prevEnds = String(appointment.ends_at);
      const prevProf = String(appointment.professional_id);
      const prevSvc = appointment.service_id as string | null;

      let updated;
      try {
        updated = await client.query(
          `UPDATE appointments
              SET starts_at = $3, ends_at = $4, notes = COALESCE($5, notes), updated_at = now()
            WHERE tenant_id = $1 AND id = $2
            RETURNING *`,
          [tenantId, appointmentId, data.starts_at, data.ends_at, data.reason ?? null],
        );
      } catch (e) {
        throwIfExclusionViolation(e);
        throw e;
      }

      if (calendarSlotWasBlocked(prevStatus) && prevSvc) {
        await tryEnqueueWaitlistOnSlotFreed(client, tenantId, {
          professionalId: prevProf,
          serviceId: prevSvc,
          freedStartsAtIso: prevStarts,
          freedEndsAtIso: prevEnds,
          sourceAppointmentId: appointmentId,
          reason: 'rescheduled',
        });
      }

      await writeAppointmentEvent(client, {
        tenantId,
        appointmentId,
        eventType: 'RESCHEDULED',
        actorUserId: actorUserId ?? null,
        payload: {
          appointment_id: appointmentId,
          previous_starts_at: appointment.starts_at,
          previous_ends_at: appointment.ends_at,
          new_starts_at: data.starts_at,
          new_ends_at: data.ends_at,
          reason: data.reason ?? null,
        },
      });
      await writeAuditLog(client, {
        tenantId,
        actorUserId: actorUserId ?? null,
        action: 'APPOINTMENT_RESCHEDULED',
        entity: 'appointment',
        entityId: appointmentId,
        before: { starts_at: appointment.starts_at, ends_at: appointment.ends_at, status: appointment.status },
        after: { starts_at: data.starts_at, ends_at: data.ends_at, reason: data.reason ?? null },
      });

      await writeOperationalAuditEvent(client, {
        tenantId,
        entityType: 'appointment',
        entityId: appointmentId,
        eventType: 'appointment_rescheduled',
        actorUserId: actorUserId ?? null,
        actorRole: caller?.role ?? null,
        requestId: caller?.requestId ?? null,
        correlationId: effectiveCorrelationId(caller?.correlationId, appointmentId),
        metadata: {
          previous_starts_at: appointment.starts_at,
          previous_ends_at: appointment.ends_at,
          new_starts_at: data.starts_at,
          new_ends_at: data.ends_at,
        },
      });

      const rowAfter = updated.rows[0];
      if (String(rowAfter.status) === 'confirmed') {
        const tz = await loadTenantTimeZone(client, tenantId);
        await scheduleJobsForConfirmedAppointment(client, tenantId, rowAfter, tz);
      }

      return updated.rows[0];
    }),
  );
}

export async function checkInAppointment(
  tenantId: string,
  appointmentId: string,
  caller?: AppointmentCaller,
) {
  const actorUserId = caller?.sub;
  const lockKey = `lock:appointment:${tenantId}:${appointmentId}:check_in`;
  return withAppointmentLock(lockKey, async () =>
    withTenant(tenantId, async (client) => {
      const current = await client.query(
        `SELECT * FROM appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, appointmentId],
      );
      if (!current.rowCount) throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado', 404);
      const appointment = current.rows[0];
      await assertAppointmentMutationScope(tenantId, appointment, caller);

      if (!(STATUSES_THAT_ALLOW_CHECK_IN as readonly string[]).includes(appointment.status as string)) {
        throw new AppError(
          'INVALID_STATUS_TRANSITION',
          `Check-in só para status 'confirmed' ou 'no_show_pending' (atual: '${appointment.status}').`,
          409,
        );
      }

      const updated = await client.query(
        `UPDATE appointments SET status = 'checked_in', updated_at = now()
          WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [tenantId, appointmentId],
      );

      await writeAppointmentEvent(client, {
        tenantId,
        appointmentId,
        eventType: 'CHECK_IN',
        actorUserId: actorUserId ?? null,
        payload: { previous_status: appointment.status },
      });
      await writeAuditLog(client, {
        tenantId,
        actorUserId: actorUserId ?? null,
        action: 'APPOINTMENT_CHECK_IN',
        entity: 'appointment',
        entityId: appointmentId,
        before: { status: appointment.status },
        after: { status: 'checked_in' },
      });

      return updated.rows[0];
    }),
  );
}

export async function startAppointmentService(
  tenantId: string,
  appointmentId: string,
  caller?: AppointmentCaller,
) {
  const actorUserId = caller?.sub;
  const lockKey = `lock:appointment:${tenantId}:${appointmentId}:start`;
  return withAppointmentLock(lockKey, async () =>
    withTenant(tenantId, async (client) => {
      const current = await client.query(
        `SELECT * FROM appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, appointmentId],
      );
      if (!current.rowCount) throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado', 404);
      const appointment = current.rows[0];
      await assertAppointmentMutationScope(tenantId, appointment, caller);

      if (!(STATUSES_THAT_ALLOW_START_SERVICE as readonly string[]).includes(appointment.status as string)) {
        throw new AppError(
          'INVALID_STATUS_TRANSITION',
          `Início do serviço só após check-in (status atual: '${appointment.status}').`,
          409,
        );
      }

      const updated = await client.query(
        `UPDATE appointments SET status = 'in_service', updated_at = now()
          WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [tenantId, appointmentId],
      );

      await writeAppointmentEvent(client, {
        tenantId,
        appointmentId,
        eventType: 'SERVICE_STARTED',
        actorUserId: actorUserId ?? null,
        payload: { previous_status: appointment.status },
      });
      await writeAuditLog(client, {
        tenantId,
        actorUserId: actorUserId ?? null,
        action: 'APPOINTMENT_SERVICE_STARTED',
        entity: 'appointment',
        entityId: appointmentId,
        before: { status: appointment.status },
        after: { status: 'in_service' },
      });

      return updated.rows[0];
    }),
  );
}

export async function completeAppointment(
  tenantId: string,
  appointmentId: string,
  caller?: AppointmentCaller,
) {
  const actorUserId = caller?.sub;
  const lockKey = `lock:appointment:${tenantId}:${appointmentId}:complete`;
  return withAppointmentLock(lockKey, async () =>
    withTenant(tenantId, async (client) => {
      const current = await client.query(
        `SELECT * FROM appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, appointmentId],
      );
      if (!current.rowCount) throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado', 404);
      const appointment = current.rows[0];
      await assertAppointmentMutationScope(tenantId, appointment, caller);

      if (!(STATUSES_THAT_ALLOW_COMPLETE as readonly string[]).includes(appointment.status as string)) {
        throw new AppError(
          'INVALID_STATUS_TRANSITION',
          `Conclusão só é permitida com serviço em curso (status 'in_service'). Status atual: '${appointment.status}'.`,
          409,
        );
      }

      const updated = await client.query(
        `UPDATE appointments
            SET status = 'completed',
                completed_at = now(),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [tenantId, appointmentId],
      );

      await ensureFinancialOnServiceCompleted(client, tenantId, appointmentId);
      await createCommissionEntryForCompletedAppointment(client, tenantId, appointmentId);

      await writeAppointmentEvent(client, {
        tenantId,
        appointmentId,
        eventType: 'COMPLETED',
        actorUserId: actorUserId ?? null,
        payload: {
          previous_status: appointment.status,
          financial_minimum_pending: false,
        },
      });
      await writeAuditLog(client, {
        tenantId,
        actorUserId: actorUserId ?? null,
        action: 'APPOINTMENT_COMPLETED',
        entity: 'appointment',
        entityId: appointmentId,
        before: { status: appointment.status },
        after: { status: 'completed' },
      });

      await writeOperationalAuditEvent(client, {
        tenantId,
        entityType: 'appointment',
        entityId: appointmentId,
        eventType: 'appointment_completed',
        actorUserId: actorUserId ?? null,
        actorRole: caller?.role ?? null,
        requestId: caller?.requestId ?? null,
        correlationId: effectiveCorrelationId(caller?.correlationId, appointmentId),
        metadata: { previous_status: appointment.status },
      });

      await cancelAllPendingNotificationJobsForAppointment(client, tenantId, appointmentId);

      await enqueuePostCompletionBackgroundJobs(
        client,
        tenantId,
        appointmentId,
        (appointment.customer_id as string | null) ?? null,
      );

      return updated.rows[0];
    }),
  );
}

const noShowBodySchema = z.object({
  reason: z.string().min(3).max(500),
});

export async function noShowAppointment(
  tenantId: string,
  appointmentId: string,
  body: unknown,
  caller?: AppointmentCaller,
) {
  const { reason } = noShowBodySchema.parse(body ?? {});
  const actorUserId = caller?.sub;
  const lockKey = `lock:appointment:${tenantId}:${appointmentId}:no_show`;
  return withAppointmentLock(lockKey, async () =>
    withTenant(tenantId, async (client) => {
      const current = await client.query(
        `SELECT * FROM appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, appointmentId],
      );
      if (!current.rowCount) throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado', 404);
      const appointment = current.rows[0];
      await assertAppointmentMutationScope(tenantId, appointment, caller);

      if (!(STATUSES_THAT_ALLOW_NO_SHOW as readonly string[]).includes(appointment.status as string)) {
        throw new AppError(
          'INVALID_STATUS_TRANSITION',
          `Não é possível registrar no-show para status '${appointment.status}'`,
          409,
        );
      }

      const updated = await client.query(
        `UPDATE appointments
            SET status = 'no_show',
                no_show_marked_at = now(),
                notes = COALESCE($3, notes),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [tenantId, appointmentId, reason],
      );

      await writeAppointmentEvent(client, {
        tenantId,
        appointmentId,
        eventType: 'NO_SHOW',
        actorUserId: actorUserId ?? null,
        payload: { reason },
      });
      await writeAuditLog(client, {
        tenantId,
        actorUserId: actorUserId ?? null,
        action: 'APPOINTMENT_NO_SHOW',
        entity: 'appointment',
        entityId: appointmentId,
        before: { status: appointment.status },
        after: { status: 'no_show', reason },
      });

      await writeOperationalAuditEvent(client, {
        tenantId,
        entityType: 'appointment',
        entityId: appointmentId,
        eventType: 'appointment_no_show',
        actorUserId: actorUserId ?? null,
        actorRole: caller?.role ?? null,
        requestId: caller?.requestId ?? null,
        correlationId: effectiveCorrelationId(caller?.correlationId, appointmentId),
        metadata: { reason },
      });

      await cancelAllPendingNotificationJobsForAppointment(client, tenantId, appointmentId);

      await refreshCustomerRestrictionsAfterNoShow(client, tenantId, appointment.customer_id as string);

      return updated.rows[0];
    }),
  );
}

export async function listAppointments(
  tenantId: string,
  rawQuery: Record<string, unknown>,
  caller?: ListAppointmentsCaller,
) {
  const { limit, offset, page } = parsePagination(rawQuery);
  const {
    from,
    to,
    status,
    professional_id: queryProfessionalId,
    customer_id,
    on_date: onDate,
  } = rawQuery as Record<string, string | undefined>;

  let effectiveProfessionalId: string | undefined = queryProfessionalId;
  if (caller?.role === 'professional') {
    if (!caller.sub) {
      throw new AppError('UNAUTHORIZED', 'Token sem identificação de utilizador.', 401);
    }
    effectiveProfessionalId = await resolveAppointmentProfessionalFilter(tenantId, caller);
  }

  return withTenant(tenantId, async (client) => {
    const filters: string[] = ['a.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (from) { filters.push(`a.starts_at >= $${idx++}::timestamptz`); params.push(from); }
    if (to) { filters.push(`a.starts_at < $${idx++}::timestamptz`); params.push(to); }
    if (onDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(onDate)) {
        throw new AppError('VALIDATION_ERROR', 'Query on_date inválida (use YYYY-MM-DD).', 400);
      }
      filters.push(
        `(a.starts_at AT TIME ZONE COALESCE((SELECT timezone FROM tenants WHERE id = $1 LIMIT 1), 'UTC'))::date = $${idx++}::date`,
      );
      params.push(onDate);
    }
    if (status) { filters.push(`a.status = $${idx++}`); params.push(status); }
    if (effectiveProfessionalId) {
      filters.push(`a.professional_id = $${idx++}::uuid`);
      params.push(effectiveProfessionalId);
    }
    if (customer_id) { filters.push(`a.customer_id = $${idx++}::uuid`); params.push(customer_id); }

    const where = `WHERE ${filters.join(' AND ')}`;

    const [data, count] = await Promise.all([
      client.query(
        `SELECT a.*, c.name AS customer_name, NULL::text AS customer_notes,
                p.name AS professional_name,
                s.name AS service_name,
                COALESCE(cr.requires_deposit, false) AS customer_requires_deposit,
                COALESCE(cr.manual_booking_only, false) AS customer_manual_booking_only,
                (
                  a.status = 'confirmed'
                  AND now() > a.starts_at
                  AND now() <= a.starts_at
                    + (
                        COALESCE(
                          CASE
                            WHEN (ts.settings->>'late_tolerance_minutes') ~ '^[0-9]+$'
                            THEN (ts.settings->>'late_tolerance_minutes')::int
                          END,
                          15
                        ) * interval '1 minute'
                      )
                ) AS late_within_tolerance
           FROM appointments a
           JOIN customers c ON c.id = a.customer_id
           JOIN professionals p ON p.id = a.professional_id
           LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
           LEFT JOIN tenant_settings ts ON ts.tenant_id = a.tenant_id
           LEFT JOIN customer_restrictions cr
             ON cr.tenant_id = a.tenant_id AND cr.customer_id = a.customer_id
           ${where}
          ORDER BY a.starts_at ASC
          LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset],
      ),
      client.query(`SELECT COUNT(*)::int AS total FROM appointments a ${where}`, params),
    ]);

    return { data: data.rows, total: count.rows[0].total as number, page, limit };
  });
}

/** Detalhe de um agendamento (mesmo shape que itens de `listAppointments`). */
export async function getAppointmentById(
  tenantId: string,
  appointmentId: string,
  caller?: ListAppointmentsCaller,
) {
  let effectiveProfessionalId: string | undefined;
  if (caller?.role === 'professional') {
    if (!caller.sub) {
      throw new AppError('UNAUTHORIZED', 'Token sem identificação de utilizador.', 401);
    }
    effectiveProfessionalId = await resolveAppointmentProfessionalFilter(tenantId, caller);
  }

  return withTenant(tenantId, async (client) => {
    const filters: string[] = ['a.tenant_id = $1', 'a.id = $2::uuid'];
    const params: unknown[] = [tenantId, appointmentId];
    let idx = 3;
    if (effectiveProfessionalId) {
      filters.push(`a.professional_id = $${idx++}::uuid`);
      params.push(effectiveProfessionalId);
    }
    const where = `WHERE ${filters.join(' AND ')}`;

    const result = await client.query(
      `SELECT a.*, c.name AS customer_name, NULL::text AS customer_notes,
              p.name AS professional_name,
              s.name AS service_name,
              COALESCE(cr.requires_deposit, false) AS customer_requires_deposit,
              COALESCE(cr.manual_booking_only, false) AS customer_manual_booking_only,
              (
                a.status = 'confirmed'
                AND now() > a.starts_at
                AND now() <= a.starts_at
                  + (
                      COALESCE(
                        CASE
                          WHEN (ts.settings->>'late_tolerance_minutes') ~ '^[0-9]+$'
                          THEN (ts.settings->>'late_tolerance_minutes')::int
                        END,
                        15
                      ) * interval '1 minute'
                    )
              ) AS late_within_tolerance
         FROM appointments a
         JOIN customers c ON c.id = a.customer_id
         JOIN professionals p ON p.id = a.professional_id
         LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
         LEFT JOIN tenant_settings ts ON ts.tenant_id = a.tenant_id
         LEFT JOIN customer_restrictions cr
           ON cr.tenant_id = a.tenant_id AND cr.customer_id = a.customer_id
         ${where}
        LIMIT 1`,
      params,
    );
    if (!result.rowCount) {
      throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado', 404);
    }
    return result.rows[0];
  });
}

export async function getAppointmentHistory(tenantId: string, appointmentId: string) {
  return withTenant(tenantId, async (client) => {
    const appt = await client.query(
      `SELECT id FROM appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, appointmentId],
    );
    if (!appt.rowCount) throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado', 404);

    const result = await client.query(
      `SELECT ae.id, ae.event_type, ae.actor_user_id, u.name AS actor_name, ae.payload, ae.created_at
         FROM appointment_events ae
         LEFT JOIN users u ON u.id = ae.actor_user_id
        WHERE ae.tenant_id = $1 AND ae.appointment_id = $2
        ORDER BY ae.created_at ASC`,
      [tenantId, appointmentId],
    );
    return result.rows;
  });
}

/** Transições em `appointment_status_history` (trigger em `appointments.status`). */
export async function getAppointmentStatusHistory(tenantId: string, appointmentId: string) {
  return withTenant(tenantId, async (client) => {
    const appt = await client.query(
      `SELECT id FROM appointments WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, appointmentId],
    );
    if (!appt.rowCount) throw new AppError('APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado', 404);

    const result = await client.query(
      `SELECT h.id,
              h.previous_status::text AS previous_status,
              h.new_status::text AS new_status,
              h.changed_at,
              h.changed_by_user_id,
              u.name AS changed_by_name,
              h.payload
         FROM appointment_status_history h
         LEFT JOIN users u ON u.id = h.changed_by_user_id
        WHERE h.tenant_id = $1 AND h.appointment_id = $2
        ORDER BY h.changed_at ASC`,
      [tenantId, appointmentId],
    );
    return result.rows;
  });
}
