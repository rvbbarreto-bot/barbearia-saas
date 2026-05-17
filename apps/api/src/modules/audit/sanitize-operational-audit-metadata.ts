import { sanitizeLastErrorForOperator } from '../outbox/classify-outbox-error.js';

const SENSITIVE_KEY = /password|secret|token|authorization|apikey|bearer|credential/i;

function sanitizeString(value: string): string {
  const redacted = sanitizeLastErrorForOperator(value) ?? value;
  return redacted.length > 500 ? `${redacted.slice(0, 497)}…` : redacted;
}

/** Metadata de `operational_audit_events` sem segredos para listagem HTTP. */
export function sanitizeOperationalAuditMetadata(meta: unknown): Record<string, unknown> | null {
  if (meta == null) return null;
  if (typeof meta !== 'object' || Array.isArray(meta)) {
    return { _sanitized: true, preview: '[non-object]' };
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    if (value == null) {
      out[key] = value;
    } else if (typeof value === 'string') {
      out[key] = sanitizeString(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 20).map((item) =>
        typeof item === 'string' ? sanitizeString(item) : typeof item === 'object' ? sanitizeOperationalAuditMetadata(item) : item,
      );
    } else if (typeof value === 'object') {
      out[key] = sanitizeOperationalAuditMetadata(value);
    } else {
      out[key] = String(value);
    }
  }
  return out;
}
