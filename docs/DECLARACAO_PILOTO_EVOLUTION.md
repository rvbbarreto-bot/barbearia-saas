# Declaração formal — Piloto sem envio real WhatsApp (Evolution)

**Data:** 2026-05-15  
**Branch:** `feature/p2-2-web-outbox-whatsapp-operational`  
**Commit:** `bf4abaa`

## Decisão

O piloto controlado **MVP operacional** será homologado **sem envio real de mensagens WhatsApp** até que o ambiente de staging disponha de:

| Variável | Obrigatória |
|----------|-------------|
| `EVOLUTION_API_URL` | URL HTTPS da instância Evolution |
| `EVOLUTION_API_KEY` | Token/API key (somente em `.env`, nunca no repositório) |

## Causa raiz do `fetch failed`

- Valor actual em desenvolvimento: placeholder `https://evolution.example.com` (`.env.example`).
- Worker outbox **está operacional** (poll, retry, transição `pending` → `failed`).
- Mensagens **não são perdidas**; permanecem em `message_outbox` com `last_error` registado.
- Portal exibe erro **amigável** ao operador + bloco de diagnóstico técnico.

## Comportamento aceite no piloto (sem Evolution)

| Fluxo | Aceite |
|-------|--------|
| Enfileiramento (agendamento confirmado) | Sim — registo em outbox |
| Worker processa fila | Sim |
| Envio ao provider | **Não** — falha controlada documentada |
| Retry manual (admin/manager) | Sim — API e UI |
| RBAC retry atendente | Sim — 403 API + UI sem botão |

## Plano para homologação com WhatsApp real

| Item | Responsável | Prazo estimado |
|------|-------------|----------------|
| Provisionar Evolution staging | DevOps / cliente | 2–3 d.u. após credenciais |
| Preencher `.env` staging | DevOps | 0,5 d.u. |
| Smoke: 1 mensagem `sent` | QA | 0,5 d.u. |
| Evidência: log worker + status `sent` | Fábrica | incluso no smoke |

**Variáveis necessárias:** ver `.env.example` secção Evolution e `docs/P2_FLUXO_WHATSAPP_N8N.md`.
