import { describe, expect, it } from 'vitest';
import { summarizeOperationalAuditMetadata } from './operationalAuditSummary';

describe('summarizeOperationalAuditMetadata', () => {
  it('returns dash for empty metadata', () => {
    expect(summarizeOperationalAuditMetadata(null)).toBe('—');
  });

  it('clips long JSON', () => {
    const long = summarizeOperationalAuditMetadata({ x: 'y'.repeat(200) });
    expect(long.length).toBeLessThanOrEqual(140);
  });
});
