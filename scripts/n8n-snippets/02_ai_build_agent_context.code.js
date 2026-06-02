/** Monta contexto limpo para o agente (sem vazar erros HTTP 401/403 ao cliente). */
const prep = $('Preparar contexto inbound').first().json ?? {};
const inbound = prep.inbound ?? {};

function unwrapList(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function isHttpErrorShape(o) {
  if (!o || typeof o !== 'object') return false;
  const msg = String(o.message ?? o.error ?? '').toLowerCase();
  const status = o.statusCode ?? o.status;
  return (
    status === 401 ||
    status === 403 ||
    msg.includes('unauthorized') ||
    msg.includes('authorization failed') ||
    msg.includes('forbidden')
  );
}

function safeApiSlice(nodeName) {
  try {
    const row = $(nodeName).first().json;
    if (!row || isHttpErrorShape(row)) return { ok: false, data: [] };
    return { ok: true, data: unwrapList(row) };
  } catch (_) {
    return { ok: false, data: [] };
  }
}

const services = safeApiSlice('Catalogo servicos Core API');
const professionals = safeApiSlice('Catalogo profissionais Core API');
const appointments = safeApiSlice('Contexto agenda Core API');

const catalog = {
  services: services.data.map((s) => ({
    id: s.id,
    name: s.name ?? s.title,
    duration_minutes: s.duration_minutes ?? s.durationMinutes,
  })),
  professionals: professionals.data.map((p) => ({
    id: p.id,
    name: p.name ?? p.display_name ?? p.displayName,
  })),
  appointments_next_7d: appointments.data.slice(0, 30),
  api_errors: {
    services: !services.ok,
    professionals: !professionals.ok,
    appointments: !appointments.ok,
  },
};

const defaultProfessional = String(
  $env.QA_DEFAULT_PROFESSIONAL_ID || '00000000-0000-4000-8000-000000004012',
).trim();
const defaultService = String(
  $env.QA_DEFAULT_SERVICE_ID || '00000000-0000-4000-8000-000000004021',
).trim();

return [
  {
    json: {
      inbound,
      enrichment: prep.enrichment ?? {},
      normalized: prep.normalized ?? {},
      core_response: prep.core_response ?? {},
      catalog,
      defaults: {
        professional_id: defaultProfessional,
        service_id: defaultService,
        customer_id: String(
          $env.QA_DEFAULT_CUSTOMER_ID || '00000000-0000-4000-8000-000000004031',
        ).trim(),
      },
    },
  },
];
