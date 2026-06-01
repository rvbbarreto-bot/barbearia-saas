import type pg from 'pg';
import {
  contextFromSession,
  getConversationSession,
  seedConversationSession,
  turnsToSessionText,
  type SchedulingDraft,
} from './conversation-session.redis.js';
import { getConversationRedisEnabled } from './whatsapp-conversation.config.js';

export type ConversationTurn = {
  direction: 'in' | 'out';
  body: string;
  at: string;
};

export type ConversationContext = {
  recent_messages: ConversationTurn[];
  /** Texto concatenado para o agente (multi-turn). */
  session_text: string;
  message_count: number;
  /** Origem do contexto devolvido ao n8n. */
  source?: 'redis' | 'postgres';
  scheduling_draft?: SchedulingDraft;
};

const DEFAULT_WINDOW_MINUTES = 180;
const DEFAULT_MAX_MESSAGES = 24;

/**
 * Histórico recente da conversa WhatsApp (in + out) para o agente não ver só a última mensagem.
 */
export async function buildConversationContext(
  client: pg.PoolClient,
  tenantId: string,
  customerId: string,
  opts?: { windowMinutes?: number; maxMessages?: number },
): Promise<ConversationContext> {
  const windowMinutes = opts?.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  const maxMessages = opts?.maxMessages ?? DEFAULT_MAX_MESSAGES;

  const res = await client.query<{
    direction: string;
    body: string;
    created_at: Date;
  }>(
    `SELECT direction, body, created_at
       FROM messages
      WHERE tenant_id = $1::uuid
        AND customer_id = $2::uuid
        AND created_at > now() - make_interval(mins => $3::int)
      ORDER BY created_at ASC
      LIMIT $4`,
    [tenantId, customerId, windowMinutes, maxMessages],
  );

  const recent_messages: ConversationTurn[] = res.rows.map((row) => ({
    direction: row.direction === 'out' ? 'out' : 'in',
    body: String(row.body ?? '').trim(),
    at: new Date(row.created_at).toISOString(),
  }));

  const scheduling_draft = await loadSchedulingDraft(client, tenantId, customerId);

  return {
    recent_messages,
    session_text: turnsToSessionText(recent_messages),
    message_count: recent_messages.length,
    source: 'postgres',
    ...(Object.keys(scheduling_draft).length ? { scheduling_draft } : {}),
  };
}

async function loadSchedulingDraft(
  client: pg.PoolClient,
  tenantId: string,
  customerId: string,
): Promise<SchedulingDraft> {
  const res = await client.query<{ payload: SchedulingDraft }>(
    `SELECT payload FROM conversation_states
      WHERE tenant_id = $1::uuid AND customer_id = $2::uuid AND state_key = 'scheduling_draft'
      LIMIT 1`,
    [tenantId, customerId],
  );
  const payload = res.rows[0]?.payload;
  return payload && typeof payload === 'object' ? payload : {};
}

/**
 * Resolve contexto para o agente: Redis (quente) com fallback Postgres + warm-up Redis.
 */
export async function resolveConversationContext(
  client: pg.PoolClient,
  tenantId: string,
  customerId: string,
): Promise<ConversationContext> {
  if (getConversationRedisEnabled()) {
    const session = await getConversationSession(tenantId, customerId);
    if (session && session.recent_messages.length > 0) {
      return contextFromSession(session);
    }
  }

  const fromPg = await buildConversationContext(client, tenantId, customerId);
  await seedConversationSession(tenantId, customerId, fromPg, fromPg.scheduling_draft);
  return fromPg;
}

/** Atualiza rascunho de agendamento no state (Postgres) e espelha no Redis quando ativo. */
export async function touchSchedulingState(
  client: pg.PoolClient,
  tenantId: string,
  customerId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO conversation_states (tenant_id, customer_id, state_key, payload, updated_at)
     VALUES ($1::uuid, $2::uuid, 'scheduling_draft', $3::jsonb, now())
     ON CONFLICT (tenant_id, customer_id, state_key) DO UPDATE
       SET payload = conversation_states.payload || EXCLUDED.payload,
           updated_at = now()`,
    [tenantId, customerId, JSON.stringify(patch)],
  );

  if (getConversationRedisEnabled()) {
    const session = await getConversationSession(tenantId, customerId);
    const base = session
      ? contextFromSession(session)
      : await buildConversationContext(client, tenantId, customerId);
    await seedConversationSession(tenantId, customerId, base, {
      ...(base.scheduling_draft ?? {}),
      ...patch,
    });
  }
}
