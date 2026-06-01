# ADR 001 — Arquitetura de conversa WhatsApp (SaaS multi-tenant)

**Status:** Aceite  
**Data:** 2026-05-31  
**Autores:** Tech lead (autorizado pelo PO)

## Contexto

O piloto E2E WhatsApp (Evolution → n8n WF01 → Core API → n8n WF02 → outbox) precisa de **multi-turn** confiável, baixo custo de LLM em rajadas e caminho de escala para dezenas/centenas de tenants.

Restrições:

- Multi-tenant com RLS no Postgres.
- Auditoria e portal operacional sobre `messages`.
- Redis já é dependência obrigatória da API (locks, rate limit).
- n8n permanece orquestrador de integração; **não** é store de sessão.

## Decisão

Adotar arquitetura **híbrida em camadas** (Fase 2 do roadmap):

| Camada | Tecnologia | Responsabilidade |
|--------|------------|------------------|
| Verdade durável | **PostgreSQL** (`messages`, `conversation_states`, `webhook_events`) | Persistência, compliance, portal, replay |
| Sessão quente | **Redis** (`wa:conv:*`, `wa:deb:*`) | Janela recente, TTL, debounce de disparo do agente |
| Regras e isolamento | **Core API** | Write-through, montagem de `conversationContext`, debounce, RLS |
| Orquestração | **n8n** (WF01/WF02) | Webhook, Wait + gate de dispatch, agente IA, outbox |

**n8n não persiste histórico.** Recebe `conversationContext` e `agentDispatch` prontos na resposta do inbound (e no GET de confirmação após debounce).

### Chaves Redis

- `wa:conv:{tenant_id}:{customer_id}` — JSON com `recent_messages`, `scheduling_draft`, `updated_at`. TTL 6h.
- `wa:deb:{tenant_id}:{customer_id}` — `message_id` do último inbound; TTL = `WHATSAPP_AGENT_DEBOUNCE_MS`.

### Fluxo inbound (resumo)

1. WF01 → `POST /webhooks/whatsapp/inbound`.
2. Core: dedup → `INSERT messages` → append Redis → `resolveConversationContext` (Redis, fallback PG) → `registerAgentDispatch`.
3. Resposta: `conversationContext`, `agentDispatch` (`should_dispatch_immediately`, `wait_ms`, `dispatch_token`).
4. WF01: se dispatch imediato → WF02; senão **Wait** → `GET /webhooks/whatsapp/agent-dispatch` → WF02 só se token ainda é o último.

### Fase 3 (futuro, sem bloquear MVP)

- Fila (`conversation.inbound`) + worker dedicado; n8n só na borda ou substituído no caminho crítico.
- Particionamento de `messages` por tempo/tenant.

## Alternativas consideradas

| Alternativa | Motivo de rejeição / adiamento |
|-------------|--------------------------------|
| Só Postgres (sem Redis) | OK no piloto; query repetida e sem debounce barato em rajada |
| Redis + estado no n8n | Sem RLS, difícil auditar, estado preso ao workflow |
| Só Redis (sem PG) | Inaceitável para SaaS (auditoria, portal) |
| Debounce só no n8n | Duplica regra de negócio e tenant |

## Consequências

**Positivas**

- Uma fonte da verdade (PG) + leitura rápida (Redis).
- Menos execuções WF02 em mensagens rápidas sequenciais (debounce configurável).
- Evolução para fila/worker sem mudar contrato de `conversationContext`.

**Negativas**

- Consistência eventual Redis ↔ PG (aceitável: PG é autoritativo; Redis reconstruível).
- WF01 ganha ramo Wait + HTTP (mais um nó operacional).

## Configuração

| Variável | Default | Descrição |
|----------|---------|-----------|
| `WHATSAPP_CONVERSATION_REDIS_ENABLED` | `true` | Sessão quente no Redis |
| `WHATSAPP_AGENT_DEBOUNCE_MS` | `2500` | `0` = dispara agente a cada mensagem (comportamento anterior) |
| `WHATSAPP_CONVERSATION_TTL_SECONDS` | `21600` | TTL sessão Redis (6h) |

## Referências

- `apps/api/src/modules/whatsapp/conversation-session.redis.ts`
- `apps/api/src/modules/whatsapp/agent-dispatch.service.ts`
- `n8n/workflows/01_whatsapp_router_multitenant.json`
