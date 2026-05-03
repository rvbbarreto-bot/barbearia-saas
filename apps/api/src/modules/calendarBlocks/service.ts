import { z } from 'zod';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/pagination.js';
import { writeAuditLog } from '../../shared/audit.js';

const createBlockSchema = z.object({
  professional_id: z.string().uuid().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  kind: z.enum(['time_off', 'break', 'holiday', 'maintenance', 'manual']).default('manual'),
  reason: z.string().max(500).optional(),
});

const updateBlockSchema = z.object({
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  kind: z.enum(['time_off', 'break', 'holiday', 'maintenance', 'manual']).optional(),
  reason: z.string().max(500).optional(),
});

export async function listCalendarBlocks(tenantId: string, rawQuery: Record<string, unknown>) {
  const { limit, offset, page } = parsePagination(rawQuery);
  const professionalId = rawQuery.professional_id as string | undefined;
  const from = rawQuery.from as string | undefined;
  const to = rawQuery.to as string | undefined;

  return withTenant(tenantId, async (client) => {
    const filters: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (professionalId) { filters.push(`professional_id = $${idx++}`); params.push(professionalId); }
    if (from) { filters.push(`ends_at > $${idx++}::timestamptz`); params.push(from); }
    if (to) { filters.push(`starts_at < $${idx++}::timestamptz`); params.push(to); }

    const where = `WHERE ${filters.join(' AND ')}`;

    const [data, count] = await Promise.all([
      client.query(
        `SELECT id, professional_id, starts_at, ends_at, kind, reason, created_at
           FROM calendar_blocks ${where}
          ORDER BY starts_at ASC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset],
      ),
      client.query(`SELECT COUNT(*)::int AS total FROM calendar_blocks ${where}`, params),
    ]);

    return { data: data.rows, total: count.rows[0].total as number, page, limit };
  });
}

export async function createCalendarBlock(
  tenantId: string,
  input: z.infer<typeof createBlockSchema>,
  actorUserId?: string,
) {
  const data = createBlockSchema.parse(input);

  if (new Date(data.ends_at) <= new Date(data.starts_at)) {
    throw new AppError('INVALID_PERIOD', 'ends_at deve ser posterior a starts_at', 400);
  }

  return withTenant(tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO calendar_blocks (tenant_id, professional_id, starts_at, ends_at, kind, reason)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tenantId, data.professional_id ?? null, data.starts_at, data.ends_at, data.kind, data.reason ?? null],
    );
    await writeAuditLog(client, {
      tenantId, actorUserId: actorUserId ?? null, action: 'CALENDAR_BLOCK_CREATED',
      entity: 'calendar_block', entityId: result.rows[0].id as string,
      after: { kind: data.kind, starts_at: data.starts_at, ends_at: data.ends_at, professional_id: data.professional_id },
    });
    return result.rows[0];
  });
}

export async function updateCalendarBlock(
  tenantId: string,
  blockId: string,
  input: z.infer<typeof updateBlockSchema>,
  actorUserId?: string,
) {
  const data = updateBlockSchema.parse(input);
  return withTenant(tenantId, async (client) => {
    const current = await client.query(
      `SELECT id FROM calendar_blocks WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, blockId],
    );
    if (!current.rowCount) throw new AppError('BLOCK_NOT_FOUND', 'Bloqueio não encontrado', 404);

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.starts_at !== undefined) { sets.push(`starts_at = $${idx++}`); params.push(data.starts_at); }
    if (data.ends_at !== undefined) { sets.push(`ends_at = $${idx++}`); params.push(data.ends_at); }
    if (data.kind !== undefined) { sets.push(`kind = $${idx++}`); params.push(data.kind); }
    if (data.reason !== undefined) { sets.push(`reason = $${idx++}`); params.push(data.reason); }

    if (sets.length === 0) throw new AppError('NO_CHANGES', 'Nenhum campo para atualizar', 400);

    params.push(tenantId, blockId);
    const result = await client.query(
      `UPDATE calendar_blocks SET ${sets.join(', ')} WHERE tenant_id = $${idx} AND id = $${idx + 1} RETURNING *`,
      params,
    );
    await writeAuditLog(client, {
      tenantId, actorUserId: actorUserId ?? null, action: 'CALENDAR_BLOCK_UPDATED',
      entity: 'calendar_block', entityId: blockId, after: data,
    });
    return result.rows[0];
  });
}

export async function deleteCalendarBlock(tenantId: string, blockId: string, actorUserId?: string) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query(
      `DELETE FROM calendar_blocks WHERE tenant_id = $1 AND id = $2 RETURNING id`,
      [tenantId, blockId],
    );
    if (!result.rowCount) throw new AppError('BLOCK_NOT_FOUND', 'Bloqueio não encontrado', 404);
    await writeAuditLog(client, {
      tenantId, actorUserId: actorUserId ?? null, action: 'CALENDAR_BLOCK_DELETED',
      entity: 'calendar_block', entityId: blockId,
    });
    return { deleted: true };
  });
}
