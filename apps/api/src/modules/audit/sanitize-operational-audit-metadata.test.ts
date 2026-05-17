import { describe, expect, it } from 'vitest';
import { sanitizeOperationalAuditMetadata } from './sanitize-operational-audit-metadata.js';

describe('sanitizeOperationalAuditMetadata', () => {
  it('redacts sensitive keys and bearer tokens in strings', () => {
    const out = sanitizeOperationalAuditMetadata({
      reason: 'ok',
      api_token: 'secret-value',
      note: 'Bearer abc.def.ghi failed',
    });
    expect(out?.api_token).toBe('[REDACTED]');
    expect(String(out?.note)).toContain('Bearer [REDACTED]');
    expect(out?.reason).toBe('ok');
  });

  it('truncates long string values', () => {
    const long = 'x'.repeat(600);
    const out = sanitizeOperationalAuditMetadata({ msg: long });
    expect(String(out?.msg).length).toBeLessThanOrEqual(500);
  });
});
