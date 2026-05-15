# P2 — Runbook de suporte

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
