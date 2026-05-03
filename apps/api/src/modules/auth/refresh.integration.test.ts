import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

const { loginMock, writeAuthAuditMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  writeAuthAuditMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./service.js', () => ({
  login: loginMock,
}));

vi.mock('./audit.js', () => ({
  writeAuthAudit: writeAuthAuditMock,
}));

vi.mock('../../infra/redis/client.js', () => ({
  redis: {
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      const existed = store.delete(key);
      return existed ? 1 : 0;
    }),
  },
}));

describe('refresh rotation and chain revocation', () => {
  const app = Fastify();

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? '12345678901234567890123456789012';
    process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
    process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';

    await app.register(jwt, { secret: '12345678901234567890123456789012' });
    await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
    app.addHook('preHandler', async (request, reply) => {
      if (request.url.startsWith('/auth/login') || request.url.startsWith('/auth/refresh')) return;
      try {
        await request.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'UNAUTHORIZED' });
      }
    });

    const { authRoutes } = await import('./routes.js');
    await app.register(authRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rotates refresh token and blocks reused old token with chain revocation', async () => {
    store.clear();
    writeAuthAuditMock.mockClear();
    loginMock.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'tenant_owner',
      email: 'admin@demo.local',
      name: 'Admin Demo',
    });

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        tenant_id: '11111111-1111-4111-8111-111111111111',
        email: 'admin@demo.local',
        password: 'admin12345',
      },
    });
    expect(loginResponse.statusCode).toBe(200);
    const loginBody = loginResponse.json() as { refresh_token: string };

    const refreshResponse1 = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: loginBody.refresh_token },
    });
    expect(refreshResponse1.statusCode).toBe(200);
    const refreshBody1 = refreshResponse1.json() as { refresh_token: string };

    const replayOldRefresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: loginBody.refresh_token },
    });
    expect(replayOldRefresh.statusCode).toBe(401);
    expect(replayOldRefresh.json()).toEqual({ error: 'REFRESH_TOKEN_REUSED' });
    expect(writeAuthAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_REUSE_DETECTED' }));

    const chainRevokedRefresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: refreshBody1.refresh_token },
    });
    expect(chainRevokedRefresh.statusCode).toBe(401);
    expect(chainRevokedRefresh.json()).toEqual({ error: 'REFRESH_TOKEN_REUSED' });
  });
});
