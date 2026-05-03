import { z } from 'zod';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { writeAuditLog } from '../../shared/audit.js';

const createTimeOffSchema = z.object({
  professional_id: z.string().uuid(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  reason: z.string().min(3).max(500).optional(),
});

const updateTimeOffSchema = z.object({
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  reason: z.string().min(3).max(500).optional(),
  active: z.boolean().optional(),
});

export async function listTimeOff(tenantId: string, professionalId: string) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT *
         FROM professional_time_off
        WHERE tenant_id = $1
          AND professional_id = $2
        ORDER BY starts_at ASC`,
      [tenantId, professionalId],
    );
    return result.rows;
  });
}

export async function createTimeOff(tenantId: string, input: z.infer<typeof createTimeOffSchema>, actorUserId?: string) {
  const data = createTimeOffSchema.parse(input);
  return withTenant(tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO professional_time_off
        (tenant_id, professional_id, starts_at, ends_at, reason, active)
       VALUES ($1,$2,$3,$4,$5,true)
       RETURNING *`,
      [tenantId, data.professional_id, data.starts_at, data.ends_at, data.reason ?? null],
    );
    const created = result.rows[0];
    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'PROFESSIONAL_TIME_OFF_CREATED',
      entity: 'professional_time_off',
      entityId: created.id as string,
      after: {
        professional_id: created.professional_id,
        starts_at: created.starts_at,
        ends_at: created.ends_at,
      },
    });
    return created;
  });
}

export async function updateTimeOff(
  tenantId: string,
  timeOffId: string,
  input: z.infer<typeof updateTimeOffSchema>,
  actorUserId?: string,
) {
  const data = updateTimeOffSchema.parse(input);
  return withTenant(tenantId, async (client) => {
    const current = await client.query(
      `SELECT * FROM professional_time_off
        WHERE tenant_id = $1
          AND id = $2
        LIMIT 1`,
      [tenantId, timeOffId],
    );
    if (!current.rowCount) throw new AppError('TIME_OFF_NOT_FOUND', 'Folga/exceção não encontrada', 404);
    const before = current.rows[0];

    const updated = await client.query(
      `UPDATE professional_time_off
          SET starts_at = COALESCE($3::timestamptz, starts_at),
              ends_at = COALESCE($4::timestamptz, ends_at),
              reason = COALESCE($5, reason),
              active = COALESCE($6, active)
        WHERE tenant_id = $1
          AND id = $2
        RETURNING *`,
      [tenantId, timeOffId, data.starts_at ?? null, data.ends_at ?? null, data.reason ?? null, data.active ?? null],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'PROFESSIONAL_TIME_OFF_UPDATED',
      entity: 'professional_time_off',
      entityId: timeOffId,
      before: {
        starts_at: before.starts_at,
        ends_at: before.ends_at,
        reason: before.reason,
        active: before.active,
      },
      after: {
        starts_at: updated.rows[0].starts_at,
        ends_at: updated.rows[0].ends_at,
        reason: updated.rows[0].reason,
        active: updated.rows[0].active,
      },
    });

    return updated.rows[0];
  });
}

export async function removeTimeOff(tenantId: string, timeOffId: string, actorUserId?: string) {
  return withTenant(tenantId, async (client) => {
    const current = await client.query(
      `SELECT * FROM professional_time_off
        WHERE tenant_id = $1
          AND id = $2
        LIMIT 1`,
      [tenantId, timeOffId],
    );
    if (!current.rowCount) throw new AppError('TIME_OFF_NOT_FOUND', 'Folga/exceção não encontrada', 404);
    const before = current.rows[0];

    const updated = await client.query(
      `UPDATE professional_time_off
          SET active = false
        WHERE tenant_id = $1
          AND id = $2
        RETURNING *`,
      [tenantId, timeOffId],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'PROFESSIONAL_TIME_OFF_REMOVED',
      entity: 'professional_time_off',
      entityId: timeOffId,
      before: { active: before.active },
      after: { active: false },
    });

    return updated.rows[0];
  });
}
