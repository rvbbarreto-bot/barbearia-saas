import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { tenantMiddleware } from '../../middlewares/tenant.js';
import { tenantRoutes } from './routes.js';

const mocks = vi.hoisted(() => ({
  listTenants: vi.fn(),
  getTenantById: vi.fn(),
  createTenant: vi.fn(),
  updateTenant: vi.fn(),
}));

vi.mock('./service.js', () => ({
  listTenants: mocks.listTenants,
  getTenantById: mocks.getTenantById,
  createTenant: mocks.createTenant,
  updateTenant: mocks.updateTenant,
}));

describe('tenant routes RBAC', () => {
  const app = Fastify();

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
    await app.register(tenantRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const tid = '11111111-1111-4111-8111-111111111111';

  it('denies GET /tenants for tenant_owner', async () => {
    const token = await app.jwt.sign({ sub: '22222222-2222-4222-8222-222222222222', tenant_id: tid, role: 'tenant_owner', jti: 't1' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tenants',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows GET /tenants/current for tenant_owner', async () => {
    mocks.getTenantById.mockResolvedValueOnce({ id: tid, name: 'Demo' });
    const token = await app.jwt.sign({ sub: '22222222-2222-4222-8222-222222222222', tenant_id: tid, role: 'tenant_owner', jti: 't2' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tenants/current',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe(tid);
  });

  it('allows GET /tenants for platform_admin with x-tenant-id (regressão)', async () => {
    mocks.listTenants.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });
    const token = await app.jwt.sign({
      sub: '33333333-3333-4333-8333-333333333333',
      tenant_id: tid,
      role: 'platform_admin',
      jti: 't3',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tenants',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tid },
    });
    expect(res.statusCode).toBe(200);
  });

  it('allows GET /tenants for platform_admin without x-tenant-id (JWT tenant_id null — Cenário A)', async () => {
    mocks.listTenants.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });
    const token = await app.jwt.sign({
      sub: '33333333-3333-4333-8333-333333333333',
      tenant_id: null,
      role: 'platform_admin',
      jti: 't3b',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tenants',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('allows GET /tenants?pagination for platform_admin without x-tenant-id (query string)', async () => {
    mocks.listTenants.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20 });
    const token = await app.jwt.sign({
      sub: '33333333-3333-4333-8333-333333333333',
      tenant_id: null,
      role: 'platform_admin',
      jti: 't3c',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tenants?page=1&limit=20',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('denies tenant_owner GET /tenants/:id when UUID differs from JWT tenant', async () => {
    const token = await app.jwt.sign({
      sub: '22222222-2222-4222-8222-222222222222',
      tenant_id: tid,
      role: 'tenant_owner',
      jti: 't5',
    });
    const other = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tenants/${other}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
