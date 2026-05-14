import { describe, expect, it } from 'vitest';
import { countNoShowsInResponse } from './countNoShowsInResponse';

describe('countNoShowsInResponse', () => {
  it('returns 0 when payload is undefined', () => {
    expect(countNoShowsInResponse(undefined)).toBe(0);
  });

  it('returns 0 when data is not an array', () => {
    expect(countNoShowsInResponse({ data: null as unknown as never, total: 0, page: 1, limit: 20 })).toBe(0);
  });

  it('counts no_show rows', () => {
    expect(
      countNoShowsInResponse({
        data: [
          { id: '1', status: 'confirmed' },
          { id: '2', status: 'no_show' },
          { id: '3', status: 'no_show' },
        ] as never,
        total: 3,
        page: 1,
        limit: 20,
      }),
    ).toBe(2);
  });
});
