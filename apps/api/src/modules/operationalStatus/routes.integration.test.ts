import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOperationalStatus: vi.fn(),
}));

vi.mock('./service.js', () => ({
  getOperationalStatus: mocks.getOperationalStatus,
}));

import { tenantMiddleware } from '../../middlewares/tenant.js';
import { operationalStatusRoutes } from './routes.js';

describe('operational status routes (RBAC)', () => {
  const app = Fastify();
  const tenantId = '11111111-1111-4111-8111-111111111111';

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
    await app.register(operationalStatusRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows manager to GET status with query filters', async () => {
    mocks.getOperationalStatus.mockResolvedValueOnce({
      generated_at: new Date().toISOString(),
      infrastructure: {
        api: 'ok',
        database: 'ok',
        redis: 'ok',
        outbox_worker: 'ok',
        n8n: 'not_probed',
        evolution: 'not_probed',
        errors: { database: null, redis: null, n8n: null, evolution: null },
      },
      outbox: {
        counts: { pending: 0, processing: 0, sent: 0, failed: 0, dead: 0 },
        recent_errors: [],
        filters_applied: { status: 'failed' },
      },
    });
    const token = await app.jwt.sign({
      sub: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenantId,
      role: 'manager',
      jti: 'ops-m',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/operational/status?status=failed',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(mocks.getOperationalStatus).toHaveBeenCalledWith(tenantId, { status: 'failed' });
  });

  it('denies attendant', async () => {
    const token = await app.jwt.sign({
      sub: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenantId,
      role: 'attendant',
      jti: 'ops-a',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/operational/status',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('denies viewer', async () => {
    const token = await app.jwt.sign({
      sub: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenantId,
      role: 'viewer',
      jti: 'ops-v',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/operational/status',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/operational/status' });
    expect(res.statusCode).toBe(401);
  });
});
