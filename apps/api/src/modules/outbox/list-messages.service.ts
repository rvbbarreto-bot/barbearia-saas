import { withTenant } from '../../infra/db/pool.js';
import { AppError } from '../../shared/errors.js';
import { parsePagination } from '../../shared/pagination.js';

const OUTBOX_STATUSES = new Set(['pending', 'processing', 'sent', 'failed', 'dead']);

export type OutboxMessageListQuery = Record<string, unknown>;

export type OutboxMessageListItem = {
  id: string;
  tenant_id: string;
  channel: string;
  provider: string | null;
  status: string;
  destination: string | null;
  payload_summary: { type: string | null; preview: string | null };
  last_error: string | null;
  attempts: number;
  max_attempts: number;
  correlation_id: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
};

function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `****${digits.slice(-4)}`;
}

function summarizePayload(payload: unknown): { type: string | null; preview: string | null } {
  if (!payload || typeof payload !== 'object') return { type: null, preview: null };
  const p = payload as { type?: string; text?: string };
  const type = typeof p.type === 'string' ? p.type : null;
  const text = typeof p.text === 'string' ? p.text.trim() : '';
  if (!text) return { type, preview: null };
  const max = 120;
  const preview = text.length > max ? `${text.slice(0, max)}…` : text;
  return { type, preview };
}

function mapRow(row: {
  id: string;
  tenant_id: string;
  channel: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  correlation_id: string | null;
  customer_id: string | null;
  created_at: Date;
  updated_at: Date;
  sent_at: Date | null;
  payload: unknown;
  metadata: unknown;
}): OutboxMessageListItem {
  const meta = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {};
  const phone = typeof meta.phone === 'string' ? meta.phone : null;
  const provider = typeof meta.provider === 'string' ? meta.provider : null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    channel: row.channel,
    provider,
    status: row.status,
    destination: phone ? maskPhone(phone) : null,
    payload_summary: summarizePayload(row.payload),
    last_error: row.last_error,
    attempts: row.attempts,
    max_attempts: row.max_attempts,
    correlation_id: row.correlation_id,
    customer_id: row.customer_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    sent_at: row.sent_at ? row.sent_at.toISOString() : null,
  };
}

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

  const status = rawQuery.status !== undefined && rawQuery.status !== null && rawQuery.status !== ''
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

    const where = filters.join(' AND ');

    const countSql = `SELECT COUNT(*)::int AS total FROM message_outbox mo WHERE ${where}`;
    const listSql = `
      SELECT mo.id, mo.tenant_id, mo.channel, mo.status, mo.attempts, mo.max_attempts, mo.last_error,
             mo.correlation_id, mo.customer_id, mo.created_at, mo.updated_at, mo.sent_at,
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
    const data = dataR.rows.map((r) =>
      mapRow(
        r as {
          id: string;
          tenant_id: string;
          channel: string;
          status: string;
          attempts: number;
          max_attempts: number;
          last_error: string | null;
          correlation_id: string | null;
          customer_id: string | null;
          created_at: Date;
          updated_at: Date;
          sent_at: Date | null;
          payload: unknown;
          metadata: unknown;
        },
      ),
    );

    return { data, total, page, limit };
  });
}
