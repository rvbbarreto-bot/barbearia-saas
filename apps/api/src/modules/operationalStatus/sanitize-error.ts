export type HealthState = 'ok' | 'degraded' | 'not_probed';

/** Classificação operacional de `last_error` da outbox (sem expor segredos). */
export type OutboxErrorClass =
  | 'auth_401'
  | 'not_found_404'
  | 'timeout'
  | 'fetch_failed'
  | 'duplicate'
  | 'provider_error'
  | 'invalid_payload'
  | 'other'
  | null;

export function sanitizeLastErrorForOperator(raw: string | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  let s = String(raw);
  s = s.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  s = s.replace(/apikey["']?\s*[:=]\s*["']?[^"'\s]+/gi, 'apikey=[REDACTED]');
  s = s.replace(/\bsk_[a-z0-9_]+\b/gi, 'sk_[REDACTED]');
  s = s.replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[JWT_REDACTED]');
  return s;
}

export function classifyOutboxError(lastError: string | null | undefined): OutboxErrorClass {
  if (!lastError) return null;
  const s = lastError.toLowerCase();
  if (s.includes('401') || s.includes('unauthorized') || s.includes('invalid_webhook_token')) {
    return 'auth_401';
  }
  if (s.includes('404') || s.includes('not found') || s.includes('instance')) {
    return 'not_found_404';
  }
  if (s.includes('timeout') || s.includes('etimedout') || s.includes('aborterror')) {
    return 'timeout';
  }
  if (s.includes('fetch failed') || s.includes('econnrefused') || s.includes('enotfound')) {
    return 'fetch_failed';
  }
  if (s.includes('duplicate') || s.includes('idempotency') || s.includes('already exists')) {
    return 'duplicate';
  }
  if (s.includes('provider') || s.includes('evolution') || s.includes('whatsapp')) {
    return 'provider_error';
  }
  if (s.includes('validation') || s.includes('invalid') || s.includes('payload')) {
    return 'invalid_payload';
  }
  return 'other';
}

export function sanitizeInfraError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return sanitizeLastErrorForOperator(msg) ?? 'erro desconhecido';
}
