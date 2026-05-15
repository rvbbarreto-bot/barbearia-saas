import { describe, expect, it } from 'vitest';
import { formatOutboxLastError } from './outboxErrorMessage';

describe('formatOutboxLastError', () => {
  it('maps fetch failed to friendly operator message', () => {
    const r = formatOutboxLastError('TypeError: fetch failed');
    expect(r.friendly).toContain('Provedor WhatsApp');
    expect(r.technical).toBe('TypeError: fetch failed');
  });

  it('returns dash for empty', () => {
    expect(formatOutboxLastError(null).friendly).toBe('—');
  });
});
