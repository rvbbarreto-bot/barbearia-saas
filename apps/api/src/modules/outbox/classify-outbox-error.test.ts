import { describe, expect, it } from 'vitest';
import { classifyOutboxError, sanitizeLastErrorForOperator } from './classify-outbox-error.js';

describe('classifyOutboxError', () => {
  it('classifies auth, not_found, timeout, network, duplicate, provider', () => {
    expect(classifyOutboxError('HTTP 401 Unauthorized')).toBe('auth');
    expect(classifyOutboxError('404 instance not found')).toBe('not_found');
    expect(classifyOutboxError('ETIMEDOUT')).toBe('timeout');
    expect(classifyOutboxError('TypeError: fetch failed')).toBe('network');
    expect(classifyOutboxError('duplicate idempotency key')).toBe('duplicate');
    expect(classifyOutboxError('Evolution provider rejected')).toBe('provider');
  });

  it('returns null for empty', () => {
    expect(classifyOutboxError(null)).toBeNull();
    expect(classifyOutboxError('')).toBeNull();
  });
});

describe('sanitizeLastErrorForOperator', () => {
  it('redacts tokens', () => {
    const out = sanitizeLastErrorForOperator('Bearer abc.def.ghi apikey=secret')!;
    expect(out).not.toContain('secret');
    expect(out).toContain('[REDACTED]');
  });
});
