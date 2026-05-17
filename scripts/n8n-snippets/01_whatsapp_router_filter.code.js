const envelope = $json ?? {};

const outer = envelope.body !== undefined ? envelope.body : envelope;
const bodyRaw = typeof outer === 'string' ? (() => { try { return JSON.parse(outer); } catch (_) { return {}; } })() : outer;
const body =
  typeof bodyRaw === 'string'
    ? (() => {
        try {
          return JSON.parse(bodyRaw);
        } catch (_) {
          return {};
        }
      })()
    : bodyRaw ?? {};

const ev = body.event ?? body.type ?? '';
if (ev !== 'messages.upsert') return [];

const data = body.data ?? {};
const key = data.key ?? {};
if (key.fromMe === true) return [];

const remoteJid = String(key.remoteJid ?? '');
if (!remoteJid || remoteJid.endsWith('@g.us')) return [];

const msg = data.message ?? {};
const text = String(
  msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedDisplayText ||
    ''
).trim();
if (!text) return [];

const phone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
if (!phone || phone.length < 8) return [];

const providerMessageId = key.id ?? null;
const ts = data.messageTimestamp ?? data.message?.messageTimestamp ?? null;

function instStr(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'object') {
    const x = v.instanceName ?? v.name ?? v.instanceId ?? v.id;
    if (x == null || x === '') return null;
    return String(x).trim();
  }
  return String(v).trim();
}

const candidates = [
  instStr(body.instance),
  instStr(envelope.instance),
  instStr(body.instanceName),
  instStr(data.instanceName),
  instStr(data.instanceId),
  typeof body.sender === 'object'
    ? instStr(body.sender?.instance ?? body.sender?.instanceId)
    : null,
  body.session != null ? String(body.session).trim() : null,
].filter(Boolean);

const instanceIdentifier = candidates[0] ?? null;
if (!instanceIdentifier) {
  console.log('[router] descartado: sem instance_name/instance_id derivável');
  return [];
}

const correlationId = $execution?.id ? String($execution.id) : `n8n-${Date.now()}`;

const instanceKey = instanceIdentifier;

return [{
  json: {
    provider: 'evolution',
    provider_message_id: providerMessageId,
    phone,
    text,
    timestamp: ts,
    push_name: data.pushName ?? null,
    instance_key: instanceKey,
    instance_name: candidates.find((c) => c && !/^\d+$/.test(c)) ?? instanceKey,
    instance_id_hint: (/^\d+$/.test(instanceKey)) ? instanceKey : (data.instanceId ? String(data.instanceId) : null),
    instance: instanceKey,
    correlation_id: correlationId,
    raw_event: body
  }
}];
