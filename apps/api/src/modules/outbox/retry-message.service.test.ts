import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('../../infra/db/pool.js', () => ({
  withTenant: vi.fn(),
}));

vi.mock('../../shared/operational-audit.js', () => ({
  writeOperationalAuditEvent: vi.fn(),
  effectiveCorrelationId: (header: string | null | undefined, fallback: string) =>
    header?.trim() ? header.trim() : fallback,
}));

import * as pool from '../../infra/db/pool.js';
import { retryOutboxMessage } from './retry-message.service.js';

describe('retryOutboxMessage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when status is not failed/dead', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'pending' }] });
    vi.mocked(pool.withTenant).mockImplementation(async (_tenantId, fn) => fn({ query } as never));
    await expect(retryOutboxMessage('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000099', {})).rejects.toMatchObject({
      code: 'OUTBOX_RETRY_NOT_ALLOWED',
    });
  });

  it('re-enqueues failed message', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ status: 'failed' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ correlation_id: 'corr-x' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    vi.mocked(pool.withTenant).mockImplementation(async (_tenantId, fn) => fn({ query } as never));
    const r = await retryOutboxMessage('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000099', {
      actorUserId: 'u1',
      actorRole: 'manager',
      requestId: 'r1',
    });
    expect(r).toEqual({ id: '00000000-0000-0000-0000-000000000099', status: 'pending' });
    expect(query).toHaveBeenCalled();
  });
});
