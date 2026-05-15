# P2 — Execução de QA

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

## Regressão P1

Manter a bateria existente reprodutível:

```powershell
.\scripts\qa-api-negative-battery.ps1
```

Não remover nem quebrar este script na P2.
