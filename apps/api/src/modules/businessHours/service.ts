import { z } from 'zod';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { writeAuditLog } from '../../shared/audit.js';

const createBusinessHoursSchema = z.object({
  professional_id: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  starts_at: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  ends_at: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  slot_interval_minutes: z.number().int().min(5).max(120).default(30),
});

const updateBusinessHoursSchema = z.object({
  weekday: z.number().int().min(0).max(6).optional(),
  starts_at: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
  ends_at: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
  slot_interval_minutes: z.number().int().min(5).max(120).optional(),
  active: z.boolean().optional(),
});

async function assertNoOverlap(
  client: any,
  params: {
    tenantId: string;
    professionalId: string;
    weekday: number;
    startsAt: string;
    endsAt: string;
    ignoreId?: string;
  },
) {
  const overlap = await client.query(
    `SELECT id
       FROM business_hours
      WHERE tenant_id = $1
        AND professional_id = $2
        AND weekday = $3
        AND active = true
        AND ($4::time < ends_at AND $5::time > starts_at)
        AND ($6::uuid IS NULL OR id <> $6::uuid)
      LIMIT 1`,
    [
      params.tenantId,
      params.professionalId,
      params.weekday,
      params.startsAt,
      params.endsAt,
      params.ignoreId ?? null,
    ],
  );
  if (overlap.rowCount) {
    throw new AppError('BUSINESS_HOURS_OVERLAP', 'Janela de horário sobreposta para este profissional/dia', 409);
  }
}

export async function listBusinessHours(tenantId: string, professionalId: string) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT *
         FROM business_hours
        WHERE tenant_id = $1
          AND professional_id = $2
        ORDER BY weekday ASC, starts_at ASC`,
      [tenantId, professionalId],
    );
    return result.rows;
  });
}

export async function createBusinessHours(
  tenantId: string,
  input: z.infer<typeof createBusinessHoursSchema>,
  actorUserId?: string,
) {
  const data = createBusinessHoursSchema.parse(input);
  return withTenant(tenantId, async (client) => {
    await assertNoOverlap(client, {
      tenantId,
      professionalId: data.professional_id,
      weekday: data.weekday,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
    });

    const result = await client.query(
      `INSERT INTO business_hours
        (tenant_id, professional_id, weekday, starts_at, ends_at, slot_interval_minutes, active)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       RETURNING *`,
      [
        tenantId,
        data.professional_id,
        data.weekday,
        data.starts_at,
        data.ends_at,
        data.slot_interval_minutes,
      ],
    );
    const created = result.rows[0];

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'BUSINESS_HOURS_CREATED',
      entity: 'business_hours',
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

export async function updateBusinessHours(
  tenantId: string,
  businessHoursId: string,
  input: z.infer<typeof updateBusinessHoursSchema>,
  actorUserId?: string,
) {
  const data = updateBusinessHoursSchema.parse(input);
  return withTenant(tenantId, async (client) => {
    const current = await client.query(
      `SELECT * FROM business_hours
        WHERE tenant_id = $1
          AND id = $2
        LIMIT 1`,
      [tenantId, businessHoursId],
    );
    if (!current.rowCount) throw new AppError('BUSINESS_HOURS_NOT_FOUND', 'Regra de horário não encontrada', 404);
    const before = current.rows[0];

    const nextWeekday = data.weekday ?? before.weekday;
    const nextStartsAt = data.starts_at ?? before.starts_at;
    const nextEndsAt = data.ends_at ?? before.ends_at;
    const nextActive = data.active ?? before.active;

    if (nextActive) {
      await assertNoOverlap(client, {
        tenantId,
        professionalId: before.professional_id,
        weekday: nextWeekday,
        startsAt: nextStartsAt,
        endsAt: nextEndsAt,
        ignoreId: businessHoursId,
      });
    }

    const updated = await client.query(
      `UPDATE business_hours
          SET weekday = COALESCE($3::int, weekday),
              starts_at = COALESCE($4::time, starts_at),
              ends_at = COALESCE($5::time, ends_at),
              slot_interval_minutes = COALESCE($6::int, slot_interval_minutes),
              active = COALESCE($7, active)
        WHERE tenant_id = $1
          AND id = $2
        RETURNING *`,
      [
        tenantId,
        businessHoursId,
        data.weekday ?? null,
        data.starts_at ?? null,
        data.ends_at ?? null,
        data.slot_interval_minutes ?? null,
        data.active ?? null,
      ],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'BUSINESS_HOURS_UPDATED',
      entity: 'business_hours',
      entityId: businessHoursId,
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

export async function removeBusinessHours(tenantId: string, businessHoursId: string, actorUserId?: string) {
  return withTenant(tenantId, async (client) => {
    const current = await client.query(
      `SELECT * FROM business_hours
        WHERE tenant_id = $1
          AND id = $2
        LIMIT 1`,
      [tenantId, businessHoursId],
    );
    if (!current.rowCount) throw new AppError('BUSINESS_HOURS_NOT_FOUND', 'Regra de horário não encontrada', 404);
    const before = current.rows[0];

    const updated = await client.query(
      `UPDATE business_hours
          SET active = false
        WHERE tenant_id = $1
          AND id = $2
        RETURNING *`,
      [tenantId, businessHoursId],
    );

    await writeAuditLog(client, {
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'BUSINESS_HOURS_REMOVED',
      entity: 'business_hours',
      entityId: businessHoursId,
      before: { active: before.active },
      after: { active: false },
    });

    return updated.rows[0];
  });
}
