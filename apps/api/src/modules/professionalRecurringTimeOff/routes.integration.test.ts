import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { tenantMiddleware } from '../../middlewares/tenant.js';
import { professionalRecurringTimeOffRoutes } from './routes.js';

const mocks = vi.hoisted(() => ({
  listRecurringTimeOff: vi.fn(),
  createRecurringTimeOff: vi.fn(),
  updateRecurringTimeOff: vi.fn(),
  removeRecurringTimeOff: vi.fn(),
}));

vi.mock('./service.js', () => ({
  listRecurringTimeOff: mocks.listRecurringTimeOff,
  createRecurringTimeOff: mocks.createRecurringTimeOff,
  updateRecurringTimeOff: mocks.updateRecurringTimeOff,
  removeRecurringTimeOff: mocks.removeRecurringTimeOff,
}));

describe('professional recurring time off route authorization', () => {
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
    await app.register(professionalRecurringTimeOffRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows viewer to list recurring time off', async () => {
    mocks.listRecurringTimeOff.mockResolvedValueOnce([]);
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'viewer',
      jti: 'rto1',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/recurring-time-off',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('denies viewer to create recurring time off', async () => {
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'viewer',
      jti: 'rto2',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/recurring-time-off',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        weekday: 1,
        starts_at: '09:00:00',
        ends_at: '10:00:00',
        reason: 'Treinamento',
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows attendant to create/update/remove recurring time off', async () => {
    mocks.createRecurringTimeOff.mockResolvedValueOnce({ id: 'rto-1' });
    mocks.updateRecurringTimeOff.mockResolvedValueOnce({ id: 'rto-1' });
    mocks.removeRecurringTimeOff.mockResolvedValueOnce({ id: 'rto-1', active: false });
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'attendant',
      jti: 'rto3',
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/recurring-time-off',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        weekday: 1,
        starts_at: '09:00:00',
        ends_at: '10:00:00',
        reason: 'Treinamento',
      },
    });
    expect(createResponse.statusCode).toBe(201);

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/recurring-time-off/11111111-1111-4111-8111-111111111116',
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: 'Reunião interna' },
    });
    expect(updateResponse.statusCode).toBe(200);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/recurring-time-off/11111111-1111-4111-8111-111111111116',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleteResponse.statusCode).toBe(200);
  });
});
