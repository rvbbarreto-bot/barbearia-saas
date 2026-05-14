import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTenant, getTenantById, listTenants, updateTenant } from './service.js';

vi.mock('../../infra/db/pool.js', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../../infra/db/pool.js';

describe('tenants service', () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it('listTenants returns data and total', async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ id: 't1' }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [{ total: 5 }], rowCount: 1 } as never);

    const r = await listTenants({ page: '1', limit: '10' });

    expect(r.data).toHaveLength(1);
    expect(r.total).toBe(5);
    expect(r.page).toBe(1);
  });

  it('getTenantById returns row', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 'tid', legal_name: 'L', trade_name: 'T' }],
      rowCount: 1,
    } as never);

    const row = await getTenantById('00000000-0000-0000-0000-000000000001');
    expect(row.id).toBe('tid');
  });

  it('getTenantById throws when not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await expect(getTenantById('00000000-0000-0000-0000-000000000099')).rejects.toEqual(
      expect.objectContaining({ code: 'TENANT_NOT_FOUND' }),
    );
  });

  it('createTenant inserts and returns row', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          id: 'new-id',
          legal_name: 'ACME',
          trade_name: 'ACME Shop',
          slug: null,
          plan_code: 'trial',
          status: 'trial',
          timezone: 'America/Sao_Paulo',
          created_at: new Date().toISOString(),
        },
      ],
      rowCount: 1,
    } as never);

    const row = await createTenant({
      legal_name: 'ACME',
      trade_name: 'ACME Shop',
      plan_code: 'trial',
      timezone: 'America/Sao_Paulo',
    });
    expect(row.id).toBe('new-id');
  });

  it('createTenant rejects invalid payload (zod)', async () => {
    await expect(
      createTenant({
        legal_name: 'x',
        trade_name: 'Valid Trade Name Here',
        plan_code: 'trial',
        timezone: 'America/Sao_Paulo',
      }),
    ).rejects.toBeTruthy();
  });

  it('updateTenant applies partial fields', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ id: 'tid', trade_name: 'Novo Nome' }],
      rowCount: 1,
    } as never);

    const row = await updateTenant('00000000-0000-0000-0000-000000000001', {
      trade_name: 'Novo Nome',
    });
    expect(row.trade_name).toBe('Novo Nome');
  });

  it('updateTenant throws NO_CHANGES when body empty', async () => {
    await expect(updateTenant('00000000-0000-0000-0000-000000000001', {})).rejects.toEqual(
      expect.objectContaining({ code: 'NO_CHANGES' }),
    );
  });

  it('updateTenant throws when tenant missing', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    await expect(
      updateTenant('00000000-0000-0000-0000-000000000099', { trade_name: 'XX' }),
    ).rejects.toEqual(expect.objectContaining({ code: 'TENANT_NOT_FOUND' }));
  });
});
