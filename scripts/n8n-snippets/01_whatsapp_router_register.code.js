const norm = $input.first().json;

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

async function fetchWithTimeout(url, init, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('FETCH_TIMEOUT')), ms);
    fetch(url, init)
      .then((r) => {
        clearTimeout(t);
        resolve(r);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

const baseUrlRaw = String($env.API_BASE_URL || '').replace(/\/$/, '');
if (!baseUrlRaw) {
  console.log('[router] API_BASE_URL ausente');
  return stop('config_error', {}, null, null, { error_hint: 'API_BASE_URL' });
}

const webhookToken = String($env.N8N_WEBHOOK_TOKEN || '').trim();
if (!webhookToken) {
  console.log('[router] N8N_WEBHOOK_TOKEN ausente no container n8n');
  return stop('config_error', {}, null, null, { error_hint: 'N8N_WEBHOOK_TOKEN' });
}

const hmacSecret = String($env.N8N_HMAC_SECRET || '').trim();
if (hmacSecret.length > 0) {
  console.log('[router] N8N_HMAC_SECRET definido — este workflow versionado envia só x-webhook-token (sem crypto no Code node). Use tenant com token ou proxy que assine HMAC.');
  return stop('config_error', {}, null, null, { error_hint: 'HMAC_requires_external_signer' });
}

const url = `${baseUrlRaw}/webhooks/whatsapp/inbound`;

const coreBodyObj = {
  phone: norm.phone,
  name: norm.push_name ?? null,
  message: norm.text,
  external_message_id: norm.provider_message_id ?? null,
};

const bodyJson = JSON.stringify(coreBodyObj);

const headers = {
  'Content-Type': 'application/json',
  'x-webhook-instance': String(norm.instance),
  'x-correlation-id': String(norm.correlation_id),
  'x-webhook-token': webhookToken,
};

let timeoutMs = parseInt(String($env.API_TIMEOUT_MS || '15000'), 10);
if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) timeoutMs = 15000;
if (timeoutMs > 120000) timeoutMs = 120000;

let resp;
try {
  resp = await fetchWithTimeout(url, { method: 'POST', headers, body: bodyJson }, timeoutMs);
} catch (e) {
  const msg = e && e.message ? String(e.message) : String(e);
  console.log('[router] fetch falhou:', msg);
  console.log('[router] ctx', JSON.stringify({ instance: norm.instance, correlation_id: norm.correlation_id }));
  if (msg.includes('FETCH_TIMEOUT')) {
    return stop('error', {}, 408, { error: 'TIMEOUT' }, { error_hint: 'timeout' });
  }
  return stop('error', {}, null, null, { error_hint: 'network' });
}

let parsed = null;
const rawTxt = await resp.text();
try {
  parsed = rawTxt ? JSON.parse(rawTxt) : null;
} catch (_) {
  parsed = { raw: rawTxt };
}

const logSafe = {
  instance: norm.instance,
  correlation_id: norm.correlation_id,
  status: resp.status,
  code: parsed && parsed.error ? parsed.error : null,
};

if (!resp.ok) {
  console.log('[router] Core HTTP erro |', JSON.stringify(logSafe));
  return stop('error', {}, resp.status, parsed, { http_error: true });
}

if (parsed && parsed.duplicate === true) {
  console.log('[router] duplicate |', JSON.stringify(logSafe));
  return stop('duplicate', {}, resp.status, parsed);
}

if (!parsed || parsed.ok !== true) {
  console.log('[router] Core resposta inesperada |', JSON.stringify(logSafe));
  return stop('error', {}, resp.status, parsed);
}

return [{
  json: {
    route: 'agent',
    api_status: resp.status,
    normalized: norm,
    enrichment: {
      tenant_id: parsed.tenantId ?? null,
      customer_id: parsed.customerId ?? null,
      message_id: parsed.messageId ?? null,
      correlation_id: norm.correlation_id,
    },
    core_response: parsed,
  },
}];
