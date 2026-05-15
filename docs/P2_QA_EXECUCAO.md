# P2 — Execução de QA

## Branch activa (P2.2 / P2.3)

- **`feature/p2-2-web-outbox-whatsapp-operational`** — Grande Pacote Operacional (portal, outbox, WhatsApp/N8N, QA ampliado). Âmbito: `docs/P2_2_PORTAL_OPERACIONAL.md`; kickoff e evidências: `docs/P2_RELATORIO_MVP_OPERACIONAL.md` §10.

## Primeiro deploy após P2.1

Após `git pull`, com Postgres do Compose em execução e `.env` com `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`:

```powershell
Set-Location <raiz-do-repo>
npm run db:migrate
```

Isto aplica **`103_operational_audit_events.sql`**, **`104_calendar_blocks_created_by.sql`** e demais migrations pendentes via tabela `_migrations` (sem `docker exec` manual ficheiro a ficheiro). Equivalente com `psql` local: `./migrate.sh` (Linux/macOS/WSL).

Se o dry-run (`npm run db:migrate:dry-run`) mostrar **todas** as migrations como pendentes num volume já populado pelo `initdb`, ver **`npm run db:migrate:backfill`** no `README.md` antes de `db:migrate`.

## Script principal (entrega)

```powershell
Set-Location <raiz-do-repo>
.\scripts\qa-api-p2-operational-battery.ps1
```

- **Saída:** `docs/QA_API_P2_OPERATIONAL_RESULTS.csv` (sobrescrito a cada execução).
- **Sucesso:** exit code `0` quando todos os cenários passam.
- **Massa:** migration `099_demo_seed_qa.sql` (tenant `...0001`, `atendente@demo.local` / `admin12345`, profissional João `...4012`, serviço Barba `...4022`).
- **Migrations incrementais (incl. 103 e 104):** com volume Postgres **não** novo, aplicar o fluxo oficial na raiz do repo (Postgres do Compose a correr): `npm run db:migrate` (ou `./migrate.sh` se tiver `psql` local). Ver também **«Primeiro deploy após P2.1»** em `README.md`, `docs/P2_RUNBOOK_SUPORTE.md` e `docs/P2_QA_EXECUCAO.md`.
- **Imagem API:** após alterações de código, `docker compose build api` e `docker compose up -d --force-recreate api` antes da bateria.
- **Parâmetros:** `-ApiBase` (default `http://localhost:3000`), `-TenantId`, IDs de profissional/serviço/cliente se necessário.

O script cobre CT-P2-001, 002, 010, 020, 039–044, 030–035 (incl. RBAC: `professional` **não** pode `no-show`), 050.

## Bateria P2.2.1 (outbox + regressão)

```powershell
Set-Location <raiz-do-repo>
.\scripts\qa-p2-2-web-outbox-whatsapp-battery.ps1
```

- **Saída:** `docs/QA_API_P2_2_OPERATIONAL_RESULTS.csv`
- **Conteúdo:** health, auth, tenant mismatch, outbox (listagem, RBAC, sanitização), availability/time-blocks/appointments (fluxo alinhado à P2.1), regressão `qa-api-negative-battery.ps1` e `qa-api-p2-operational-battery.ps1` (CT-P2-219 e CT-P2-220 no CSV).

Manter a bateria existente reprodutível:

```powershell
.\scripts\qa-api-negative-battery.ps1
```

Não remover nem quebrar este script na P2.

## GATE 0 — Fecho formal P2.2.1 (obrigatório antes da P2.3)

1. **Docker real:** `docker compose ps` com `api`, `postgres`, `redis`, `web` (e `n8n` se aplicável) **healthy**; após mudanças de código API: `docker compose build api` e `docker compose up -d --force-recreate api`.
2. **Bateria:** `.\scripts\qa-p2-2-web-outbox-whatsapp-battery.ps1 -ApiBase http://localhost:3000` → **exit 0**.
3. **CSV:** `docs/QA_API_P2_2_OPERATIONAL_RESULTS.csv` actualizado e versionado (matriz **CT-P2-201 … CT-P2-220** — ver cabeçalho do script e `docs/P2_2_EVIDENCIAS_PORTAL_OUTBOX.md`).
4. **Evidências texto:** `docs/P2_2_EVIDENCIAS_PORTAL_OUTBOX.md` e §10.4 de `docs/P2_RELATORIO_MVP_OPERACIONAL.md` com `git log -1`, `git rev-parse HEAD`, `git status`, `docker compose ps`, `curl.exe /health`, `curl.exe /database/health`, `npm run db:migrate:dry-run`, excerto de `docker logs barbearia-api` (inclui `[outbox-worker]`).
5. **Evidências visuais:** capturas listadas em `docs/evidencias/gate0_p2_2_1/README.md` (Agenda, Outbox, retry, RBAC, erros).
6. **Unitários / Web (regressão local):** `npm run test:unit` em `apps/api`; `npm run typecheck` e `npm run test` em `apps/web`.
7. **PowerShell 5.1:** o script P2.2.1 envia JSON em **UTF-8** (bytes) para corpos com acentos; não copiar `Invoke-WebRequest` antigo para novos scripts.

## P2.3 — QA operação assistida (CT-P2-300 … CT-P2-332)

```powershell
Set-Location <raiz-do-repo>
.\scripts\qa-p2-3-operational-assisted-battery.ps1 -ApiBase http://localhost:3000
```

- **Saída:** `docs/QA_API_P2_3_OPERATIONAL_ASSISTED_RESULTS.csv` (UTF-8 com BOM; sobrescrito a cada execução).
- **Sucesso:** exit code `0` quando todos os casos passam (inclui regressões internas **330** = P2.2.1, **331** = P2.1, **332** = P1).
- **Pré-requisitos:** Postgres do Compose; seed **099** com instância `demo-qa-inbound` e token `demo_webhook_token_change_me` (ver `.env.example` / `apps/api/.env.example`); API reconstruída após alterações de código (`docker compose build api` + `up -d --force-recreate api`).
- **CT 320–324:** consultas SQL via `docker compose exec -T postgres psql` (use `-SkipDockerDbChecks` só se não puder validar jobs/outbox na BD).
- **CT-P2-317:** se não existir mensagem outbox em `failed`/`dead`, o script regista **SKIP** com **PASS** (ambiente sem falha forçada); com linha falhada, executa retry e valida HTTP 200.
- **Matriz e objectivos:** `docs/P2_3_OPERACAO_ASSISTIDA.md`; evidências coladas: `docs/P2_3_EVIDENCIAS_WHATSAPP_AUDITORIA_REMINDER.md`.
