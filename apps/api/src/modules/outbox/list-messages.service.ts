import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/pagination.js';
import { isValidOutboxErrorClassFilter, sqlConditionForErrorClass } from './classify-outbox-error.js';
import { mapOutboxRow, type OutboxMessageRowDb } from './outbox-row-mapper.js';

const OUTBOX_STATUSES = new Set(['pending', 'processing', 'sent', 'failed', 'dead']);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OutboxMessageListQuery = Record<string, unknown>;

export type { OutboxMessageListItem } from './outbox-row-mapper.js';

function optIsoTimestamptz(label: string, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) {
    throw new AppError('VALIDATION_ERROR', `${label} inválido (use ISO-8601).`, 400);
  }
  return new Date(t).toISOString();
}

/**
 * Lista `message_outbox` do tenant com filtros operacionais.
 * Não expõe `metadata`/`payload` completos nem `provider_response`.
 */
export async function listOutboxMessages(tenantId: string, rawQuery: OutboxMessageListQuery) {
  const { limit, offset, page } = parsePagination(rawQuery);

  const status =
    rawQuery.status !== undefined && rawQuery.status !== null && rawQuery.status !== ''
      ? String(rawQuery.status).trim()
      : '';
  if (status && !OUTBOX_STATUSES.has(status)) {
    throw new AppError('VALIDATION_ERROR', 'status inválido para outbox.', 400);
  }

  const provider =
    rawQuery.provider !== undefined && rawQuery.provider !== null && rawQuery.provider !== ''
      ? String(rawQuery.provider).trim()
      : '';

  const from = optIsoTimestamptz('from', rawQuery.from);
  const to = optIsoTimestamptz('to', rawQuery.to);

  const correlationId =
    rawQuery.correlation_id !== undefined && rawQuery.correlation_id !== null && rawQuery.correlation_id !== ''
      ? String(rawQuery.correlation_id).trim()
      : '';

  const appointmentId =
    rawQuery.appointment_id !== undefined && rawQuery.appointment_id !== null && rawQuery.appointment_id !== ''
      ? String(rawQuery.appointment_id).trim()
      : '';

  const destination =
    rawQuery.destination !== undefined && rawQuery.destination !== null && rawQuery.destination !== ''
      ? String(rawQuery.destination).trim()
      : '';

  const customerId =
    rawQuery.customer_id !== undefined && rawQuery.customer_id !== null && rawQuery.customer_id !== ''
      ? String(rawQuery.customer_id).trim()
      : '';
  if (customerId && !UUID_RE.test(customerId)) {
    throw new AppError('VALIDATION_ERROR', 'customer_id inválido (UUID esperado).', 400);
  }

  const errorClassRaw =
    rawQuery.error_class !== undefined && rawQuery.error_class !== null && rawQuery.error_class !== ''
      ? String(rawQuery.error_class).trim()
      : '';
  if (errorClassRaw && !isValidOutboxErrorClassFilter(errorClassRaw)) {
    throw new AppError('VALIDATION_ERROR', 'error_class inválido para outbox.', 400);
  }

  const correlationFilter = correlationId || appointmentId;

  return withTenant(tenantId, async (client) => {
    const filters: string[] = ['mo.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (status) {
      filters.push(`mo.status = $${idx++}`);
      params.push(status);
    }
    if (provider) {
      filters.push(`coalesce(mo.metadata->>'provider','') = $${idx++}`);
      params.push(provider);
    }
    if (from) {
      filters.push(`mo.created_at >= $${idx++}::timestamptz`);
      params.push(from);
    }
    if (to) {
      filters.push(`mo.created_at <= $${idx++}::timestamptz`);
      params.push(to);
    }
    if (correlationFilter) {
      filters.push(`mo.correlation_id = $${idx++}`);
      params.push(correlationFilter);
    }
    if (destination) {
      const safe = String(destination).replace(/[%_\\]/g, '');
      if (safe) {
        filters.push(`mo.metadata->>'phone' ILIKE $${idx++}`);
        params.push(`%${safe}%`);
      }
    }
    if (customerId) {
      filters.push(`mo.customer_id = $${idx++}::uuid`);
      params.push(customerId);
    }
    if (errorClassRaw) {
      filters.push(`(${sqlConditionForErrorClass(errorClassRaw)})`);
    }

    const where = filters.join(' AND ');

    const countSql = `SELECT COUNT(*)::int AS total FROM message_outbox mo WHERE ${where}`;
    const listSql = `
      SELECT mo.id, mo.tenant_id, mo.channel, mo.status, mo.attempts, mo.max_attempts, mo.last_error,
             mo.correlation_id, mo.customer_id, mo.idempotency_key, mo.created_at, mo.updated_at, mo.sent_at,
             mo.payload, mo.metadata
        FROM message_outbox mo
       WHERE ${where}
       ORDER BY mo.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`;

    params.push(limit, offset);

    const [countR, dataR] = await Promise.all([
      client.query<{ total: number }>(countSql, params.slice(0, params.length - 2)),
      client.query(listSql, params),
    ]);

    const total = countR.rows[0]?.total ?? 0;
    const data = dataR.rows.map((r) => mapOutboxRow(r as OutboxMessageRowDb));

    return { data, total, page, limit };
  });
}
