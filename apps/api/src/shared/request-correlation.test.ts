import { describe, expect, it } from 'vitest';
import { effectiveCorrelationId, resolveCorrelationId } from './request-correlation.js';

describe('resolveCorrelationId', () => {
  it('prefers x-correlation-id header', () => {
    expect(
      resolveCorrelationId({ 'x-correlation-id': '  hdr-99  ' }, 'fallback-id'),
    ).toBe('hdr-99');
  });

  it('uses fallback when header absent', () => {
    expect(resolveCorrelationId({}, 'appt-uuid')).toBe('appt-uuid');
  });
});

describe('effectiveCorrelationId', () => {
  it('uses header when present', () => {
    expect(effectiveCorrelationId('hdr', 'entity')).toBe('hdr');
  });

  it('uses entity when header empty', () => {
    expect(effectiveCorrelationId(null, 'entity-id')).toBe('entity-id');
  });
});
