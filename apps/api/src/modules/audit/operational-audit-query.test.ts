import { describe, expect, it } from 'vitest';
import { normalizeOperationalAuditQuery, operationalAuditListQuery } from './operational-audit-query.js';

describe('normalizeOperationalAuditQuery', () => {
  it('maps date_from/date_to to from/to', () => {
    const raw = { date_from: '2026-01-01T00:00:00.000Z', date_to: '2026-01-02T00:00:00.000Z' };
    const n = normalizeOperationalAuditQuery(raw);
    expect(n.from).toBe('2026-01-01T00:00:00.000Z');
    expect(n.to).toBe('2026-01-02T00:00:00.000Z');
    expect(n.date_from).toBeUndefined();
    expect(operationalAuditListQuery.parse(n).from).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps from/to when already set', () => {
    const raw = { from: '2026-03-01T12:00:00.000Z', date_from: '2026-01-01T00:00:00.000Z' };
    const n = normalizeOperationalAuditQuery(raw);
    expect(n.from).toBe('2026-03-01T12:00:00.000Z');
  });
});
