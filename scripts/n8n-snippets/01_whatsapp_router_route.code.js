const norm = $('Filtrar e Normalizar').first().json;
const raw = $input.first().json ?? {};

function stop(route, enrichment, apiStatus, parsed, diag) {
  return [{
    json: {
      route,
      api_status: apiStatus ?? null,
      normalized: norm,
      enrichment: enrichment || {},
      core_response: parsed ?? null,
      ...(diag && typeof diag === 'object' ? { diag } : {}),
    },
  }];
}

const baseUrlRaw = String($env.API_BASE_URL || '').replace(/\/$/, '');
if (!baseUrlRaw) {
  return stop('config_error', {}, null, null, { error_hint: 'API_BASE_URL' });
}

const webhookToken = String($env.CORE_WEBHOOK_TOKEN || $env.N8N_WEBHOOK_TOKEN || '').trim();
if (!webhookToken) {
  return stop('config_error', {}, null, null, { error_hint: 'CORE_WEBHOOK_TOKEN' });
}

const hmacSecret = String($env.N8N_HMAC_SECRET || '').trim();
if (hmacSecret.length > 0) {
  return stop('config_error', {}, null, null, { error_hint: 'HMAC_requires_external_signer' });
}

function unwrapBody(x) {
  if (!x || typeof x !== 'object') return {};
  if (x.body && typeof x.body === 'object') return x.body;
  if (typeof x.body === 'string') {
    try {
      return x.body ? JSON.parse(x.body) : {};
    } catch (_) {
      return { raw: x.body };
    }
  }
  return x;
}

let parsed = unwrapBody(raw);

let statusCode =
  typeof raw.statusCode === 'number'
    ? raw.statusCode
    : typeof raw.error?.statusCode === 'number'
      ? raw.error.statusCode
      : null;

// HTTP Request v4 devolve JSON da Core no root (sem statusCode) em 2xx
if (statusCode === null && parsed && typeof parsed === 'object') {
  if (parsed.ok === true || parsed.duplicate === true) {
    statusCode = 200;
  } else if (parsed.error) {
    statusCode = 400;
  }
}

if (raw.error && (statusCode === null || statusCode >= 400)) {
  const msg = raw.error.message ? String(raw.error.message) : String(raw.error);
  return stop('error', {}, statusCode, parsed, { error_hint: 'network', error_message: msg });
}

if (statusCode === null || statusCode >= 400) {
  return stop('error', {}, statusCode, parsed, { http_error: true });
}

if (parsed && parsed.duplicate === true) {
  return stop('duplicate', {}, statusCode, parsed);
}

if (!parsed || parsed.ok !== true) {
  return stop('error', {}, statusCode, parsed);
}

return [{
  json: {
    route: 'agent',
    api_status: statusCode,
    normalized: norm,
    enrichment: {
      tenant_id: parsed.tenantId ?? null,
      customer_id: parsed.customerId ?? null,
      message_id: parsed.messageId ?? null,
      correlation_id: norm.correlation_id,
      conversation_context: parsed.conversationContext ?? null,
      agent_dispatch: parsed.agentDispatch ?? null,
    },
    core_response: parsed,
  },
}];
