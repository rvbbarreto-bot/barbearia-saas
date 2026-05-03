import { describe, expect, it } from 'vitest';
import { computeReminderH2RunAt } from './schedule.js';

describe('schedule helpers', () => {
  it('H-2 run_at is two hours before start', () => {
    const start = '2026-06-15T14:00:00.000Z';
    const h2 = computeReminderH2RunAt(start);
    expect(h2.toISOString()).toBe('2026-06-15T12:00:00.000Z');
  });
});
