/** Classificação operacional de `last_error` (sem expor segredos). */
export type OutboxErrorClass =
  | 'auth'
  | 'network'
  | 'timeout'
  | 'provider'
  | 'duplicate'
  | 'not_found'
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
    return 'auth';
  }
  if (s.includes('404') || s.includes('not found')) {
    return 'not_found';
  }
  if (s.includes('timeout') || s.includes('etimedout') || s.includes('aborterror')) {
    return 'timeout';
  }
  if (
    s.includes('fetch failed') ||
    s.includes('econnrefused') ||
    s.includes('enotfound') ||
    s.includes('network')
  ) {
    return 'network';
  }
  if (s.includes('duplicate') || s.includes('idempotency') || s.includes('already exists')) {
    return 'duplicate';
  }
  if (s.includes('provider') || s.includes('evolution') || s.includes('whatsapp')) {
    return 'provider';
  }
  return 'other';
}

const ERROR_CLASS_VALUES = new Set([
  'auth',
  'network',
  'timeout',
  'provider',
  'duplicate',
  'not_found',
  'other',
]);

export function isValidOutboxErrorClassFilter(value: string): value is NonNullable<OutboxErrorClass> {
  return ERROR_CLASS_VALUES.has(value);
}

/**
 * Condição SQL em `mo.last_error` alinhada a {@link classifyOutboxError} (somente para filtros).
 */
export function sqlConditionForErrorClass(errorClass: NonNullable<OutboxErrorClass>): string {
  const le = "coalesce(mo.last_error,'')";
  const il = (frag: string) => `${le} ILIKE '%${frag}%'`;
  switch (errorClass) {
    case 'auth':
      return `(${il('401')} OR ${il('unauthorized')} OR ${il('invalid_webhook_token')})`;
    case 'not_found':
      return `(${il('404')} OR ${il('not found')})`;
    case 'timeout':
      return `(${il('timeout')} OR ${il('etimedout')} OR ${il('aborterror')})`;
    case 'network':
      return `(${il('fetch failed')} OR ${il('econnrefused')} OR ${il('enotfound')} OR ${il('network')})`;
    case 'duplicate':
      return `(${il('duplicate')} OR ${il('idempotency')} OR ${il('already exists')})`;
    case 'provider':
      return `(${il('provider')} OR ${il('evolution')} OR ${il('whatsapp')})`;
    case 'other': {
      const known = (['auth', 'not_found', 'timeout', 'network', 'duplicate', 'provider'] as const)
        .filter((c) => c !== 'other')
        .map((c) => `NOT (${sqlConditionForErrorClass(c)})`)
        .join(' AND ');
      return `(mo.last_error IS NOT NULL AND mo.last_error <> '' AND ${known})`;
    }
    default:
      return 'TRUE';
  }
}
