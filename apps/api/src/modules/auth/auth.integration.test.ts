import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { tenantMiddleware } from '../../middlewares/tenant.js';

const { revokedMock } = vi.hoisted(() => ({
  revokedMock: vi.fn(),
}));

vi.mock('./session.js', () => ({
  isSessionRevoked: revokedMock,
}));

async function buildTestApp() {
  const app = Fastify();
  await app.register(jwt, { secret: '12345678901234567890123456789012' });

  app.addHook('preHandler', async (request: any, reply) => {
    if (request.url.startsWith('/health') || request.url.startsWith('/auth/login')) return;
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
    const jti = request.user?.jti as string | undefined;
    if (jti && (await revokedMock(jti))) {
      return reply.code(401).send({ error: 'SESSION_REVOKED' });
    }
    await tenantMiddleware(request, reply);
  });

  app.get('/api/v1/protected', async (request: any) => ({ ok: true, tenantId: request.tenantId }));
  await app.ready();
  return app;
}

describe('auth integration hardening', () => {
  const appPromise = buildTestApp();

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it('returns 403 on tenant mismatch', async () => {
    revokedMock.mockResolvedValueOnce(false);
    const app = await appPromise;
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'tenant_owner',
      jti: 'jti-1',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/protected',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': '22222222-2222-4222-8222-222222222222',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'TENANT_MISMATCH' });
  });

  it('returns 401 when session is revoked', async () => {
    revokedMock.mockResolvedValueOnce(true);
    const app = await appPromise;
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'tenant_owner',
      jti: 'jti-2',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/protected',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': '11111111-1111-4111-8111-111111111111',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'SESSION_REVOKED' });
  });
});
