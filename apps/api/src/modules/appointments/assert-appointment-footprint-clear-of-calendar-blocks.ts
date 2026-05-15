import type { PoolClient } from 'pg';
import { AppError } from '../../shared/errors.js';

/**
 * Garante que o intervalo (footprint com buffers) não intersecta bloqueios manuais
 * (`calendar_blocks`) do profissional ou bloqueios a nível de tenant.
 * Alinhado à lógica de `availability/service.ts` para slots indisponíveis.
 */
export async function assertAppointmentFootprintClearOfCalendarBlocks(
  client: PoolClient,
  tenantId: string,
  professionalId: string,
  footprintStartIso: string,
  footprintEndIso: string,
): Promise<void> {
  const hit = await client.query(
    `SELECT cb.id
       FROM calendar_blocks cb
      WHERE cb.tenant_id = $1
        AND (cb.professional_id IS NULL OR cb.professional_id = $2::uuid)
        AND tstzrange(cb.starts_at, cb.ends_at, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')
      LIMIT 1`,
    [tenantId, professionalId, footprintStartIso, footprintEndIso],
  );
  if (hit.rowCount) {
    throw new AppError(
      'SLOT_UNAVAILABLE',
      'Horário coberto por bloqueio manual de agenda.',
      409,
    );
  }
}
