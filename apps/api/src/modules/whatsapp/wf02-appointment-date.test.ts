import { describe, expect, it } from 'vitest';

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowIsoDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''));
}

function resolveAppointmentDate(rawDate, sessionText) {
  if (/amanha|amanhã/i.test(sessionText)) {
    return tomorrowIsoDate();
  }
  const candidate = rawDate ?? null;
  if (!isIsoDate(candidate)) return null;
  if (candidate < todayIsoDate()) return null;
  return candidate;
}

describe('resolveAppointmentDate (WF02 normalizer)', () => {
  it('força amanhã quando histórico pede amanhã (ignora 2023-10-31 da IA)', () => {
    const session = 'Cliente: Para amanha as 10:30 com corte masculino';
    expect(resolveAppointmentDate('2023-10-31', session)).toBe(tomorrowIsoDate());
  });

  it('rejeita data passada sem menção a amanhã', () => {
    expect(resolveAppointmentDate('2020-01-01', 'Quero agendar')).toBeNull();
  });

  it('aceita data futura explícita', () => {
    const future = tomorrowIsoDate();
    expect(resolveAppointmentDate(future, 'Quero agendar')).toBe(future);
  });
});
