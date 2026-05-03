import { z } from 'zod';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { writeAuditLog } from '../../shared/audit.js';

const createRecurringTimeOffSchema = z.object({
  professional_id: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  starts_at: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  ends_at: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  reason: z.string().min(3).max(500).optional(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const updateRecurringTimeOffSchema = z.object({
  weekday: z.number().int().min(0).max(6).optional(),
  starts_at: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
  ends_at: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
  reason: z.string().min(3).max(500).optional(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  active: z.boolean().optional(),
});

export async function listRecurringTimeOff(tenantId: string, professionalId: string) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT *
         FROM professional_recurring_time_off
        WHERE tenant_id = $1
          AND professional_id = $2
        ORDER BY weekday ASC, starts_at ASC`,
      [tenantId, professionalId],
    );
    return result.rows;
  });
}

export async function createRecurringTimeOff(
  tenantId: string,
  input: z.infer<typeof createRecurringTimeOffSchema>,
  actorUserId?: string,
) {
  const data = createRecurringTimeOffSchema.parse(input);
  return withTenant(tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO professional_recurring_time_off
        (tenant_id, professional_id, weekday, starts_at, ends_at, reason, valid_from, valid_until, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
       RETURNING *`,
      [
        tenantId,
        data.professional_id,
        data.weekday,
        data.starts_at,
        data.ends_at,
        data.reason ?? null,
        data.valid_from ?? null,
        data.valid_until ?? null,
      ],
    );
    const created = result.rows[0];
    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'PROFESSIONAL_RECURRING_TIME_OFF_CREATED',
      entity: 'professional_recurring_time_off',
      entityId: created.id as string,
      after: {
        professional_id: created.professional_id,
        weekday: created.weekday,
        starts_at: created.starts_at,
        ends_at: created.ends_at,
      },
    });
    return created;
  });
}

export async function updateRecurringTimeOff(
  tenantId: string,
  recurringTimeOffId: string,
  input: z.infer<typeof updateRecurringTimeOffSchema>,
  actorUserId?: string,
) {
  const data = updateRecurringTimeOffSchema.parse(input);
  return withTenant(tenantId, async (client) => {
    const current = await client.query(
      `SELECT * FROM professional_recurring_time_off
        WHERE tenant_id = $1
          AND id = $2
        LIMIT 1`,
      [tenantId, recurringTimeOffId],
    );
    if (!current.rowCount) throw new AppError('RECURRING_TIME_OFF_NOT_FOUND', 'Exceção recorrente não encontrada', 404);
    const before = current.rows[0];

    const updated = await client.query(
      `UPDATE professional_recurring_time_off
          SET weekday = COALESCE($3::int, weekday),
              starts_at = COALESCE($4::time, starts_at),
              ends_at = COALESCE($5::time, ends_at),
              reason = COALESCE($6, reason),
              valid_from = COALESCE($7::date, valid_from),
              valid_until = COALESCE($8::date, valid_until),
              active = COALESCE($9, active)
        WHERE tenant_id = $1
          AND id = $2
        RETURNING *`,
      [
        tenantId,
        recurringTimeOffId,
        data.weekday ?? null,
        data.starts_at ?? null,
        data.ends_at ?? null,
        data.reason ?? null,
        data.valid_from ?? null,
        data.valid_until ?? null,
        data.active ?? null,
      ],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'PROFESSIONAL_RECURRING_TIME_OFF_UPDATED',
      entity: 'professional_recurring_time_off',
      entityId: recurringTimeOffId,
      before: {
        weekday: before.weekday,
        starts_at: before.starts_at,
        ends_at: before.ends_at,
        active: before.active,
      },
      after: {
        weekday: updated.rows[0].weekday,
        starts_at: updated.rows[0].starts_at,
        ends_at: updated.rows[0].ends_at,
        active: updated.rows[0].active,
      },
    });

    return updated.rows[0];
  });
}

export async function removeRecurringTimeOff(tenantId: string, recurringTimeOffId: string, actorUserId?: string) {
  return withTenant(tenantId, async (client) => {
    const current = await client.query(
      `SELECT * FROM professional_recurring_time_off
        WHERE tenant_id = $1
          AND id = $2
        LIMIT 1`,
      [tenantId, recurringTimeOffId],
    );
    if (!current.rowCount) throw new AppError('RECURRING_TIME_OFF_NOT_FOUND', 'Exceção recorrente não encontrada', 404);
    const before = current.rows[0];

    const updated = await client.query(
      `UPDATE professional_recurring_time_off
          SET active = false
        WHERE tenant_id = $1
          AND id = $2
        RETURNING *`,
      [tenantId, recurringTimeOffId],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'PROFESSIONAL_RECURRING_TIME_OFF_REMOVED',
      entity: 'professional_recurring_time_off',
      entityId: recurringTimeOffId,
      before: { active: before.active },
      after: { active: false },
    });

    return updated.rows[0];
  });
}
