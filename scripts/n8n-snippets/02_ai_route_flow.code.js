const j = $input.first().json ?? {};
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const okUuid = (v) => typeof v === 'string' && UUID_RE.test(v.trim());
const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(String(j.appointment_date ?? ''));
const timeOk = /^\d{2}:\d{2}$/.test(String(j.appointment_time ?? ''));

/** Cria agendamento na API somente com confirmacao explicita + dados completos (atendimento humanizado). */
const route =
  j.intent === 'criar_agendamento' &&
  j.ready_to_book === true &&
  okUuid(j.professional_id) &&
  okUuid(j.service_id) &&
  dateOk &&
  timeOk
    ? 'criar'
    : 'outbound';

return [{ json: { ...j, _route: route } }];
