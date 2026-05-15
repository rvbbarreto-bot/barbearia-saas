import { z } from 'zod';
import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import {
  createCalendarBlock,
  deleteCalendarBlock,
  listCalendarBlocks,
  type CalendarBlockAuditCaller,
} from '../calendarBlocks/service.js';

const createTimeBlockBodySchema = z.object({
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  kind: z.enum(['time_off', 'break', 'holiday', 'maintenance', 'manual']).default('manual'),
  reason: z.string().max(500).optional(),
});

export async function listProfessionalTimeBlocks(
  tenantId: string,
  professionalId: string,
  rawQuery: Record<string, unknown>,
) {
  return listCalendarBlocks(tenantId, { ...rawQuery, professional_id: professionalId });
}

export async function createProfessionalTimeBlock(
  tenantId: string,
  professionalId: string,
  body: unknown,
  caller?: CalendarBlockAuditCaller,
) {
  const data = createTimeBlockBodySchema.parse(body);
  await withTenant(tenantId, async (client) => {
    const ok = await client.query(
      `SELECT 1 FROM professionals WHERE tenant_id = $1 AND id = $2::uuid AND active = true LIMIT 1`,
      [tenantId, professionalId],
    );
    if (!ok.rowCount) {
      throw new AppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado ou inativo.', 404);
    }
  });
  return createCalendarBlock(
    tenantId,
    {
      professional_id: professionalId,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      kind: data.kind,
      reason: data.reason,
    },
    caller?.sub,
    caller,
  );
}

export async function deleteProfessionalTimeBlock(
  tenantId: string,
  professionalId: string,
  blockId: string,
  caller?: CalendarBlockAuditCaller,
) {
  return deleteCalendarBlock(tenantId, blockId, caller?.sub, {
    professionalId,
    auditCaller: caller,
  });
}
