import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { loginMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
}));

vi.mock('./service.js', () => ({
  login: loginMock,
}));

vi.mock('./audit.js', () => ({
  writeAuthAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../infra/redis/client.js', () => ({
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue('1'),
    del: vi.fn().mockResolvedValue(1),
  },
}));

describe('auth route specific rate limits', () => {
  const app = Fastify();

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? '12345678901234567890123456789012';
    process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
    process.env.AUTH_RATE_LIMIT_WINDOW = '1 minute';
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX = '1';
    process.env.AUTH_REFRESH_RATE_LIMIT_MAX = '1';
    process.env.AUTH_LOGOUT_RATE_LIMIT_MAX = '1';

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

  it('applies login rate limit by endpoint', async () => {
    loginMock.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'tenant_owner',
      email: 'admin@demo.local',
      name: 'Admin Demo',
    });

    const payload = {
      tenant_id: '11111111-1111-4111-8111-111111111111',
      email: 'admin@demo.local',
      password: 'admin12345',
    };
    const first = await app.inject({ method: 'POST', url: '/auth/login', payload });
    const second = await app.inject({ method: 'POST', url: '/auth/login', payload });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
  });
});
