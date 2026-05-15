# P2 — Fluxo WhatsApp / n8n

## Objectivo

Cliente no WhatsApp → inbound dedup → roteamento (n8n) → disponibilidade (API) → escolha de horário → criação de appointment → confirmação via outbox → visível no portal → eventos de auditoria.

## Entregáveis

- Workflow n8n versionado em `n8n/workflows/` (import/export JSON).
- Payloads de exemplo inbound/outbound e variáveis de ambiente documentadas.
- Procedimento de smoke reprodutível com massa demo/QA.

### Smoke QA Evolution (P2.3)

- **Ficheiro:** `n8n/workflows/03_QA_Barbearia_Evolution_SendText_Smoke.json` — importar no n8n (Menu → Import from File).
- **Variáveis úteis (exemplo):** URL base da API (`http://barbearia-api:3000` ou `http://localhost:3000` conforme rede Docker), cabeçalhos `x-webhook-instance: demo-qa-inbound`, `x-webhook-token` igual ao configurado no tenant (seed QA: `demo_webhook_token_change_me`).
- **Chamada mínima à API (sem n8n):** `POST /webhooks/whatsapp/inbound` com JSON `phone`, `message`, `external_message_id` (único), opcional `name`; repetir o mesmo `external_message_id` deve devolver `{ "ok": true, "duplicate": true }` sem segunda linha de mensagem.
- **Instrução:** alinhar o nó HTTP Request ao contrato acima; correlacionar com `GET /api/v1/operational-audit-events?event_type=inbound_message_received` (JWT + `x-tenant-id`).

## Intenções mínimas

Agendar, consultar horários, confirmar, cancelar, remarcar, falar com atendente, fora de contexto, fallback humano.

*(Detalhe técnico, diagramas e smoke E2E: **P2.3 Operação assistida** — ver `docs/P2_3_OPERACAO_ASSISTIDA.md` e `docs/P2_3_EVIDENCIAS_WHATSAPP_AUDITORIA_REMINDER.md`.)*
