import { PoolClient } from 'pg';
import { AppError } from '../../shared/errors.js';

export type BookableService = {
  id: string;
  duration_minutes: number;
  price_cents: number;
  active: boolean;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
};

/** Resolve serviço ativo vinculado ao profissional (tenant + professional_services). */
export async function loadBookableService(
  client: PoolClient,
  tenantId: string,
  professionalId: string,
  serviceId: string,
): Promise<BookableService> {
  const r = await client.query(
    `SELECT s.id, s.duration_minutes, s.price_cents, s.active,
            COALESCE(s.buffer_before_minutes, 0)::int AS buffer_before_minutes,
            COALESCE(s.buffer_after_minutes, 0)::int AS buffer_after_minutes
       FROM services s
       INNER JOIN professional_services ps
         ON ps.tenant_id = s.tenant_id AND ps.service_id = s.id AND ps.professional_id = $3
      WHERE s.tenant_id = $1 AND s.id = $2
      LIMIT 1`,
    [tenantId, serviceId, professionalId],
  );
  if (!r.rowCount)
    throw new AppError(
      'SERVICE_NOT_BOOKABLE',
      'Serviço inexistente ou não habilitado para este profissional.',
      404,
    );

  const row = r.rows[0] as BookableService;
  if (!row.active) {
    throw new AppError(
      'SERVICE_NOT_BOOKABLE',
      'Serviço inativo não pode ser agendado para este profissional.',
      422,
    );
  }

  return row;
}

/** Calcula `ends_at` a partir do início ISO e da duração do serviço (UTC instants). */
export function computeEndsAtIso(startsIso: string, durationMinutes: number): string {
  const startMs = Date.parse(startsIso);
  if (Number.isNaN(startMs)) {
    throw new AppError('INVALID_DATETIME', 'Data/hora de início inválida.', 400);
  }
  return new Date(startMs + durationMinutes * 60 * 1000).toISOString();
}

export function expandFootprintUtc(
  startsNominalIso: string,
  endsNominalIso: string,
  bufferBefore: number,
  bufferAfter: number,
): { footprintStartIso: string; footprintEndIso: string } {
  const sMs = Date.parse(startsNominalIso);
  const eMs = Date.parse(endsNominalIso);
  return {
    footprintStartIso: new Date(sMs - bufferBefore * 60 * 1000).toISOString(),
    footprintEndIso: new Date(eMs + bufferAfter * 60 * 1000).toISOString(),
  };
}

export function assertEndsMatchServiceDuration(params: {
  startsAtIso: string;
  endsAtIso: string;
  durationMinutes: number;
}): void {
  const start = Date.parse(params.startsAtIso);
  const end = Date.parse(params.endsAtIso);
  const expectedEnd = start + params.durationMinutes * 60 * 1000;
  if (Math.abs(end - expectedEnd) > 60_000 /* 1 min tolerance */)
    throw new AppError(
      'SCHEDULE_DURATION_MISMATCH',
      'Intervalo deve corresponder à duração cadastrada do serviço.',
      422,
    );
}

export function assertMatchingPrice(declaredPriceCents: number | undefined, catalogPriceCents: number): void {
  if (declaredPriceCents === undefined) return;
  if (declaredPriceCents !== catalogPriceCents) {
    throw new AppError(
      'SERVICE_PRICE_MISMATCH',
      'Valor informado não confere com o preço cadastrado do serviço.',
      422,
    );
  }
}
