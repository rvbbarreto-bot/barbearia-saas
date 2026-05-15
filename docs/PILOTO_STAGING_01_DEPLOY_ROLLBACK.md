# PILOTO-STAGING-01 — Deploy e rollback (staging)

**Branch oficial:** `piloto-staging-01`  
**Repositório:** https://github.com/rvbbarreto-bot/barbearia-saas

## Arquitetura Web em staging

O portal é servido pelo container **web** (nginx):

- SPA estática em `/`
- Proxy interno `/api/`, `/auth/`, `/health`, `/webhooks/` → serviço `api:3000`
- Exposição externa via **Traefik** (`WEB_HOST`) ou porta publicada (overlay local)

Sem o serviço `web`, o staging **não** entrega portal operacional — apenas API.

## Pré-requisitos

- Docker Engine 24+ e Compose v2
- Traefik (recomendado) com rede `barbearia` + certificados
- `.env.staging` a partir de `.env.staging.example` (**nunca** commitar)
- Imagens semver: `API_IMAGE`, `WEB_IMAGE` (registry) **ou** overlay build (abaixo)

## Opção A — Registry (VPS/cloud)

```bash
git clone https://github.com/rvbbarreto-bot/barbearia-saas.git
cd barbearia-saas
git checkout piloto-staging-01
cp .env.staging.example .env.staging
# Preencher secrets + API_IMAGE + WEB_IMAGE + *_HOST

docker compose -f docker-compose.staging.yml --env-file .env.staging up -d
```

## Opção B — Build local (homologação fábrica / VPS sem GHCR)

```bash
docker compose -f docker-compose.staging.yml -f docker-compose.staging.build.yml \
  --env-file .env.staging up -d --build
```

## Healthchecks obrigatórios

| Endpoint | Esperado |
|----------|----------|
| `GET /health` | `200` `{ "status": "ok" }` |
| `GET /health/ready` | `200` (Postgres + Redis) |
| `GET /database/health` | `200` `{ "status":"ok","database":"connected" }` |
| Web `GET /` | `200` HTML SPA |

```bash
curl -sf "https://${API_HOST}/health"
curl -sf "https://${API_HOST}/health/ready"
curl -sf "https://${API_HOST}/database/health"
curl -sf "https://${WEB_HOST}/"
```

## URLs (preencher após deploy)

| Serviço | Variável | URL staging |
|---------|----------|-------------|
| API | `API_HOST` | `https://________________` |
| Web | `WEB_HOST` | `https://________________` |
| n8n | `N8N_HOST` | `https://________________` |
| Evolution | `EVOLUTION_API_URL` | (externo) |

## Migrations

Ver `docs/PILOTO_STAGING_01_MIGRATIONS.md` — **não** executar `db:migrate` às cegas se initdb já aplicou schema.

## n8n

Ver `docs/PILOTO_STAGING_01_N8N.md` — import UI, `active=false` até PO.

## Worker outbox

- Processo embutido na API (`OUTBOX_POLL_INTERVAL_MS`)
- Requer `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` em `.env.staging`
- Logs: `docker logs barbearia-api-staging 2>&1 | grep outbox-worker`

## Rollback

```bash
docker compose -f docker-compose.staging.yml --env-file .env.staging down
# Reverter API_IMAGE / WEB_IMAGE para tag anterior em .env.staging
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d
curl -sf "https://${API_HOST}/health/ready"
# Restaurar Postgres do volume backup_data_staging se necessário (ops/backup/backup.sh)
```

## Logs (correlation_id / request_id)

```bash
docker logs barbearia-api-staging --since 2h 2>&1 | tee logs-api-staging.txt
docker logs barbearia-web-staging --since 2h 2>&1 | tee logs-web-staging.txt
docker logs barbearia-n8n-staging --since 2h 2>&1 | tee logs-n8n-staging.txt
```

Filtrar: `request_id`, `correlation_id`, `outbox_id`, `tenant_id`, `403`, `WEBHOOK_`.

## Segurança

- `NODE_ENV=staging` → Swagger `/docs` **desativado**
- Repo recomendado **Private** ou waiver em `docs/WAIVER_REPO_PUBLICO.md`
- Gitleaks + npm audit no CI da branch `piloto-staging-01`
