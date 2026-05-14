import type { PoolClient } from 'pg';
import { AppError } from '../../shared/errors.js';

/**
 * Garante que o intervalo nominal do agendamento cai num dia com expediente
 * e dentro da janela configurada em `business_hours` (mesma lógica de calendário da availability).
 */
export async function assertAppointmentFitsBusinessHours(
  client: PoolClient,
  tenantId: string,
  professionalId: string,
  startsAtIso: string,
  endsAtIso: string,
): Promise<void> {
  const r = await client.query(
    `WITH ctx AS (
       SELECT COALESCE(p.timezone, t.timezone, 'UTC') AS tz
         FROM professionals p
         JOIN tenants t ON t.id = p.tenant_id
        WHERE p.tenant_id = $1 AND p.id = $2
        LIMIT 1
     ),
     lb AS (
       SELECT ($3::timestamptz AT TIME ZONE (SELECT tz FROM ctx)) AS st_local,
              ($4::timestamptz AT TIME ZONE (SELECT tz FROM ctx)) AS et_local
     )
     SELECT 1
       FROM business_hours bh, lb
      WHERE bh.tenant_id = $1
        AND bh.professional_id = $2
        AND bh.active = true
        AND bh.weekday = EXTRACT(DOW FROM lb.st_local)::int
        AND date_trunc('day', lb.st_local) = date_trunc('day', lb.et_local)
        AND lb.st_local::time >= bh.starts_at
        AND lb.et_local::time <= bh.ends_at
      LIMIT 1`,
    [tenantId, professionalId, startsAtIso, endsAtIso],
  );
  if (!r.rowCount) {
    throw new AppError(
      'SLOT_UNAVAILABLE',
      'Horário fora do expediente ou indisponível neste dia.',
      409,
    );
  }
}
