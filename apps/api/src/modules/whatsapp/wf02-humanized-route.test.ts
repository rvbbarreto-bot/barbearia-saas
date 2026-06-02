import { describe, expect, it } from 'vitest';

/** Espelha gate do WF02 Rotear fluxo (atendimento humanizado). */
function resolveRoute(j: {
  intent: string;
  ready_to_book?: boolean;
  professional_id?: string | null;
  service_id?: string | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
}) {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const okUuid = (v: unknown) => typeof v === 'string' && UUID_RE.test(v.trim());
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(String(j.appointment_date ?? ''));
  const timeOk = /^\d{2}:\d{2}$/.test(String(j.appointment_time ?? ''));
  return j.intent === 'criar_agendamento' &&
    j.ready_to_book === true &&
    okUuid(j.professional_id) &&
    okUuid(j.service_id) &&
    dateOk &&
    timeOk
    ? 'criar'
    : 'outbound';
}

describe('WF02 route humanizado', () => {
  const full = {
    intent: 'criar_agendamento',
    ready_to_book: true,
    professional_id: '00000000-0000-4000-8000-000000004011',
    service_id: '00000000-0000-4000-8000-000000004021',
    appointment_date: '2026-06-03',
    appointment_time: '10:30',
  };

  it('nao cria agendamento se cliente so pediu agendar (sem confirmacao)', () => {
    expect(
      resolveRoute({
        ...full,
        ready_to_book: false,
        intent: 'coletar_agendamento',
      }),
    ).toBe('outbound');
  });

  it('nao cria se intent criar mas ready_to_book false', () => {
    expect(resolveRoute({ ...full, ready_to_book: false })).toBe('outbound');
  });

  it('cria somente com confirmacao e dados completos', () => {
    expect(resolveRoute(full)).toBe('criar');
  });
});
