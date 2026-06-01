function parseBoolish(val: unknown, defaultValue: boolean): boolean {
  if (val === undefined || val === '') return defaultValue;
  const s = String(val).toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'yes';
}

export function getConversationRedisEnabled(): boolean {
  return parseBoolish(process.env.WHATSAPP_CONVERSATION_REDIS_ENABLED, true);
}

export function getConversationTtlSeconds(): number {
  const n = Number(process.env.WHATSAPP_CONVERSATION_TTL_SECONDS ?? 21_600);
  return Number.isFinite(n) && n > 60 ? Math.floor(n) : 21_600;
}

export function getConversationMaxMessages(): number {
  const n = Number(process.env.WHATSAPP_CONVERSATION_MAX_MESSAGES ?? 24);
  return Number.isFinite(n) && n >= 4 ? Math.min(Math.floor(n), 64) : 24;
}

export function getAgentDebounceMs(): number {
  const n = Number(process.env.WHATSAPP_AGENT_DEBOUNCE_MS ?? 2500);
  if (!Number.isFinite(n) || n < 0) return 2500;
  return Math.floor(n);
}
