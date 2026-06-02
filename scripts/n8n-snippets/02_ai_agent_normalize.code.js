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

/** "Amanhã" no histórico vence data da IA; rejeita datas passadas. */
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

const schedulingCue =
  /agendar|hor[aá]rio|marcar|corte|barba|amanh[aã]|\d{1,2}\s*[:h]\s*\d{2}/i.test(sessionText);

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

let professional_id =
  out.professional_id ??
  out.professional ??
  resolveFromCatalog(out.professional_name, catalog.professionals ?? []);
if (!okUuid(professional_id) && schedulingCue && okUuid(defaults.professional_id)) {
  professional_id = defaults.professional_id;
}

let service_id =
  out.service_id ?? out.service ?? resolveFromCatalog(out.service_name, catalog.services ?? []);
if (!okUuid(service_id) && schedulingCue && okUuid(defaults.service_id)) {
  service_id = defaults.service_id;
}

const appointment_date = resolveAppointmentDate(
  out.appointment_date ?? out.date ?? null,
  sessionText,
);

let appointment_time = out.appointment_time ?? out.time ?? parseTimeHint(sessionText);

let intent = String(out.intent ?? '').trim();
if (!intent) {
  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite)\b/i.test(String(inbound.message ?? '')) && !schedulingCue) {
    intent = 'informacao_empresa';
  } else if (schedulingCue && okUuid(service_id) && okUuid(professional_id)) {
    intent = /agendar|marcar/i.test(sessionText) ? 'criar_agendamento' : 'consultar_horarios';
  } else {
    intent = 'consultar_horarios';
  }
}

let response_text = String(
  out.response_text ?? 'Recebemos sua mensagem. Em breve retornamos o contato.',
);
if (/autentica|authorization|unauthorized|401|403/i.test(response_text)) {
  response_text =
    'Recebemos sua mensagem. Para agendar, informe o servico (ex.: corte masculino), dia e horario preferido.';
}

const appointment_payload =
  out.appointment_payload && typeof out.appointment_payload === 'object'
    ? out.appointment_payload
    : {};

return [
  {
    json: {
      intent,
      professional_id: okUuid(professional_id) ? professional_id : null,
      service_id: okUuid(service_id) ? service_id : null,
      appointment_date: isIsoDate(appointment_date) ? appointment_date : null,
      appointment_time,
      customer_id,
      response_text,
      appointment_payload,
      inbound,
      session_text: sessionText,
    },
  },
];
