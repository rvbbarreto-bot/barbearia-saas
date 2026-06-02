const root = $input.first().json ?? {};
const parent = $('Preparar contexto inbound').first().json ?? {};
const inbound = parent.inbound ?? {};
let catalog = { services: [], professionals: [] };
let defaults = {};
try {
  const ctx = $('Montar contexto agente').first().json ?? {};
  catalog = ctx.catalog ?? catalog;
  defaults = ctx.defaults ?? {};
} catch (_) {
  /* legado */
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const okUuid = (v) => typeof v === 'string' && UUID_RE.test(v.trim());

const sessionText = String(inbound.session_text ?? inbound.message ?? '').trim();
const lastMessage = String(inbound.message ?? '').trim();

function parseAgentPayload(raw) {
  if (raw == null) return {};
  let v = raw;
  if (typeof v === 'string') {
    const s = v.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    try {
      v = JSON.parse(s);
    } catch (_) {
      return {};
    }
  }
  if (v && typeof v === 'object' && typeof v.output === 'string') {
    return parseAgentPayload(v.output);
  }
  return v && typeof v === 'object' ? v : {};
}

function resolveFromCatalog(value, list, nameKeys = ['name', 'title']) {
  if (okUuid(value)) return value.trim();
  const q = String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!q) return null;
  for (const item of list) {
    const id = item.id;
    if (!okUuid(id)) continue;
    for (const k of nameKeys) {
      const n = String(item[k] ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (!n) continue;
      if (n.includes(q) || q.includes(n)) return id;
    }
  }
  return null;
}

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

function parseTimeHint(text) {
  const m = String(text).match(/\b(\d{1,2})\s*[:h]\s*(\d{2})\b/i);
  if (!m) return null;
  const h = Math.min(23, parseInt(m[1], 10));
  const min = Math.min(59, parseInt(m[2], 10));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function clientConfirmed(text) {
  return /\b(sim|confirmo|confirmar|pode ser|isso mesmo|isso|ok|fechado|perfeito|pode marcar|pode agendar)\b/i.test(
    text,
  );
}

function wantsScheduling(text) {
  return /agendar|marcar|hor[aá]rio|reservar|corte|barba/i.test(text);
}

function hasServiceHint(text, services) {
  if (resolveFromCatalog(text, services)) return true;
  return /corte|barba|servi/i.test(text);
}

function hasProfessionalHint(text, professionals) {
  if (resolveFromCatalog(text, professionals)) return true;
  return (professionals || []).some((p) => {
    const n = String(p.name ?? '').trim();
    return n.length > 2 && text.toLowerCase().includes(n.toLowerCase());
  });
}

const out = parseAgentPayload(root.output ?? root.json ?? root);

const defaultCustomer = String(
  defaults.customer_id ?? $env.QA_DEFAULT_CUSTOMER_ID ?? '00000000-0000-4000-8000-000000004031',
).trim();

const customer_id =
  (okUuid(out.customer_id) ? out.customer_id.trim() : null) ??
  inbound.customer_id ??
  parent.enrichment?.customer_id ??
  parent.core_response?.customerId ??
  defaultCustomer;

/** Nunca preenche profissional/servico default — evita agendar Fred/corte sem escolha do cliente. */
let professional_id =
  out.professional_id ??
  out.professional ??
  resolveFromCatalog(out.professional_name, catalog.professionals ?? []);
if (!okUuid(professional_id)) {
  professional_id = resolveFromCatalog(sessionText, catalog.professionals ?? []);
  if (professional_id && !hasProfessionalHint(sessionText, catalog.professionals)) {
    professional_id = null;
  }
}

let service_id =
  out.service_id ?? out.service ?? resolveFromCatalog(out.service_name, catalog.services ?? []);
if (!okUuid(service_id)) {
  service_id = resolveFromCatalog(sessionText, catalog.services ?? []);
  if (service_id && !hasServiceHint(sessionText, catalog.services)) {
    service_id = null;
  }
}

const appointment_date = resolveAppointmentDate(
  out.appointment_date ?? out.date ?? null,
  sessionText,
);

let appointment_time = out.appointment_time ?? out.time ?? parseTimeHint(sessionText);
if (appointment_time && !/^\d{2}:\d{2}$/.test(String(appointment_time))) {
  appointment_time = parseTimeHint(String(appointment_time));
}

const hasDate = isIsoDate(appointment_date);
const hasTime = /^\d{2}:\d{2}$/.test(String(appointment_time ?? ''));
const hasPro = okUuid(professional_id);
const hasSvc = okUuid(service_id);

let ready_to_book = out.ready_to_book === true || out.explicit_confirmation === true;
if (ready_to_book && !clientConfirmed(lastMessage) && !clientConfirmed(sessionText.slice(-120))) {
  ready_to_book = false;
}
if (ready_to_book && !(hasPro && hasSvc && hasDate && hasTime)) {
  ready_to_book = false;
}

let intent = String(out.intent ?? '').trim();

if (!intent) {
  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|tudo bem)\b/i.test(lastMessage) && !wantsScheduling(sessionText)) {
    intent = 'informacao_empresa';
  } else if (ready_to_book && hasPro && hasSvc && hasDate && hasTime) {
    intent = 'criar_agendamento';
  } else if (wantsScheduling(sessionText)) {
    intent = 'coletar_agendamento';
  } else {
    intent = 'informacao_empresa';
  }
}

if (intent === 'criar_agendamento' && !ready_to_book) {
  intent = 'coletar_agendamento';
}

if (intent === 'criar_agendamento' && !(hasPro && hasSvc && hasDate && hasTime)) {
  intent = 'coletar_agendamento';
  ready_to_book = false;
}

let response_text = String(
  out.response_text ?? 'Ola! Como posso ajudar voce hoje?',
);

if (/agendamento (foi )?(confirmado|realizado|marcado)/i.test(response_text) && !ready_to_book) {
  response_text = response_text.replace(
    /agendamento (foi )?(confirmado|realizado|marcado)[^.!?]*/gi,
    'vamos continuar seu agendamento',
  );
}

if (/autentica|authorization|unauthorized|401|403/i.test(response_text)) {
  response_text =
    'Ola! Para agendar, me conta qual servico voce prefere e com qual profissional gostaria de ser atendido.';
}

const appointment_payload =
  out.appointment_payload && typeof out.appointment_payload === 'object'
    ? out.appointment_payload
    : {};

return [
  {
    json: {
      intent,
      ready_to_book,
      professional_id: hasPro ? professional_id : null,
      service_id: hasSvc ? service_id : null,
      appointment_date: hasDate ? appointment_date : null,
      appointment_time: hasTime ? appointment_time : null,
      customer_id,
      response_text,
      appointment_payload,
      inbound,
      session_text: sessionText,
    },
  },
];
