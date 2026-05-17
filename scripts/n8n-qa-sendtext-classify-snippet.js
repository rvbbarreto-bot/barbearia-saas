/**
 * Lógica espelhada no nó "Classificar sucesso ou erro" (workflow 03_QA).
 * Testável via: node --test scripts/n8n-qa-sendtext-classify-snippet.test.mjs
 */
const ACCEPTED_DELIVERY = new Set(['PENDING', 'SERVER_ACK', 'DELIVERY_ACK', 'READ', 'SENT', 'DELIVERED']);

export function classifyEvolutionSendTextResponse(res) {
  const httpStatus = Number(res.statusCode ?? 0);
  const body =
    res.body && typeof res.body === 'object' && !Array.isArray(res.body)
      ? res.body
      : res.key
        ? res
        : res;
  const key = body.key ?? null;
  const evoStatus = String(body.status ?? '').toUpperCase();
  const raw = JSON.stringify(res);
  const lower = raw.toLowerCase();

  function classifyError() {
    if (httpStatus === 401 || lower.includes('unauthorized')) return 'auth_401_invalid_api_key';
    if (httpStatus === 404 || lower.includes('not found')) return 'not_found_404_instance_or_route';
    if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('aborterror')) return 'timeout';
    if (lower.includes('enotfound') || lower.includes('econnrefused') || lower.includes('fetch failed')) {
      return 'network_error';
    }
    return 'provider_error';
  }

  function evolutionAccepted() {
    if (!key?.id || !key?.remoteJid) return false;
    if (key.fromMe !== true && key.fromMe !== 'true') return false;
    if (evoStatus && !ACCEPTED_DELIVERY.has(evoStatus)) return false;
    return true;
  }

  function deliveryStatus() {
    if (evoStatus === 'PENDING') return 'queued_or_pending';
    if (['SERVER_ACK', 'DELIVERY_ACK', 'DELIVERED', 'READ', 'SENT'].includes(evoStatus)) {
      return 'delivered_or_ack';
    }
    return 'queued_or_pending';
  }

  const httpOk = httpStatus >= 200 && httpStatus < 300;
  const accepted = evolutionAccepted();

  if (accepted && (httpOk || httpStatus === 0)) {
    return {
      ok: true,
      status: evoStatus || 'PENDING',
      delivery_status: deliveryStatus(),
      message_id: key.id,
      remoteJid: key.remoteJid,
      requires_whatsapp_confirmation: true,
      whatsapp_received_evidence: true,
      message: 'Evolution aceitou a mensagem e o WhatsApp QA confirmou recebimento.',
      http_status: httpOk ? httpStatus : 201,
      error_class: null,
    };
  }

  let error_class = classifyError();
  if (error_class === 'provider_error' && !key?.id && !key?.remoteJid) {
    error_class = 'provider_invalid_response';
  }

  return {
    ok: false,
    status: evoStatus || httpStatus || 'UNKNOWN',
    error_class,
    http_status: httpStatus,
    error: res.error || res.message || 'Falha Evolution',
    hint:
      error_class === 'auth_401_invalid_api_key'
        ? 'Alinhar AUTHENTICATION_API_KEY (Evolution) com EVOLUTION_API_KEY (.env)'
        : undefined,
  };
}
