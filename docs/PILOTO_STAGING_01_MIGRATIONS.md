# PILOTO-STAGING-01 — Migrations e `_migrations`

## Risco documentado

Quando o Postgres é inicializado via `docker-entrypoint-initdb.d` (volume novo), **todos** os ficheiros `database/migrations/*.sql` são aplicados no primeiro boot, mas a tabela de controlo **`_migrations` pode ficar vazia**.

Se alguém executar depois:

```bash
npm run db:migrate
```

o script tentará reaplicar migrations já presentes no schema → erro (ex.: `tenant_status already exists`).

## Regra operacional (staging)

| Estado do volume | Ação |
|------------------|------|
| Postgres **novo** (initdb aplicou SQL) | **Não** correr `db:migrate` às cegas. Opcional: `npm run db:migrate:backfill` após inspecionar schema. |
| Postgres **vazio** sem initdb | Aplicar migrations via `migrate.sh` / CI `psql` ordenado **ou** initdb — **uma** via apenas. |
| Staging existente (schema conhecido) | `db:migrate:dry-run` primeiro; só aplicar pendentes reais. |

## Comandos seguros

```bash
# Inspecionar registry (sem alterar)
npm run db:migrate:dry-run

# Backfill _migrations quando schema já existe (confirmar com DBA/DevOps)
npm run db:migrate:backfill

# Seed demo (apenas QA/staging)
npm run db:migrate:seed
```

## Evidência exigida PO

Anexar saída de `db:migrate:dry-run` e confirmação do estado de `_migrations` antes de qualquer backfill em staging.
