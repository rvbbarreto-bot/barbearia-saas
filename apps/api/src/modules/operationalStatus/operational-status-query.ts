import { AppError } from '../../shared/errors.js';

const OUTBOX_STATUSES = new Set(['pending', 'processing', 'sent', 'failed', 'dead']);

export type OperationalStatusQuery = {
  status?: string;
  from?: string;
  to?: string;
  correlation_id?: string;
};

function optIsoTimestamptz(label: string, raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  const t = Date.parse(s);
  if (Number.isNaN(t)) {
    throw new AppError('VALIDATION_ERROR', `${label} inválido (use ISO-8601).`, 400);
  }
  return new Date(t).toISOString();
}

export function parseOperationalStatusQuery(raw: Record<string, unknown>): OperationalStatusQuery {
  const status =
    raw.status !== undefined && raw.status !== null && raw.status !== ''
      ? String(raw.status).trim()
      : undefined;
  if (status && !OUTBOX_STATUSES.has(status)) {
    throw new AppError('VALIDATION_ERROR', 'status inválido para outbox.', 400);
  }

  const correlation_id =
    raw.correlation_id !== undefined && raw.correlation_id !== null && raw.correlation_id !== ''
      ? String(raw.correlation_id).trim()
      : undefined;

  return {
    status,
    from: optIsoTimestamptz('from', raw.from),
    to: optIsoTimestamptz('to', raw.to),
    correlation_id,
  };
}
