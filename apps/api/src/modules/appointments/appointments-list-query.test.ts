import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../../infra/db/pool.js', () => ({
  withTenant: async (_tenantId: string, fn: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    fn({ query: mockQuery }),
}));

vi.mock('../../infra/redis/client.js', () => ({
  redis: { set: vi.fn(), eval: vi.fn(), get: vi.fn() },
}));

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgres://test',
    JWT_SECRET: 'test-secret-min-32-chars-long-enough',
    REDIS_URL: 'redis://localhost:6379',
    NODE_ENV: 'test',
    API_PORT: 3333,
  },
}));

import { getAppointmentById, listAppointments } from './service.js';

describe('appointments list/detail SQL (schema alignment)', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('listAppointments does not reference customers.notes (column absent in schema)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'a1', customer_notes: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 });

    await listAppointments(tenantId, { page: '1', limit: '20' });

    const listSql = String(mockQuery.mock.calls[0][0]);
    expect(listSql).not.toMatch(/\bc\.notes\b/);
    expect(listSql).toContain('NULL::text AS customer_notes');
  });

  it('getAppointmentById does not reference customers.notes', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'a1', customer_notes: null }],
      rowCount: 1,
    });

    await getAppointmentById(tenantId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    const detailSql = String(mockQuery.mock.calls[0][0]);
    expect(detailSql).not.toMatch(/\bc\.notes\b/);
    expect(detailSql).toContain('NULL::text AS customer_notes');
  });
});
