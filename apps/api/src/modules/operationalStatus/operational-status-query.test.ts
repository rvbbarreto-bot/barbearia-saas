import { describe, expect, it } from 'vitest';
import { parseOperationalStatusQuery } from './operational-status-query.js';

describe('parseOperationalStatusQuery', () => {
  it('accepts status and correlation_id', () => {
    const q = parseOperationalStatusQuery({
      status: 'failed',
      correlation_id: 'abc-123',
      from: '2026-01-01T00:00:00.000Z',
    });
    expect(q.status).toBe('failed');
    expect(q.correlation_id).toBe('abc-123');
    expect(q.from).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects invalid status', () => {
    expect(() => parseOperationalStatusQuery({ status: 'bogus' })).toThrow(/status inválido/);
  });

  it('rejects invalid from', () => {
    expect(() => parseOperationalStatusQuery({ from: 'not-a-date' })).toThrow(/from inválido/);
  });
});
