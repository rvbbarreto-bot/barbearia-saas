import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveAppointmentProfessionalFilter } from './appointment-list-scope.js';

const mockQuery = vi.fn();

vi.mock('../../infra/db/pool.js', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

describe('resolveAppointmentProfessionalFilter', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  const tenantId = '11111111-1111-4111-8111-111111111111';
  const profA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('returns JWT professional_id after validating tenant ownership', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ '?column?': 1 }] });

    const pid = await resolveAppointmentProfessionalFilter(tenantId, {
      sub: 'user-1',
      role: 'professional',
      professional_id: profA,
    });

    expect(pid).toBe(profA);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(String(mockQuery.mock.calls[0][0])).toContain('FROM professionals');
    expect(mockQuery.mock.calls[0][1]).toEqual([profA, tenantId]);
  });

  it('loads professional_id from users when JWT omits it', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ professional_id: profA }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] });

    const pid = await resolveAppointmentProfessionalFilter(tenantId, {
      sub: 'user-1',
      role: 'professional',
      professional_id: null,
    });

    expect(pid).toBe(profA);
    expect(String(mockQuery.mock.calls[0][0])).toContain('FROM users');
    expect(String(mockQuery.mock.calls[1][0])).toContain('FROM professionals');
  });

  it('throws PROFESSIONAL_NOT_LINKED when users row has no professional_id', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ professional_id: null }] })
      .mockResolvedValueOnce({ rowCount: 1 });

    await expect(
      resolveAppointmentProfessionalFilter(tenantId, {
        sub: 'user-1',
        role: 'professional',
        professional_id: null,
      }),
    ).rejects.toMatchObject({ code: 'PROFESSIONAL_NOT_LINKED' });
  });

  it('throws FORBIDDEN when professional id not in tenant', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rowCount: 1 });

    await expect(
      resolveAppointmentProfessionalFilter(tenantId, {
        sub: 'user-1',
        role: 'professional',
        professional_id: profA,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });
});
