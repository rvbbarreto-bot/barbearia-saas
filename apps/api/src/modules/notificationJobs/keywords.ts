/**
 * Deteção de pedidos de opt-out em texto livre (WhatsApp inbound).
 * Normalização: minúsculas, sem acentos para matching estável.
 */

const NFKD = '\u0300-\u036f';

export function normalizeInboundText(text: string): string {
  return text
    .normalize('NFD')
    .replace(new RegExp(`[${NFKD}]`, 'g'), '')
    .toLowerCase()
    .trim();
}

/** Frases / palavras que revogam marketing + recall no canal WhatsApp. */
const OPT_OUT_RULES: readonly { id: string; test: (n: string) => boolean }[] = [
  { id: 'parar', test: (n) => /\bparar\b/.test(n) },
  { id: 'sair', test: (n) => /\bsair\b/.test(n) },
  { id: 'cancelar mensagens', test: (n) => n.includes('cancelar mensagens') },
  { id: 'nao quero receber', test: (n) => n.includes('nao quero receber') },
  { id: 'stop', test: (n) => /\bstop\b/.test(n) },
];

/**
 * @returns identificador da regra correspondente ou null
 */
export function matchOptOutKeyword(rawMessage: string): string | null {
  const n = normalizeInboundText(rawMessage);
  for (const rule of OPT_OUT_RULES) {
    if (rule.test(n)) return rule.id;
  }
  return null;
}
