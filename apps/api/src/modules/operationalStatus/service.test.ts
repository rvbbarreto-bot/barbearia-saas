import { describe, expect, it, vi, afterEach } from 'vitest';

const poolProbe = vi.hoisted(() => ({
  query: vi.fn(),
}));

const redisProbe = vi.hoisted(() => ({
  ping: vi.fn(),
}));

vi.mock('../../infra/db/pool.js', () => ({
  withTenant: vi.fn(),
  pool: poolProbe,
}));

vi.mock('../../infra/redis/client.js', () => ({
  redis: redisProbe,
}));

vi.mock('./probe-external.js', () => ({
  probeN8n: vi.fn().mockResolvedValue({ state: 'not_probed', error: null }),
  probeEvolution: vi.fn().mockResolvedValue({ state: 'not_probed', error: null }),
}));

import * as pool from '../../infra/db/pool.js';
import { emptyOutboxCounts, getOperationalStatus, probeInfrastructure } from './service.js';

describe('emptyOutboxCounts', () => {
  it('initializes all known statuses to zero', () => {
    expect(emptyOutboxCounts()).toEqual({
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      dead: 0,
    });
  });
});

describe('probeInfrastructure', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports ok when db and redis respond', async () => {
    poolProbe.query.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    redisProbe.ping.mockResolvedValueOnce('PONG');
    const infra = await probeInfrastructure();
    expect(infra.database).toBe('ok');
    expect(infra.redis).toBe('ok');
    expect(infra.api).toBe('ok');
    expect(infra.errors.database).toBeNull();
  });

  it('reports degraded when redis fails without leaking secrets', async () => {
    poolProbe.query.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    redisProbe.ping.mockRejectedValueOnce(new Error('NOAUTH invalid password sk_live_abc'));
    const infra = await probeInfrastructure();
    expect(infra.redis).toBe('degraded');
    expect(infra.errors.redis).not.toContain('sk_live_abc');
  });
});

describe('getOperationalStatus', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates tenant outbox counts via withTenant', async () => {
    poolProbe.query.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    redisProbe.ping.mockResolvedValueOnce('PONG');

    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { status: 'pending', count: 2 },
          { status: 'failed', count: 1 },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    vi.mocked(pool.withTenant).mockImplementation(async (_tenantId, fn) => fn({ query } as never));

    const status = await getOperationalStatus('00000000-0000-0000-0000-000000000001');
    expect(status.outbox.counts.pending).toBe(2);
    expect(status.outbox.counts.failed).toBe(1);
    expect(status.outbox.counts.sent).toBe(0);
    expect(status.infrastructure.api).toBe('ok');
  });
});
