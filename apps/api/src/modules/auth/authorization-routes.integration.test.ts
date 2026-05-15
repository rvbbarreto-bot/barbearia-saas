import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { tenantMiddleware } from '../../middlewares/tenant.js';
import { appointmentRoutes } from '../appointments/routes.js';
import { availabilityRoutes } from '../availability/routes.js';

const mocks = vi.hoisted(() => ({
  listAppointments: vi.fn(),
  getAppointmentById: vi.fn(),
  createAppointment: vi.fn(),
  confirmAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  getAvailability: vi.fn(),
}));

vi.mock('../appointments/service.js', () => ({
  listAppointments: mocks.listAppointments,
  getAppointmentById: mocks.getAppointmentById,
  createAppointment: mocks.createAppointment,
  confirmAppointment: mocks.confirmAppointment,
  cancelAppointment: mocks.cancelAppointment,
  rescheduleAppointment: mocks.rescheduleAppointment,
}));

vi.mock('../availability/service.js', () => ({
  getAvailability: mocks.getAvailability,
}));

describe('authorization by endpoint policies', () => {
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

    await app.register(appointmentRoutes, { prefix: '/api/v1' });
    await app.register(availabilityRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows viewer to read single appointment', async () => {
    mocks.getAppointmentById.mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111115', status: 'confirmed' });
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'viewer',
      jti: 'r-view-appt',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/appointments/11111111-1111-4111-8111-111111111115',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('allows viewer to read appointments', async () => {
    mocks.listAppointments.mockResolvedValueOnce([]);
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'viewer',
      jti: 'r1',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/appointments?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('denies viewer to create appointment', async () => {
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'viewer',
      jti: 'r2',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/appointments',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        customer_id: '11111111-1111-4111-8111-111111111112',
        professional_id: '11111111-1111-4111-8111-111111111113',
        service_id: '11111111-1111-4111-8111-111111111114',
        starts_at: '2026-01-01T10:00:00.000Z',
        ends_at: '2026-01-01T10:30:00.000Z',
        source: 'api',
        idempotency_key: 'idem-12345678',
        explicit_confirmation: true,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows attendant to create appointment', async () => {
    mocks.createAppointment.mockResolvedValueOnce({ id: 'appt-1' });
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'attendant',
      jti: 'r3',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/appointments',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        customer_id: '11111111-1111-4111-8111-111111111112',
        professional_id: '11111111-1111-4111-8111-111111111113',
        service_id: '11111111-1111-4111-8111-111111111114',
        starts_at: '2026-01-01T10:00:00.000Z',
        ends_at: '2026-01-01T10:30:00.000Z',
        source: 'api',
        idempotency_key: 'idem-87654321',
        explicit_confirmation: false,
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it('allows viewer to read availability', async () => {
    mocks.getAvailability.mockResolvedValueOnce({ date: '2026-01-01', slots: [] });
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'viewer',
      jti: 'r4',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/availability?professional_id=11111111-1111-4111-8111-111111111113&service_id=11111111-1111-4111-8111-111111111114&date=2026-01-01',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it('denies viewer to cancel appointment', async () => {
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'viewer',
      jti: 'r5',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/appointments/11111111-1111-4111-8111-111111111115/cancel',
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: 'Cliente pediu cancelamento' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows attendant to cancel appointment', async () => {
    mocks.cancelAppointment.mockResolvedValueOnce({ id: 'appt-cancelled', status: 'cancelled' });
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'attendant',
      jti: 'r6',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/appointments/11111111-1111-4111-8111-111111111115/cancel',
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: 'Cliente pediu cancelamento' },
    });

    expect(response.statusCode).toBe(200);
  });

  it('allows attendant to reschedule appointment', async () => {
    mocks.rescheduleAppointment.mockResolvedValueOnce({ id: 'appt-rescheduled', status: 'confirmed' });
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'attendant',
      jti: 'r7',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/appointments/11111111-1111-4111-8111-111111111115/reschedule',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        starts_at: '2026-01-02T10:00:00.000Z',
        ends_at: '2026-01-02T10:30:00.000Z',
        reason: 'Ajuste de agenda',
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('denies viewer to confirm appointment', async () => {
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'viewer',
      jti: 'r8',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/appointments/11111111-1111-4111-8111-111111111115/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.confirmAppointment).not.toHaveBeenCalled();
  });

  it('allows attendant to confirm appointment', async () => {
    mocks.confirmAppointment.mockResolvedValueOnce({ id: 'appt-confirmed', status: 'confirmed' });
    const token = await app.jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      role: 'attendant',
      jti: 'r9',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/appointments/11111111-1111-4111-8111-111111111115/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.confirmAppointment).toHaveBeenCalled();
  });
});
