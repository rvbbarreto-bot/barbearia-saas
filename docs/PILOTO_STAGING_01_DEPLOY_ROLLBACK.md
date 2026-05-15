# PILOTO-STAGING-01 — Deploy e rollback (staging)

## Pré-requisitos

- Docker Engine 24+ e Compose v2
- Domínios DNS (opcional Traefik): `API_HOST`, `N8N_HOST`, frontend
- Secrets fora do git: copiar `.env.staging.example` → `.env.staging`
- Imagem API com tag semver: `API_IMAGE=ghcr.io/<org>/barbearia-api:0.x.y` (**não usar `:latest`**)

## Deploy (staging)

```bash
# 1. Clonar branch de piloto
git clone https://github.com/rvbbarreto-bot/barbearia-saas.git
cd barbearia-saas
git checkout feature/p2-2-web-outbox-whatsapp-operational

# 2. Configurar secrets
cp .env.staging.example .env.staging
# Editar: POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET (64+ chars),
# EVOLUTION_API_URL, EVOLUTION_API_KEY, API_IMAGE, CORS_ORIGIN, N8N_*

# 3. Aplicar migrations (volume Postgres vazio OU migrate.sh)
# Primeiro boot: migrations em docker-entrypoint-initdb.d (compose dev)
# Staging: usar scripts/migrate.sh ou pipeline CI com psql ordenado

# 4. Subir stack staging
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d

# 5. Verificar saúde
curl -sf https://<API_HOST>/health
curl -sf https://<API_HOST>/database/health

# 6. Seed QA (opcional)
# database/seeds/001_demo.sql ou scripts de seed documentados no README
```

## URLs esperadas

| Serviço | Local (dev) | Staging (exemplo) |
|---------|-------------|-------------------|
| Web | http://localhost:3001 | https://app-staging.seudominio.com |
| API | http://localhost:3000 | https://api-staging.seudominio.com |
| n8n | http://localhost:5678 | https://n8n-staging.seudominio.com |
| Evolution | — | URL do provider (externo) |

## Worker outbox

O worker roda **dentro do processo API** (poll `OUTBOX_POLL_INTERVAL_MS`). Confirmar:

- `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` definidos em `.env.staging`
- Logs: `docker logs -f barbearia-api-staging 2>&1 | findstr outbox-worker`

## Rollback

```bash
# 1. Parar stack atual
docker compose -f docker-compose.staging.yml --env-file .env.staging down

# 2. Reverter imagem API para tag anterior estável
# Editar .env.staging: API_IMAGE=...:<tag-anterior>

# 3. Restaurar backup Postgres (se necessário)
# Volume: backup_data_staging — script ops/backup/backup.sh

# 4. Subir versão anterior
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d

# 5. Revalidar health
curl -sf https://<API_HOST>/health/ready
```

## Logs (coleta mínima)

```bash
docker logs barbearia-api-staging --since 1h > logs-api-staging.txt
docker logs barbearia-n8n-staging --since 1h > logs-n8n-staging.txt
docker compose -f docker-compose.staging.yml ps
```

Filtrar por: `correlation_id`, `outbox_id`, `tenant_id`, `WEBHOOK_`, `RBAC`, `cross-tenant`.
