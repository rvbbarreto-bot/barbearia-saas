import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgres://test',
    JWT_SECRET: 'test-secret-min-32-chars-long-enough',
    REDIS_URL: 'redis://localhost:6379',
    NODE_ENV: 'test',
    PORT: 3333,
  },
}));

const mocks = vi.hoisted(() => ({
  listOutboxMessages: vi.fn(),
  getOutboxMessageById: vi.fn(),
  retryOutboxMessage: vi.fn(),
}));

vi.mock('./list-messages.service.js', () => ({
  listOutboxMessages: mocks.listOutboxMessages,
}));
vi.mock('./get-message.service.js', () => ({
  getOutboxMessageById: mocks.getOutboxMessageById,
}));
vi.mock('./retry-message.service.js', () => ({
  retryOutboxMessage: mocks.retryOutboxMessage,
}));

import { tenantMiddleware } from '../../middlewares/tenant.js';
import { outboxRoutes } from './routes.js';

describe('outbox routes (RBAC)', () => {
  const app = Fastify();
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const msgId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  beforeAll(async () => {
    await app.register(jwt, { secret: '12345678901234567890123456789012' });
    app.addHook('preHandler', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'UNAUTHORIZED' });
      }
      await tenantMiddleware(request, reply);
    });
    await app.register(outboxRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows attendant to GET list', async () => {
    mocks.listOutboxMessages.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });
    const token = await app.jwt.sign({
      sub: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenantId,
      role: 'attendant',
      jti: 'ob-l',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/outbox/messages?page=1&limit=10',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('denies viewer to GET list', async () => {
    const token = await app.jwt.sign({
      sub: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenantId,
      role: 'viewer',
      jti: 'ob-v',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/outbox/messages',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('denies attendant to POST retry', async () => {
    const token = await app.jwt.sign({
      sub: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenantId,
      role: 'attendant',
      jti: 'ob-r',
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/outbox/messages/${msgId}/retry`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows manager to POST retry', async () => {
    mocks.retryOutboxMessage.mockResolvedValueOnce({ id: msgId, status: 'pending' });
    const token = await app.jwt.sign({
      sub: '33333333-3333-4333-8333-333333333333',
      tenant_id: tenantId,
      role: 'manager',
      jti: 'ob-m',
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/outbox/messages/${msgId}/retry`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
