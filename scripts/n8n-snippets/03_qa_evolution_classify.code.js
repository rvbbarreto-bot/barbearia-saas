const raw = $input.first().json ?? {};

function unwrapBody(x) {
  if (!x || typeof x !== 'object') return {};
  if (x.body && typeof x.body === 'object') return x.body;
  return x;
}

const payload = unwrapBody(raw);

const statusCode =
  typeof raw.statusCode === 'number'
    ? raw.statusCode
    : typeof raw.code === 'number' && raw.code >= 100 && raw.code <= 599
      ? raw.code
      : typeof payload.status === 'number' && payload.status >= 100 && payload.status <= 599
        ? payload.status
        : null;

const evolutionShapeOk =
  !!(payload.key && (payload.key.id || payload.key.remoteJid)) ||
  payload.messageType === 'conversation' ||
  !!(payload.message && Object.prototype.hasOwnProperty.call(payload.message, 'conversation'));

const httpErr = statusCode !== null && statusCode >= 400;
const http2xx = statusCode !== null && statusCode >= 200 && statusCode < 300;

const pend = String(payload.status || '').toUpperCase() === 'PENDING';

function scrub(obj) {
  try {
    const s = JSON.parse(JSON.stringify(obj));
    if (s && typeof s === 'object' && s.apikey) s.apikey = '[REDACTED]';
    return s;
  } catch {
    return {};
  }
}

if (raw.error && !(http2xx || evolutionShapeOk)) {
  const em = raw.error && raw.error.message ? String(raw.error.message) : JSON.stringify(raw.error);
  return [
    {
      json: {
        ok: false,
        status: statusCode ?? raw.error.statusCode ?? 500,
        message: em || 'Erro HTTP n8n / Evolution',
      },
    },
  ];
}

if (httpErr) {
  return [
    {
      json: {
        ok: false,
        status: statusCode,
        message: payload.message || payload.error || 'Erro HTTP na chamada Evolution',
        body: scrub(payload),
      },
    },
  ];
}

if (http2xx || evolutionShapeOk || (pend && !!payload.key?.id)) {
  return [
    {
      json: {
        ok: true,
        status: statusCode ?? (evolutionShapeOk || pend ? 200 : null),
        message: 'Envio Evolution OK (verificar WhatsApp QA)',
        evolutionary_status: payload.status ?? null,
        messageType: payload.messageType ?? null,
      },
    },
  ];
}

return [
  {
    json: {
      ok: false,
      status: statusCode,
      message: payload.message || payload.error || 'Resposta não reconhecida como sucesso',
      body: scrub(payload),
    },
  },
];
