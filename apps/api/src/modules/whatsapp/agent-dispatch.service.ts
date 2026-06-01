/**
 * Debounce de disparo do agente IA (WF02) — última mensagem da rajada vence.
 */

import { redis } from '../../infra/redis/client.js';
import { getAgentDebounceMs } from './whatsapp-conversation.config.js';

const DEBOUNCE_PREFIX = 'wa:deb';

export type AgentDispatch = {
  /** Se true, WF01 pode chamar WF02 sem Wait. */
  should_dispatch_immediately: boolean;
  wait_ms: number;
  /** message_id do inbound atual — comparar após Wait. */
  dispatch_token: string;
};

function debounceKey(tenantId: string, customerId: string): string {
  return `${DEBOUNCE_PREFIX}:${tenantId}:${customerId}`;
}

export async function registerAgentDispatch(
  tenantId: string,
  customerId: string,
  messageId: string,
): Promise<AgentDispatch> {
  const waitMs = getAgentDebounceMs();
  if (waitMs <= 0) {
    return {
      should_dispatch_immediately: true,
      wait_ms: 0,
      dispatch_token: messageId,
    };
  }

  const key = debounceKey(tenantId, customerId);
  await redis.set(key, messageId, 'PX', waitMs);

  return {
    should_dispatch_immediately: false,
    wait_ms: waitMs,
    dispatch_token: messageId,
  };
}

/**
 * Após Wait no n8n: dispara agente só se este message_id ainda é o último da janela.
 * Se a chave expirou sem nova mensagem, considera-se o token vencedor.
 */
export async function shouldDispatchAgent(
  tenantId: string,
  customerId: string,
  dispatchToken: string,
): Promise<boolean> {
  const waitMs = getAgentDebounceMs();
  if (waitMs <= 0) return true;

  const current = await redis.get(debounceKey(tenantId, customerId));
  if (current === null) return true;
  return current === dispatchToken;
}
