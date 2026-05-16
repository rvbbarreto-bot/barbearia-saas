import { describe, expect, it } from 'vitest';
import { classifyOutboxError, sanitizeLastErrorForOperator } from './sanitize-error.js';

describe('sanitizeLastErrorForOperator', () => {
  it('redacts bearer tokens and api keys', () => {
    const raw = 'HTTP 401 Bearer eyJhbGciOiJIUzI1NiJ9.x.y apikey=supersecret123';
    const out = sanitizeLastErrorForOperator(raw)!;
    expect(out).not.toContain('supersecret');
    expect(out).not.toContain('eyJhbGci');
    expect(out).toContain('[REDACTED]');
  });

  it('returns null for empty', () => {
    expect(sanitizeLastErrorForOperator(null)).toBeNull();
    expect(sanitizeLastErrorForOperator('')).toBeNull();
  });
});

describe('classifyOutboxError', () => {
  it('classifies timeout and fetch failed', () => {
    expect(classifyOutboxError('ETIMEDOUT after 30s')).toBe('timeout');
    expect(classifyOutboxError('TypeError: fetch failed')).toBe('fetch_failed');
  });

  it('classifies 401 and 404', () => {
    expect(classifyOutboxError('HTTP 401 Unauthorized')).toBe('auth_401');
    expect(classifyOutboxError('404 instance not found')).toBe('not_found_404');
  });

  it('classifies duplicate and provider_error', () => {
    expect(classifyOutboxError('duplicate idempotency key')).toBe('duplicate');
    expect(classifyOutboxError('Evolution provider rejected message')).toBe('provider_error');
  });
});
