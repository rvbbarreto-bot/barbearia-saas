/** Mensagem amigável para operadores a partir de `last_error` técnico do outbox. */
export function formatOutboxLastError(raw: string | null | undefined): {
  friendly: string;
  technical: string | null;
} {
  if (!raw || !raw.trim()) {
    return { friendly: '—', technical: null };
  }
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (lower.includes('fetch failed') || lower.includes('econnrefused') || lower.includes('network')) {
    return {
      friendly: 'Provedor WhatsApp indisponível ou mal configurado. A mensagem permanece na fila para nova tentativa.',
      technical: t,
    };
  }
  if (lower.includes('timeout') || lower.includes('etimedout')) {
    return {
      friendly: 'Tempo esgotado ao contactar o provedor. Será feita nova tentativa automaticamente.',
      technical: t,
    };
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid token')) {
    return {
      friendly: 'Credenciais do provedor inválidas. Peça ao administrador para rever a integração Evolution.',
      technical: t,
    };
  }
  if (lower.includes('simulated provider failure')) {
    return {
      friendly: 'Falha simulada em ambiente de testes (QA).',
      technical: t,
    };
  }
  return { friendly: t.length > 120 ? `${t.slice(0, 117)}…` : t, technical: t.length > 120 ? t : null };
}
