/**
 * Rotas de catálogo / services — política de listagem operacional vs gerencial.
 */

import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../shared/errors.js';

vi.mock('../../infra/db/pool.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
  },
}));

import { tenantMiddleware } from '../../middlewares/tenant.js';
import { serviceRoutes } from './routes.js';

const mocks = vi.hoisted(() => ({
  listServices: vi.fn(),
  getServiceById: vi.fn(),
}));

vi.mock('./service.js', () => ({
  listServices: mocks.listServices,
  getServiceById: mocks.getServiceById,
  createService: vi.fn(),
  updateService: vi.fn(),
}));

describe('catalog service routes policies', () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    await app.register(jwt, { secret: '12345678901234567890123456789012' });
    app.setErrorHandler((error, _, reply) => {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send({ error: error.code, message: error.message });
      }
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    });
    app.addHook('preHandler', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'UNAUTHORIZED' });
      }
      await tenantMiddleware(request, reply);
    });
    await app.register(serviceRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mocks.listServices.mockReset();
    mocks.listServices.mockImplementation((_tenantId, query, opts) => {
      const inactive =
        typeof (query as { active?: unknown }).active === 'string' &&
        (query as { active: string }).active.toLowerCase() === 'false';
      if (inactive && !opts.allowInactiveListing) {
        throw new AppError('OPERATIONAL_CATALOG_ONLY', 'Catálogo operacional.', 400);
      }
      return Promise.resolve({ data: [], total: 0, page: 1, limit: 50 });
    });
  });

  it('viewer não pode usar active=false para listar inativos', async () => {
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '22222222-2222-4222-8222-222222222222',
      role: 'viewer',
      jti: 'cat1',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/services?active=false',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('OPERATIONAL_CATALOG_ONLY');
  });

  it('manager pode pedir lista com active=false', async () => {
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '22222222-2222-4222-8222-222222222222',
      role: 'manager',
      jti: 'cat2',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/services?active=false',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.listServices).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      expect.objectContaining({ active: 'false' }),
      { allowInactiveListing: true },
    );
  });
});
