/** UUID v4 — usado para derivar `appointment_id` a partir de `correlation_id` quando aplicável. */
const APPOINTMENT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function appointmentIdFromCorrelation(correlationId: string | null | undefined): string | null {
  if (!correlationId) return null;
  const s = correlationId.trim();
  return APPOINTMENT_UUID_RE.test(s) ? s.toLowerCase() : null;
}

export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `****${digits.slice(-4)}`;
}

export function summarizePayload(payload: unknown): { type: string | null; preview: string | null } {
  if (!payload || typeof payload !== 'object') return { type: null, preview: null };
  const p = payload as { type?: string; text?: string };
  const type = typeof p.type === 'string' ? p.type : null;
  const text = typeof p.text === 'string' ? p.text.trim() : '';
  if (!text) return { type, preview: null };
  const max = 120;
  const preview = text.length > max ? `${text.slice(0, max)}…` : text;
  return { type, preview };
}

export type OutboxMessageRowDb = {
  id: string;
  tenant_id: string;
  channel: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  correlation_id: string | null;
  customer_id: string | null;
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
  sent_at: Date | null;
  payload: unknown;
  metadata: unknown;
};

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
  appointment_id: string | null;
  idempotency_key: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
};

export function mapOutboxRow(row: OutboxMessageRowDb): OutboxMessageListItem {
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
    appointment_id: appointmentIdFromCorrelation(row.correlation_id),
    idempotency_key: row.idempotency_key,
    customer_id: row.customer_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    sent_at: row.sent_at ? row.sent_at.toISOString() : null,
  };
}
