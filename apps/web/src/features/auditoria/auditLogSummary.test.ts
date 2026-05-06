import { describe, expect, it } from 'vitest';
import { summarizeAuditLogRow } from './auditLogSummary';

describe('summarizeAuditLogRow', () => {
  it('combina ação, entidade e after', () => {
    expect(
      summarizeAuditLogRow({
        action: 'UPDATE',
        entity: 'customer',
        before: null,
        after: { name: 'João' },
      }),
    ).toContain('UPDATE');
    expect(
      summarizeAuditLogRow({
        action: 'UPDATE',
        entity: 'customer',
        before: null,
        after: { name: 'João' },
      }),
    ).toContain('customer');
  });

  it('trunca payloads longos', () => {
    const long = 'x'.repeat(200);
    const s = summarizeAuditLogRow({
      action: 'X',
      entity: 'y',
      before: null,
      after: long,
    });
    expect(s.length).toBeLessThanOrEqual(140);
    expect(s.endsWith('…')).toBe(true);
  });
});
