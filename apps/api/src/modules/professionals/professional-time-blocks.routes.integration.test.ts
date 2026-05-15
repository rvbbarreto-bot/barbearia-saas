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
  listProfessionalTimeBlocks: vi.fn(),
  createProfessionalTimeBlock: vi.fn(),
  deleteProfessionalTimeBlock: vi.fn(),
}));

vi.mock('./professional-time-blocks.service.js', () => ({
  listProfessionalTimeBlocks: mocks.listProfessionalTimeBlocks,
  createProfessionalTimeBlock: mocks.createProfessionalTimeBlock,
  deleteProfessionalTimeBlock: mocks.deleteProfessionalTimeBlock,
}));

import { tenantMiddleware } from '../../middlewares/tenant.js';
import { professionalRoutes } from './routes.js';

describe('professional time-blocks routes (RBAC)', () => {
  const app = Fastify();

  const tenantId = '11111111-1111-4111-8111-111111111111';
  const profId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const blockId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
    await app.register(professionalRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows viewer to GET time-blocks', async () => {
    mocks.listProfessionalTimeBlocks.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });
    const token = await app.jwt.sign({
      sub: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenantId,
      role: 'viewer',
      jti: 'tb-view',
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/professionals/${profId}/time-blocks?page=1&limit=10`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('denies viewer to POST time-blocks', async () => {
    const token = await app.jwt.sign({
      sub: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenantId,
      role: 'viewer',
      jti: 'tb-deny',
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/professionals/${profId}/time-blocks`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        starts_at: '2026-06-01T12:00:00.000Z',
        ends_at: '2026-06-01T13:00:00.000Z',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows attendant to POST and DELETE time-blocks', async () => {
    mocks.createProfessionalTimeBlock.mockResolvedValueOnce({
      id: blockId,
      professional_id: profId,
      starts_at: '2026-06-01T12:00:00.000Z',
      ends_at: '2026-06-01T13:00:00.000Z',
    });
    mocks.deleteProfessionalTimeBlock.mockResolvedValueOnce({ deleted: true });

    const token = await app.jwt.sign({
      sub: '33333333-3333-4333-8333-333333333333',
      tenant_id: tenantId,
      role: 'attendant',
      jti: 'tb-att',
    });
    const post = await app.inject({
      method: 'POST',
      url: `/api/v1/professionals/${profId}/time-blocks`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        starts_at: '2026-06-01T12:00:00.000Z',
        ends_at: '2026-06-01T13:00:00.000Z',
        kind: 'manual',
      },
    });
    expect(post.statusCode).toBe(201);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/professionals/${profId}/time-blocks/${blockId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(204);
  });
});
