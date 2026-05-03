import pg from 'pg';
import type { PoolClient } from 'pg';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { writeAuditLog } from '../../shared/audit.js';
import { sqlAppointmentSlotBlockingStatusesIn } from '../../shared/appointment-status.js';
import { expandFootprintUtc, loadBookableService } from '../catalog/booking-rules.js';
import { withAppointmentLock } from './lock.js';
import { createAppointmentHoldBodySchema, type CreateAppointmentHoldBody } from './appointment-holds.dto.js';

export { createAppointmentHoldBodySchema } from './appointment-holds.dto.js';

const DEFAULT_TTL_MINUTES = 15;

function isoSame(a: string | Date, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Marca hold como convertido após criar agendamento no mesmo slot (transação partilhada).
 */
export async function releaseHoldForBooking(
  client: PoolClient,
  tenantId: string,
  holdId: string,
  data: {
    professional_id: string;
    service_id: string;
    starts_at: string;
    ends_at: string;
  },
): Promise<void> {
  const h = await client.query(
    `SELECT * FROM appointment_holds
      WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, holdId],
  );
  if (!h.rowCount) throw new AppError('HOLD_NOT_FOUND', 'Reserva temporária não encontrada', 404);
  const hold = h.rows[0];
  if (hold.status !== 'active') {
    throw new AppError('HOLD_INVALID', 'Reserva inválida ou já utilizada', 409);
  }
  if (new Date(hold.expires_at as string) < new Date()) {
    throw new AppError('HOLD_EXPIRED', 'Reserva expirada', 409);
  }
  if (String(hold.professional_id) !== data.professional_id) {
    throw new AppError('HOLD_MISMATCH', 'Profissional da reserva não coincide', 422);
  }
  if (!isoSame(hold.starts_at as string, data.starts_at) || !isoSame(hold.ends_at as string, data.ends_at)) {
    throw new AppError('HOLD_MISMATCH', 'Horários da reserva não coincidem com o agendamento', 422);
  }
  if (hold.service_id && String(hold.service_id) !== data.service_id) {
    throw new AppError('HOLD_MISMATCH', 'Serviço da reserva não coincide', 422);
  }

  await client.query(
    `UPDATE appointment_holds SET status = 'converted', updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, holdId],
  );
}

function throwIfHoldExclusion(err: unknown): void {
  if (err instanceof pg.DatabaseError && err.code === '23P01') {
    throw new AppError('SLOT_UNAVAILABLE', 'Horário indisponível (reserva ou agendamento em conflito).', 409);
  }
}

/**
 * Expira holds ativos com TTL vencido; regista auditoria agregada.
 */
export async function expireStaleAppointmentHolds(tenantId: string): Promise<string[]> {
  return withTenant(tenantId, async (client) => expireStaleAppointmentHoldsWithClient(client, tenantId));
}

export async function getAppointmentHoldById(tenantId: string, holdId: string) {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT * FROM appointment_holds WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, holdId],
    );
    if (!r.rowCount) throw new AppError('HOLD_NOT_FOUND', 'Reserva temporária não encontrada', 404);
    return r.rows[0];
  });
}

export async function expireAppointmentHoldById(
  tenantId: string,
  holdId: string,
  actorUserId?: string | null,
) {
  return withTenant(tenantId, async (client) => {
    const cur = await client.query(
      `SELECT * FROM appointment_holds WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, holdId],
    );
    if (!cur.rowCount) throw new AppError('HOLD_NOT_FOUND', 'Reserva temporária não encontrada', 404);
    const row = cur.rows[0] as Record<string, unknown>;
    if (String(row.status) !== 'active') {
      throw new AppError('HOLD_NOT_ACTIVE', 'Apenas holds ativos podem ser expirados manualmente.', 409);
    }

    const upd = await client.query(
      `UPDATE appointment_holds
          SET status = 'expired', updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND status = 'active'
        RETURNING *`,
      [tenantId, holdId],
    );
    const after = upd.rows[0];
    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'APPOINTMENT_HOLD_EXPIRED',
      entity: 'appointment_hold',
      entityId: holdId,
      before: { status: row.status, expires_at: row.expires_at },
      after: { status: 'expired', reason: 'manual' },
    });
    return after;
  });
}

/**
 * Reserva temporária de slot (TTL 5–15 min, EXCLUDE só em holds `active`, idempotência por chave).
 */
export async function createAppointmentHold(tenantId: string, input: CreateAppointmentHoldBody) {
  const data = createAppointmentHoldBodySchema.parse(input);
  if (new Date(data.ends_at) <= new Date(data.starts_at)) {
    throw new AppError('INVALID_PERIOD', 'ends_at deve ser posterior a starts_at', 400);
  }

  const lockKey = `lock:appointment:${tenantId}:${data.professional_id}:${data.starts_at}:${data.ends_at}`;
  return withAppointmentLock(lockKey, async () =>
    withTenant(tenantId, async (client) => {
      await expireStaleAppointmentHoldsWithClient(client, tenantId);

      const svc = await loadBookableService(client, tenantId, data.professional_id, data.service_id);
      const { footprintStartIso, footprintEndIso } = expandFootprintUtc(
        data.starts_at,
        data.ends_at,
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
        [tenantId, data.professional_id, footprintStartIso, footprintEndIso],
      );
      if (conflictAppt.rowCount) {
        throw new AppError('SLOT_UNAVAILABLE', 'Horário já ocupado por agendamento.', 409);
      }

      const ttl = data.ttl_minutes ?? DEFAULT_TTL_MINUTES;

      const existingActive = await client.query(
        `SELECT * FROM appointment_holds
          WHERE tenant_id = $1 AND idempotency_key = $2 AND status = 'active'
          LIMIT 1`,
        [tenantId, data.idempotency_key],
      );
      if (existingActive.rowCount) {
        return existingActive.rows[0];
      }

      let result;
      try {
        result = await client.query(
          `INSERT INTO appointment_holds
           (tenant_id, professional_id, service_id, customer_id, starts_at, ends_at,
            expires_at, status, idempotency_key)
           VALUES ($1,$2,$3,$4,$5,$6, now() + ($7::int * interval '1 minute'),
                   'active', $8)
           RETURNING *`,
          [
            tenantId,
            data.professional_id,
            data.service_id,
            data.customer_id ?? null,
            data.starts_at,
            data.ends_at,
            ttl,
            data.idempotency_key,
          ],
        );
      } catch (e) {
        throwIfHoldExclusion(e);
        if (e instanceof pg.DatabaseError && e.code === '23505') {
          const dup = await client.query(
            `SELECT * FROM appointment_holds
              WHERE tenant_id = $1 AND idempotency_key = $2 AND status = 'active' LIMIT 1`,
            [tenantId, data.idempotency_key],
          );
          if (dup.rowCount) return dup.rows[0];
        }
        throw e;
      }

      return result.rows[0];
    }),
  );
}

/** Variante interna (evita nested withTenant quando já há transação). */
export async function expireStaleAppointmentHoldsWithClient(
  client: PoolClient,
  tenantId: string,
): Promise<string[]> {
  const r = await client.query<{ id: string }>(
    `UPDATE appointment_holds
        SET status = 'expired', updated_at = now()
      WHERE tenant_id = $1
        AND status = 'active'
        AND expires_at < now()
      RETURNING id`,
    [tenantId],
  );
  const ids = r.rows.map((row) => row.id);
  if (ids.length > 0) {
    await writeAuditLog(client, {
      tenantId,
      action: 'APPOINTMENT_HOLD_EXPIRED_BATCH',
      entity: 'appointment_hold',
      after: { expired_hold_ids: ids, count: ids.length },
    });
  }
  return ids;
}
