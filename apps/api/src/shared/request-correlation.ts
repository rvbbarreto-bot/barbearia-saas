/** Lê `x-correlation-id` (n8n, portal, integrações) com fallback opcional. */
export function resolveCorrelationId(
  headers: Record<string, unknown>,
  fallback?: string | null,
): string | null {
  const raw = headers['x-correlation-id'];
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed.length > 0) return trimmed.slice(0, 120);
  }
  if (fallback != null) {
    const f = String(fallback).trim();
    if (f.length > 0) return f.slice(0, 120);
  }
  return null;
}

/** Correlation efectivo para auditoria/outbox: header ou entidade (ex.: appointment id). */
export function effectiveCorrelationId(
  headerOrCaller: string | null | undefined,
  entityId: string,
): string {
  const h = headerOrCaller?.trim();
  if (h && h.length > 0) return h.slice(0, 120);
  return entityId.slice(0, 120);
}
