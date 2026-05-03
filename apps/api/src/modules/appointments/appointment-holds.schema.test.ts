import { describe, expect, it } from 'vitest';
import { createAppointmentHoldBodySchema } from './appointment-holds.dto.js';

describe('createAppointmentHoldBodySchema', () => {
  it('exige idempotency_key e limita TTL a 5–15 minutos', () => {
    const base = {
      professional_id: '00000000-0000-4000-8000-000000000001',
      service_id: '00000000-0000-4000-8000-000000000002',
      starts_at: '2026-06-01T10:00:00.000Z',
      ends_at: '2026-06-01T11:00:00.000Z',
      idempotency_key: 'conv-abc-12345',
    };
    expect(() => createAppointmentHoldBodySchema.parse({ ...base, ttl_minutes: 4 })).toThrow();
    expect(() => createAppointmentHoldBodySchema.parse({ ...base, ttl_minutes: 16 })).toThrow();
    expect(createAppointmentHoldBodySchema.parse({ ...base, ttl_minutes: 10 }).ttl_minutes).toBe(10);
    expect(() =>
      createAppointmentHoldBodySchema.parse({
        ...base,
        idempotency_key: 'short',
      }),
    ).toThrow();
  });
});
