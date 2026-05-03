import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateRefreshSession,
  isRefreshSessionActive,
  isSessionRevoked,
  revokeRefreshChain,
  revokeSession,
  rotateRefreshSession,
} from './session.js';

const { redisMock } = vi.hoisted(() => ({
  redisMock: {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('../../infra/redis/client.js', () => ({
  redis: redisMock,
}));

describe('session revocation', () => {
  beforeEach(() => {
    redisMock.set.mockReset();
    redisMock.get.mockReset();
    redisMock.del.mockReset();
  });

  it('stores revoked token in redis with ttl', async () => {
    await revokeSession('token-jti', Math.floor(Date.now() / 1000) + 60);
    expect(redisMock.set).toHaveBeenCalled();
  });

  it('returns true when token is revoked', async () => {
    redisMock.get.mockResolvedValueOnce('1');
    await expect(isSessionRevoked('token-jti')).resolves.toBe(true);
  });

  it('activates refresh session and checks active status', async () => {
    await activateRefreshSession('refresh-jti', Math.floor(Date.now() / 1000) + 60);
    redisMock.get.mockResolvedValueOnce('1');
    await expect(isRefreshSessionActive('refresh-jti')).resolves.toBe(true);
  });

  it('rotates refresh token chain', async () => {
    redisMock.get.mockResolvedValueOnce('1');
    await rotateRefreshSession({
      previousJti: 'old-jti',
      nextJti: 'new-jti',
      previousExp: Math.floor(Date.now() / 1000) + 120,
      nextExp: Math.floor(Date.now() / 1000) + 240,
    });
    expect(redisMock.del).toHaveBeenCalledWith('refresh:active:old-jti');
  });

  it('revokes child chain when reuse is detected', async () => {
    redisMock.get
      .mockResolvedValueOnce('0')
      .mockResolvedValueOnce('child-1')
      .mockResolvedValueOnce(null);

    await expect(
      rotateRefreshSession({
        previousJti: 'reused-jti',
        nextJti: 'new-jti',
      }),
    ).rejects.toThrow('REFRESH_TOKEN_REUSED');
  });

  it('revokes refresh descendants recursively', async () => {
    redisMock.get
      .mockResolvedValueOnce('child-a')
      .mockResolvedValueOnce('child-b')
      .mockResolvedValueOnce(null);
    await revokeRefreshChain('root');
    expect(redisMock.del).toHaveBeenCalledWith('refresh:active:root');
    expect(redisMock.del).toHaveBeenCalledWith('refresh:active:child-a');
    expect(redisMock.del).toHaveBeenCalledWith('refresh:active:child-b');
  });
});
