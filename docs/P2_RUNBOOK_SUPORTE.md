# P2 — Runbook de suporte

## P2.2 / P2.3 — Grande Pacote Operacional

- **Branch:** `feature/p2-2-web-outbox-whatsapp-operational` (a partir do tip P2.1 `f57b1a3`).
- **Âmbito:** `docs/P2_2_PORTAL_OPERACIONAL.md`; baseline e evidências de arranque: `docs/P2_RELATORIO_MVP_OPERACIONAL.md` §10.
- **Pós-migration / backfill:** smoke (`/health`, `/database/health`) + QA aplicável (P2.1 + P2.2 quando existir).

## Primeiro deploy após P2.1

Objetivo: garantir **`103_operational_audit_events.sql`** e **`104_calendar_blocks_created_by.sql`** (e quaisquer migrations posteriores) em bases **já existentes**, sem comandos ad hoc por ficheiro.

1. `git pull` na versão que contém as migrations.
2. `docker compose up -d` (ou equivalente) até `postgres` **healthy**.
3. Na **raiz do repositório**, com variáveis `POSTGRES_*` no `.env` alinhadas ao Compose:
   - Se `npm run db:migrate:dry-run` listar **todas** as migrations como pendentes mas o volume já tem esquema (típico de `initdb` sem `_migrations`): **`npm run db:migrate:backfill -- --through <último-sql-já-aplicado>`** uma vez (ver `README.md` — «Volumes criados só pelo initdb»), depois **`npm run db:migrate`**.
   - Caso contrário: **`npm run db:migrate`** — aplica apenas o que falta na tabela `_migrations` (via `scripts/migrate-docker.mjs`).
   - Alternativa com `psql` local: **`./migrate.sh`** (mesma semântica).
4. Reconstruir/recriar a API se o código tiver mudado: `docker compose build api && docker compose up -d --force-recreate api`.
5. Smoke: `GET /health`, `GET /database/health`, depois `scripts/qa-api-p2-operational-battery.ps1` (ver `docs/P2_QA_EXECUCAO.md`).

## 1. Subir ambiente

- Seguir `README.md` (Docker Compose ou `setup.ps1`).
- Confirmar serviços: `docker compose ps` (api, web, postgres, redis, n8n **healthy**).
- Health: `GET http://localhost:3000/health` e `GET http://localhost:3000/database/health`.

## 2. Diagnóstico rápido

| Sintoma | Verificar |
| -------- | ---------- |
| 401 / token | Emissão de JWT, expiração, cabeçalho `Authorization` |
| TENANT_REQUIRED / TENANT_MISMATCH | `x-tenant-id` vs JWT; política de resolução P1 |
| 403 | RBAC — papel vs acção |
| 409 conflito de slot | Availability, bloqueios, appointment existente |
| Outbox preso | Estado `pending` + `last_error`; worker; `OUTBOX_FORCE_SEND_FAILURE` apenas em QA |

## 3. Correlation / request

- Correlacionar logs da API e do worker por `request_id` / `correlation_id` (auditoria P2).

## 4. Base de dados

- Validar tenant: `tenant_id` em entidades.
- Migrations: pasta `database/migrations/`; fluxo oficial com rastreamento `_migrations`: **`npm run db:migrate`** (Docker) ou **`./migrate.sh`** (psql local). Ver secção **«Primeiro deploy após P2.1»** acima para **103** e **104**.

## 5. QA P2.1 (API operacional)

- Script: `scripts/qa-api-p2-operational-battery.ps1` (ver `docs/P2_QA_EXECUCAO.md`).
- Resultados: `docs/QA_API_P2_OPERATIONAL_RESULTS.csv`.
- Falhas frequentes: seed `099` não aplicado; `min_advance` esgota slots — o script usa `min_advance_minutes=0` na availability de teste.

## QA P2.2.1 (outbox + appointments + regressões)

- Script: `scripts/qa-p2-2-web-outbox-whatsapp-battery.ps1`; resultados: `docs/QA_API_P2_2_OPERATIONAL_RESULTS.csv`.
- Após alterações na API de outbox ou appointments: `docker compose build api && docker compose up -d --force-recreate api` antes da bateria.
- **Windows PowerShell 5.1:** pedidos `PATCH`/`POST` com JSON que inclua **acentos** devem enviar o corpo como **UTF-8** (bytes); caso contrário a API pode responder **400** com payload vazio no cliente. O script P2.2.1 já aplica esta regra.

## QA P2.3 (webhook inbound, auditoria, reminder 24h, regressões)

- Script: `scripts/qa-p2-3-operational-assisted-battery.ps1`; resultados: `docs/QA_API_P2_3_OPERATIONAL_ASSISTED_RESULTS.csv`.
- **Webhook inbound:** `POST /webhooks/whatsapp/inbound` com `x-webhook-instance` (nome da instância Evolution na integração) e `x-webhook-token` alinhado ao tenant (ou HMAC se configurado). Resposta duplicada: HTTP 200 com `{ "ok": true, "duplicate": true }` — não duplica `webhook_events` nem mensagem/outbox.
- **Auditoria operacional:** `GET /api/v1/operational-audit-events` ou `/api/v1/operational-audit/events` com JWT + `x-tenant-id`; eventos relevantes: `inbound_message_received`, `inbound_duplicate_ignored`, `reminder_enqueued`, `reminder_skipped_duplicate`, `OUTBOX_MANUAL_RETRY` (após retry manual). Sem token → **401**; tenant errado → **403** `TENANT_MISMATCH`; sem `operationalAudit.read` → **403**.
- **Lembrete 24h:** job `reminder_24h` em `notification_jobs` após `PATCH .../confirm` quando `starts_at - 24h` é futuro; processamento enfileira outbox com `idempotency_key = reminder_24h:<appointment_id>`; cancelamento / `complete` / `no-show` remove jobs pendentes do agendamento.
- **Diagnóstico:** `docker logs barbearia-api` (procure `whatsapp_inbound`, `[outbox-worker]`); para contagem de jobs: `docker compose exec -T postgres psql -U … -d … -c "SELECT job_type,status,count(*) FROM notification_jobs WHERE tenant_id='…' GROUP BY 1,2;"`.

Documentação: `docs/P2_3_OPERACAO_ASSISTIDA.md`, `docs/P2_FLUXO_WHATSAPP_N8N.md`, `docs/P2_OUTBOX_OPERACIONAL.md`.
