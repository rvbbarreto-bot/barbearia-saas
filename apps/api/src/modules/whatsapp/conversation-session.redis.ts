/**
 * Sessão quente de conversa WhatsApp (Redis).
 * Postgres permanece fonte da verdade; Redis acelera leitura e debounce.
 */

import { redis } from '../../infra/redis/client.js';
import type { ConversationContext, ConversationTurn } from './conversation-context.service.js';
import {
  getConversationRedisEnabled,
  getConversationTtlSeconds,
  getConversationMaxMessages,
} from './whatsapp-conversation.config.js';

const KEY_PREFIX = 'wa:conv';

export type SchedulingDraft = Record<string, unknown>;

export type RedisConversationSession = {
  recent_messages: ConversationTurn[];
  scheduling_draft: SchedulingDraft;
  updated_at: string;
};

function sessionKey(tenantId: string, customerId: string): string {
  return `${KEY_PREFIX}:${tenantId}:${customerId}`;
}

export function turnsToSessionText(turns: ConversationTurn[]): string {
  return turns
    .filter((m) => m.body.length > 0)
    .map((m) => `${m.direction === 'in' ? 'Cliente' : 'Barbearia'}: ${m.body}`)
    .join('\n');
}

export function contextFromSession(session: RedisConversationSession): ConversationContext {
  const recent_messages = session.recent_messages;
  return {
    recent_messages,
    session_text: turnsToSessionText(recent_messages),
    message_count: recent_messages.length,
    source: 'redis',
    scheduling_draft: Object.keys(session.scheduling_draft).length
      ? session.scheduling_draft
      : undefined,
  };
}

export async function appendConversationTurn(
  tenantId: string,
  customerId: string,
  turn: ConversationTurn,
  opts?: { scheduling_draft?: SchedulingDraft },
): Promise<void> {
  if (!getConversationRedisEnabled()) return;

  const key = sessionKey(tenantId, customerId);
  const ttl = getConversationTtlSeconds();
  const maxMessages = getConversationMaxMessages();

  const raw = await redis.get(key);
  let session: RedisConversationSession;
  if (raw) {
    try {
      session = JSON.parse(raw) as RedisConversationSession;
    } catch {
      session = { recent_messages: [], scheduling_draft: {}, updated_at: new Date().toISOString() };
    }
  } else {
    session = { recent_messages: [], scheduling_draft: {}, updated_at: new Date().toISOString() };
  }

  session.recent_messages.push(turn);
  if (session.recent_messages.length > maxMessages) {
    session.recent_messages = session.recent_messages.slice(-maxMessages);
  }
  if (opts?.scheduling_draft) {
    session.scheduling_draft = { ...session.scheduling_draft, ...opts.scheduling_draft };
  }
  session.updated_at = new Date().toISOString();

  await redis.set(key, JSON.stringify(session), 'EX', ttl);
}

/** Repopula Redis a partir de contexto Postgres (warm-up após miss). */
export async function seedConversationSession(
  tenantId: string,
  customerId: string,
  context: ConversationContext,
  schedulingDraft?: SchedulingDraft,
): Promise<void> {
  if (!getConversationRedisEnabled()) return;

  const session: RedisConversationSession = {
    recent_messages: context.recent_messages,
    scheduling_draft: schedulingDraft ?? context.scheduling_draft ?? {},
    updated_at: new Date().toISOString(),
  };
  await redis.set(sessionKey(tenantId, customerId), JSON.stringify(session), 'EX', getConversationTtlSeconds());
}

export async function getConversationSession(
  tenantId: string,
  customerId: string,
): Promise<RedisConversationSession | null> {
  if (!getConversationRedisEnabled()) return null;

  const raw = await redis.get(sessionKey(tenantId, customerId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RedisConversationSession;
  } catch {
    return null;
  }
}

export async function deleteConversationSession(
  tenantId: string,
  customerId: string,
): Promise<void> {
  if (!getConversationRedisEnabled()) return;
  await redis.del(sessionKey(tenantId, customerId));
}
