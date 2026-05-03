import { describe, expect, it, vi } from 'vitest';
import { getAvailability } from './service.js';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('../../infra/db/pool.js', () => ({
  withTenant: vi.fn(async (_tenantId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) => {
    return fn({ query: queryMock });
  }),
}));

describe('availability service with timezone and time off', () => {
  it('supports multiple windows and recurring exceptions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T08:30:00.000Z'));
    queryMock.mockReset();
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ timezone: 'America/Sao_Paulo' }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'svc',
            duration_minutes: 30,
            buffer_before_minutes: 0,
            buffer_after_minutes: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          { starts_at: '09:00:00', ends_at: '10:00:00', slot_interval_minutes: 30 },
          { starts_at: '14:00:00', ends_at: '15:00:00', slot_interval_minutes: 30 },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ start_of_day_utc: '2026-05-01T03:00:00.000Z', end_of_day_utc: '2026-05-02T03:00:00.000Z' }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            starts_at: '2026-05-01T12:30:00.000Z',
            ends_at: '2026-05-01T13:00:00.000Z',
            buffer_before_minutes: 0,
            buffer_after_minutes: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ starts_at: '2026-05-01T17:30:00.000Z', ends_at: '2026-05-01T18:00:00.000Z' }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ starts_at_utc: '2026-05-01T17:00:00.000Z', ends_at_utc: '2026-05-01T18:00:00.000Z' }],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ window_start_utc: '2026-05-01T12:00:00.000Z', window_end_utc: '2026-05-01T13:00:00.000Z' }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ window_start_utc: '2026-05-01T17:00:00.000Z', window_end_utc: '2026-05-01T18:00:00.000Z' }],
      });

    const result = await getAvailability('tenant-1', {
      professional_id: '11111111-1111-4111-8111-111111111113',
      service_id: '11111111-1111-4111-8111-111111111114',
      date: '2026-05-01',
    });

    try {
      expect(result.timezone).toBe('America/Sao_Paulo');
      expect(result.slots.map((s) => s.starts_at)).toEqual([
        '2026-05-01T12:00:00.000Z',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
