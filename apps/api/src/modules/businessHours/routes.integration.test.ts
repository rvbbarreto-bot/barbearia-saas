import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { tenantMiddleware } from '../../middlewares/tenant.js';
import { businessHoursRoutes } from './routes.js';

const mocks = vi.hoisted(() => ({
  listBusinessHours: vi.fn(),
  createBusinessHours: vi.fn(),
  updateBusinessHours: vi.fn(),
  removeBusinessHours: vi.fn(),
}));

vi.mock('./service.js', () => ({
  listBusinessHours: mocks.listBusinessHours,
  createBusinessHours: mocks.createBusinessHours,
  updateBusinessHours: mocks.updateBusinessHours,
  removeBusinessHours: mocks.removeBusinessHours,
}));

describe('business hours route authorization', () => {
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
    await app.register(businessHoursRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows viewer to list business hours', async () => {
    mocks.listBusinessHours.mockResolvedValueOnce([]);
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'viewer',
      jti: 'bh1',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/business-hours',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('denies viewer to create business hours', async () => {
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'viewer',
      jti: 'bh2',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/business-hours',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        weekday: 1,
        starts_at: '09:00:00',
        ends_at: '12:00:00',
        slot_interval_minutes: 30,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows attendant to create/update/remove business hours', async () => {
    mocks.createBusinessHours.mockResolvedValueOnce({ id: 'bh-1' });
    mocks.updateBusinessHours.mockResolvedValueOnce({ id: 'bh-1' });
    mocks.removeBusinessHours.mockResolvedValueOnce({ id: 'bh-1', active: false });

    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'attendant',
      jti: 'bh3',
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/business-hours',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        weekday: 1,
        starts_at: '09:00:00',
        ends_at: '12:00:00',
        slot_interval_minutes: 30,
      },
    });
    expect(createResponse.statusCode).toBe(201);

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/business-hours/11111111-1111-4111-8111-111111111116',
      headers: { authorization: `Bearer ${token}` },
      payload: { starts_at: '08:00:00', ends_at: '11:00:00' },
    });
    expect(updateResponse.statusCode).toBe(200);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/api/v1/professionals/11111111-1111-4111-8111-111111111113/business-hours/11111111-1111-4111-8111-111111111116',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleteResponse.statusCode).toBe(200);
  });
});
