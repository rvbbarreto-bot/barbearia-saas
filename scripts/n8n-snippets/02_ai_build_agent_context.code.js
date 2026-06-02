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

function safeApiOverview(nodeName) {
  try {
    const row = $(nodeName).first().json;
    if (!row || isHttpErrorShape(row) || !row.customer) return { ok: false, data: null };
    return { ok: true, data: row };
  } catch (_) {
    return { ok: false, data: null };
  }
}

function pickAppointmentSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    service_name: row.service_name,
    professional_name: row.professional_name,
  };
}

function buildCustomerMemory(overview) {
  if (!overview?.ok || !overview.data) {
    return {
      registered_name: null,
      is_vip: false,
      last_appointment: null,
      next_appointment: null,
      recent_services: [],
      profile_available: false,
    };
  }

  const data = overview.data;
  const customer = data.customer ?? {};
  const appts = Array.isArray(data.appointments) ? data.appointments : [];
  const nowMs = Date.now();

  const sorted = [...appts].sort(
    (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
  );

  const past = sorted.filter((a) => new Date(a.starts_at).getTime() < nowMs);
  const future = sorted
    .filter((a) => new Date(a.starts_at).getTime() >= nowMs)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  const lastCompleted =
    past.find((a) => a.status === 'completed') ??
    past.find((a) => ['completed', 'confirmed', 'scheduled', 'no_show'].includes(String(a.status))) ??
    past[0] ??
    null;

  return {
    registered_name: customer.name ?? null,
    is_vip: Boolean(customer.is_vip),
    last_appointment: pickAppointmentSummary(lastCompleted),
    next_appointment: pickAppointmentSummary(future[0] ?? null),
    recent_services: Array.isArray(data.recent_services) ? data.recent_services : [],
    last_interaction_at: customer.last_interaction_at ?? null,
    profile_available: true,
  };
}

const services = safeApiSlice('Catalogo servicos Core API');
const professionals = safeApiSlice('Catalogo profissionais Core API');
const appointments = safeApiSlice('Contexto agenda Core API');
const overview = safeApiOverview('Perfil cliente Core API');

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
    customer_profile: !overview.ok,
  },
};

const customer_memory = buildCustomerMemory(overview);

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
      customer_memory,
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
