import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { tenantMiddleware } from '../../middlewares/tenant.js';
import { professionalTimeOffRoutes } from './routes.js';

const mocks = vi.hoisted(() => ({
  listTimeOff: vi.fn(),
  createTimeOff: vi.fn(),
  updateTimeOff: vi.fn(),
  removeTimeOff: vi.fn(),
}));

vi.mock('./service.js', () => ({
  listTimeOff: mocks.listTimeOff,
  createTimeOff: mocks.createTimeOff,
  updateTimeOff: mocks.updateTimeOff,
  removeTimeOff: mocks.removeTimeOff,
}));

describe('professional time off route authorization', () => {
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
    await app.register(professionalTimeOffRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows viewer to list time off', async () => {
    mocks.listTimeOff.mockResolvedValueOnce([]);
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'viewer',
      jti: 'to1',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/time-off',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('denies viewer to create time off', async () => {
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'viewer',
      jti: 'to2',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/time-off',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        starts_at: '2026-05-10T12:00:00.000Z',
        ends_at: '2026-05-10T13:00:00.000Z',
        reason: 'Folga',
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows attendant to create/update/remove time off', async () => {
    mocks.createTimeOff.mockResolvedValueOnce({ id: 'timeoff-1' });
    mocks.updateTimeOff.mockResolvedValueOnce({ id: 'timeoff-1' });
    mocks.removeTimeOff.mockResolvedValueOnce({ id: 'timeoff-1', active: false });
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'attendant',
      jti: 'to3',
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/time-off',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        starts_at: '2026-05-10T12:00:00.000Z',
        ends_at: '2026-05-10T13:00:00.000Z',
        reason: 'Folga',
      },
    });
    expect(createResponse.statusCode).toBe(201);

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/time-off/11111111-1111-4111-8111-111111111116',
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: 'Consulta médica' },
    });
    expect(updateResponse.statusCode).toBe(200);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/time-off/11111111-1111-4111-8111-111111111116',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleteResponse.statusCode).toBe(200);
  });
});
