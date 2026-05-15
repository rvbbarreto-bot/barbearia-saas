# P2.3 — Operação assistida (WhatsApp / N8N / auditoria / lembretes)

**Branch:** `feature/p2-2-web-outbox-whatsapp-operational` (continuação da P2.2).  
**Pré-requisito formal:** GATE 0 da **P2.2.1** — bateria + CSV + evidências em `docs/P2_2_EVIDENCIAS_PORTAL_OUTBOX.md` e **capturas PNG** listadas em `docs/evidencias/gate0_p2_2_1/README.md` (o PO exige anexos visuais reais).

## Objectivo

Primeiro pacote de **operação assistida**: evento inbound tratado com deduplicação, trilha em **auditoria operacional**, mensagens na **outbox**, **lembrete 24h** antes do `starts_at`, e QA reprodutível **CT-P2-300 … CT-P2-332**.

## Como executar o QA P2.3

```powershell
Set-Location <raiz-do-repo>
docker compose build api
docker compose up -d --force-recreate api
# opcional: npm run db:migrate  (se migrations pendentes)
.\scripts\qa-p2-3-operational-assisted-battery.ps1 -ApiBase http://localhost:3000
```

- **CSV:** `docs/QA_API_P2_3_OPERATIONAL_ASSISTED_RESULTS.csv` — `expected_http` vs `actual_http`, coluna `result` PASS/FAIL.
- **Exit:** `0` sucesso; `≠0` falha.
- **Regressões embutidas:** CT-P2-330 (P2.2.1), 331 (P2.1), 332 (P1).

## Webhook inbound (smoke)

- **Rota:** `POST /webhooks/whatsapp/inbound`
- **Headers:** `x-webhook-instance` (instância Evolution cadastrada em `tenant_integrations`), `x-webhook-token` (token do tenant quando não há HMAC).
- **Corpo:** `phone`, `message`, `external_message_id` (recomendado para dedup); opcional `name`.
- **Duplicado:** mesmo `external_message_id` → HTTP 200 `{ "ok": true, "duplicate": true }`; auditoria `inbound_duplicate_ignored`.
- **Válido:** HTTP 200 `{ "ok": true, "duplicate": false, ... }`; auditoria `inbound_message_received` (metadata sem segredos em claro).

## Auditoria operacional

- **Endpoints:** `GET /api/v1/operational-audit-events` e alias `GET /api/v1/operational-audit/events`.
- **RBAC:** `operationalAudit.read` (mín. `attendant`) + JWT + `x-tenant-id` coerente.
- **Filtros:** `event_type`, `entity_type`, `entity_id`, `correlation_id`, `request_id`, `date_from` / `date_to` (ou `from` / `to` conforme OpenAPI), `limit`, `page`/`offset` conforme implementação.
- **Testes de segurança:** sem token → **401**; tenant inválido → **403** `TENANT_MISMATCH`; sem permissão → **403**; resposta sanitizada; isolamento cross-tenant (RLS + middleware).

## Lembrete 24h

- **Agendamento:** após `PATCH /api/v1/appointments/:id/confirm`, se `starts_at - 24h` for no futuro, insere job `reminder_24h` em `notification_jobs`.
- **Processamento:** enfileira WhatsApp na outbox com mensagem padrão PT (nome, data/hora, profissional); `idempotency_key = reminder_24h:<appointment_id>`.
- **Auditoria:** `reminder_enqueued` ou `reminder_skipped_duplicate` quando aplicável.
- **Exclusões:** não agenda envio útil para `cancelled`, `completed`, `no_show` — jobs pendentes do agendamento são removidos nas transições de estado.
- **Timezone:** lembrete D-1 continua baseado no fuso do tenant; o **gatilho 24h** usa `starts_at` em UTC menos 24h (alinhado ao critério de aceite P2.3); copy da mensagem usa contexto do agendamento.

## N8N

Ver `docs/P2_FLUXO_WHATSAPP_N8N.md` e o workflow `n8n/workflows/03_QA_Barbearia_Evolution_SendText_Smoke.json`.

## Débitos / riscos

- **GATE P2.2.1:** confirmar que todas as PNGs do portal foram anexadas em `docs/evidencias/gate0_p2_2_1/` antes do fecho PO formal.
- **Evolution real:** em dev, o worker pode registar `fetch failed` (provider inacessível); outbox permanece em retry — não invalida dedup/auditoria/reminder enfileirado.
- **CT-P2-317:** retry manual só corre se existir linha `failed`/`dead`; caso contrário o script marca SKIP com PASS.
