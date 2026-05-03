import { z } from 'zod';
import type { PoolClient } from 'pg';
import { env } from '../../config/env.js';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/pagination.js';
import { writeAuditLog } from '../../shared/audit.js';
import { loadTenantTimeZone } from '../notificationJobs/schedule.js';
import { NotificationJobType } from '../notificationJobs/types.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createWaitlistEntrySchema = z.object({
  customer_id: z.string().uuid(),
  service_id: z.string().uuid(),
  professional_id: z.string().uuid().optional().nullable(),
  preferred_date_from: dateStr,
  preferred_date_to: dateStr,
  shift_preference: z.enum(['morning', 'afternoon', 'evening', 'any']).default('any'),
  deposit_priority: z.boolean().optional().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function createWaitlistEntry(
  tenantId: string,
  rawBody: unknown,
  actorUserId: string | undefined,
) {
  const data = createWaitlistEntrySchema.parse(rawBody);
  if (data.preferred_date_from > data.preferred_date_to) {
    throw new AppError('WAITLIST_INVALID_RANGE', 'preferred_date_from não pode ser maior que preferred_date_to.', 422);
  }

  return withTenant(tenantId, async (client) => {
    const cust = await client.query(`SELECT id FROM customers WHERE tenant_id = $1 AND id = $2`, [
      tenantId,
      data.customer_id,
    ]);
    if (!cust.rowCount) throw new AppError('CUSTOMER_NOT_FOUND', 'Cliente não encontrado', 404);

    const svc = await client.query(`SELECT id FROM services WHERE tenant_id = $1 AND id = $2`, [
      tenantId,
      data.service_id,
    ]);
    if (!svc.rowCount) throw new AppError('SERVICE_NOT_FOUND', 'Serviço não encontrado', 404);

    if (data.professional_id) {
      const prof = await client.query(`SELECT id FROM professionals WHERE tenant_id = $1 AND id = $2`, [
        tenantId,
        data.professional_id,
      ]);
      if (!prof.rowCount) throw new AppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado', 404);
      const ps = await client.query(
        `SELECT 1 FROM professional_services WHERE tenant_id = $1 AND professional_id = $2 AND service_id = $3`,
        [tenantId, data.professional_id, data.service_id],
      );
      if (!ps.rowCount) {
        throw new AppError(
          'SERVICE_NOT_BOOKABLE',
          'Este profissional não está habilitado para o serviço escolhido.',
          422,
        );
      }
    }

    const ins = await client.query(
      `INSERT INTO waitlist_entries
         (tenant_id, customer_id, service_id, professional_id, preferred_date_from, preferred_date_to,
          shift_preference, deposit_priority, metadata, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'active')
       RETURNING *`,
      [
        tenantId,
        data.customer_id,
        data.service_id,
        data.professional_id ?? null,
        data.preferred_date_from,
        data.preferred_date_to,
        data.shift_preference,
        data.deposit_priority,
        JSON.stringify(data.metadata ?? {}),
      ],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'WAITLIST_ENTRY_CREATED',
      entity: 'waitlist_entry',
      entityId: ins.rows[0].id as string,
      after: {
        customer_id: data.customer_id,
        service_id: data.service_id,
        preferred_date_from: data.preferred_date_from,
        preferred_date_to: data.preferred_date_to,
      },
    });

    return ins.rows[0];
  });
}

export async function listWaitlistEntries(tenantId: string, rawQuery: Record<string, unknown>) {
  const { limit, offset, page } = parsePagination(rawQuery);
  const rawSt = String(rawQuery.status ?? 'active').toLowerCase();
  const statusFilter = ['active', 'cancelled', 'converted', 'all'].includes(rawSt) ? rawSt : 'active';

  return withTenant(tenantId, async (client) => {
    const baseSelect = `
      SELECT w.*, c.name AS customer_name, c.phone AS customer_phone, c.is_vip AS customer_is_vip
        FROM waitlist_entries w
        JOIN customers c ON c.tenant_id = w.tenant_id AND c.id = w.customer_id
       WHERE w.tenant_id = $1`;

    let listSql: string;
    let countSql: string;
    let params: unknown[];
    let countParams: unknown[];

    if (statusFilter === 'all') {
      listSql = `${baseSelect} ORDER BY w.created_at ASC LIMIT $2 OFFSET $3`;
      countSql = `SELECT COUNT(*)::int AS total FROM waitlist_entries w WHERE w.tenant_id = $1`;
      params = [tenantId, limit, offset];
      countParams = [tenantId];
    } else {
      listSql = `${baseSelect} AND w.status = $2 ORDER BY w.created_at ASC LIMIT $3 OFFSET $4`;
      countSql = `SELECT COUNT(*)::int AS total FROM waitlist_entries w WHERE w.tenant_id = $1 AND w.status = $2`;
      params = [tenantId, statusFilter, limit, offset];
      countParams = [tenantId, statusFilter];
    }

    const [data, count] = await Promise.all([
      client.query(listSql, params),
      client.query(countSql, countParams),
    ]);

    return { data: data.rows, total: count.rows[0].total as number, page, limit };
  });
}

export async function cancelWaitlistEntry(tenantId: string, entryId: string, actorUserId: string | undefined) {
  return withTenant(tenantId, async (client) => {
    const cur = await client.query(
      `SELECT * FROM waitlist_entries WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, entryId],
    );
    if (!cur.rowCount) throw new AppError('WAITLIST_ENTRY_NOT_FOUND', 'Entrada de fila não encontrada', 404);
    const row = cur.rows[0];
    if (String(row.status) !== 'active') {
      throw new AppError('WAITLIST_NOT_ACTIVE', 'Entrada já não está ativa.', 409);
    }

    const upd = await client.query(
      `UPDATE waitlist_entries SET status = 'cancelled', updated_at = now()
        WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [tenantId, entryId],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'WAITLIST_ENTRY_CANCELLED',
      entity: 'waitlist_entry',
      entityId: entryId,
      before: { status: row.status },
      after: { status: 'cancelled' },
    });

    return upd.rows[0];
  });
}

function shiftMatchesLocalHour(shift: string, hour: number): boolean {
  if (shift === 'any') return true;
  if (shift === 'morning') return hour >= 6 && hour < 12;
  if (shift === 'afternoon') return hour >= 12 && hour < 18;
  if (shift === 'evening') return hour >= 18 && hour <= 23;
  return true;
}

/** Escolhe o cliente mais prioritário na fila para o slot libertado. */
export async function pickBestWaitlistEntryForSlot(
  client: PoolClient,
  tenantId: string,
  params: {
    professionalId: string;
    serviceId: string;
    freedStartsAtIso: string;
    tz: string;
  },
): Promise<{ id: string; customer_id: string } | null> {
  const freedDt = new Date(params.freedStartsAtIso);
  if (Number.isNaN(freedDt.getTime())) return null;

  const r = await client.query<{ id: string; customer_id: string; shift_preference: string }>(
    `WITH cfg AS (
       SELECT COALESCE(
         (SELECT settings FROM tenant_settings WHERE tenant_id = $1 LIMIT 1),
         '{}'::jsonb
       ) AS settings
     )
     SELECT w.id, w.customer_id, w.shift_preference::text AS shift_preference
       FROM waitlist_entries w
       JOIN customers c ON c.tenant_id = w.tenant_id AND c.id = w.customer_id
       CROSS JOIN cfg
      WHERE w.tenant_id = $1
        AND w.status = 'active'
        AND w.service_id = $2
        AND (w.professional_id IS NULL OR w.professional_id = $3)
        AND (($4::timestamptz AT TIME ZONE $5)::date BETWEEN w.preferred_date_from AND w.preferred_date_to)
      ORDER BY
        (
          (CASE WHEN c.is_vip THEN COALESCE((cfg.settings->'waitlist'->>'vip_weight')::int, 1000) ELSE 0 END)
          + (CASE WHEN w.deposit_priority THEN COALESCE((cfg.settings->'waitlist'->>'deposit_weight')::int, 500) ELSE 0 END)
        ) DESC,
        w.created_at ASC
      LIMIT 20`,
    [tenantId, params.serviceId, params.professionalId, params.freedStartsAtIso, params.tz],
  );

  const hourRes = await client.query<{ h: string }>(
    `SELECT to_char(($1::timestamptz AT TIME ZONE $2)::time, 'HH24') AS h`,
    [params.freedStartsAtIso, params.tz],
  );
  const hour = Number(hourRes.rows[0]?.h ?? 'NaN');

  for (const row of r.rows) {
    if (shiftMatchesLocalHour(row.shift_preference, hour)) {
      return { id: row.id, customer_id: row.customer_id };
    }
  }
  return null;
}

export type SlotFreedReason = 'cancelled' | 'rescheduled';

/**
 * Enfileira notificação WhatsApp (notification_jobs → outbox) para o próximo elegível.
 * **Desativado por defeito** (`WAITLIST_SLOT_NOTIFY_ENABLED=false`): decisão PO — sem automação waitlist neste card.
 */
export async function tryEnqueueWaitlistOnSlotFreed(
  client: PoolClient,
  tenantId: string,
  params: {
    professionalId: string;
    serviceId: string;
    freedStartsAtIso: string;
    freedEndsAtIso: string;
    sourceAppointmentId: string;
    reason: SlotFreedReason;
  },
): Promise<void> {
  if (!env.WAITLIST_SLOT_NOTIFY_ENABLED) {
    return;
  }

  const tz = await loadTenantTimeZone(client, tenantId);

  const candidate = await pickBestWaitlistEntryForSlot(client, tenantId, {
    professionalId: params.professionalId,
    serviceId: params.serviceId,
    freedStartsAtIso: params.freedStartsAtIso,
    tz,
  });

  if (!candidate) return;

  const dup = await client.query(
    `SELECT 1 FROM notification_jobs
      WHERE tenant_id = $1 AND job_type = $2 AND status = 'pending'
        AND payload->>'waitlist_entry_id' = $3 AND payload->>'source_appointment_id' = $4
      LIMIT 1`,
    [tenantId, NotificationJobType.waitlistSlotAvailable, candidate.id, params.sourceAppointmentId],
  );
  if (dup.rowCount) return;

  const payload = {
    waitlist_entry_id: candidate.id,
    source_appointment_id: params.sourceAppointmentId,
    freed_starts_at: params.freedStartsAtIso,
    freed_ends_at: params.freedEndsAtIso,
    professional_id: params.professionalId,
    service_id: params.serviceId,
    tenant_timezone: tz,
    freed_reason: params.reason,
  };

  await client.query(
    `INSERT INTO notification_jobs
       (tenant_id, job_type, run_at, status, payload, appointment_id, customer_id)
     VALUES ($1, $2, now(), 'pending', $3::jsonb, NULL, $4)`,
    [tenantId, NotificationJobType.waitlistSlotAvailable, JSON.stringify(payload), candidate.customer_id],
  );
}
