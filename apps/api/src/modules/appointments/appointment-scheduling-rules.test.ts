import { describe, expect, it } from 'vitest';
import { assertAppointmentStartsNotInPast, APPOINTMENT_PAST_GRACE_MS } from './appointment-scheduling-rules.js';

describe('assertAppointmentStartsNotInPast', () => {
  const now = Date.parse('2026-05-13T12:00:00.000Z');

  it('aceita início no futuro', () => {
    expect(() =>
      assertAppointmentStartsNotInPast('2026-05-13T15:00:00.000Z', now),
    ).not.toThrow();
  });

  it('aceita início dentro da tolerância de 1 minuto', () => {
    expect(() =>
      assertAppointmentStartsNotInPast('2026-05-13T11:59:30.000Z', now),
    ).not.toThrow();
  });

  it('rejeita início no passado além da tolerância', () => {
    expect(() =>
      assertAppointmentStartsNotInPast('2026-05-13T11:58:00.000Z', now),
    ).toThrow(
      expect.objectContaining({ code: 'APPOINTMENT_IN_PAST', statusCode: 422 }),
    );
  });

  it('rejeita ISO inválido', () => {
    expect(() => assertAppointmentStartsNotInPast('invalid', now)).toThrow(
      expect.objectContaining({ code: 'APPOINTMENT_IN_PAST' }),
    );
  });

  it('exporta tolerância de 60s', () => {
    expect(APPOINTMENT_PAST_GRACE_MS).toBe(60_000);
  });
});
