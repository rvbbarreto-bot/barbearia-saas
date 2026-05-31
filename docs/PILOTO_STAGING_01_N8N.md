# PILOTO-STAGING-01 — n8n staging

## Onde preencher variáveis

1. Copiar `.env.example` → `.env` na **raiz do repositório** (nunca commitar `.env`).
2. Preencher Evolution e smoke QA (placeholders no exemplo; chave real só local/staging):

| Variável | Serviços | Uso |
|----------|----------|-----|
| `EVOLUTION_API_URL` | `api`, `n8n` | Base URL Evolution |
| `EVOLUTION_INSTANCE` | `api`, `n8n` | Nome da instância conectada |
| `EVOLUTION_API_KEY` | `api`, `n8n` | Secret — não versionar |
| `QA_WHATSAPP_NUMBER` | `n8n` | Workflow smoke `03_QA_…` (default compose: `5511973305448`) |

Referência: `.env.example` e `.env.staging.example`.

## Evolution no Compose (profile — PS-08.4)

Para subir Evolution em `http://localhost:8081` **sem** instalar no host:

```powershell
# .env: EVOLUTION_API_KEY, EVOLUTION_POSTGRES_PASSWORD, EVOLUTION_INSTANCE, QA_WHATSAPP_NUMBER
.\scripts\qa-evolution-up.ps1
docker compose -f docker-compose.yml -f docker-compose.evolution-stack.yml --profile evolution up -d --force-recreate api n8n
.\scripts\qa-evolution-smoke.ps1
```

| Modo | Compose | `EVOLUTION_API_URL` nos containers api/n8n |
|------|---------|---------------------------------------------|
| Host manual | `docker-compose.evolution-local.yml` | `http://host.docker.internal:8081` |
| Profile `evolution` | `docker-compose.evolution-stack.yml` | `http://evolution:8080` |

Imagem pinada: `atendai/evolution-api:v2.2.3` (serviço opcional — não sobe em `docker compose up` sem `--profile evolution`).

## Recriar o n8n após alterar `.env`

```powershell
docker compose -f docker-compose.yml -f docker-compose.evolution-local.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.evolution-local.yml up -d --force-recreate n8n
```

## Validar variáveis no container (sem expor segredo)

```powershell
docker compose exec n8n sh -lc 'echo EVOLUTION_API_URL=$EVOLUTION_API_URL; echo EVOLUTION_INSTANCE=$EVOLUTION_INSTANCE; echo QA_WHATSAPP_NUMBER=$QA_WHATSAPP_NUMBER; if [ -n "$EVOLUTION_API_KEY" ]; then echo EVOLUTION_API_KEY=SET; else echo EVOLUTION_API_KEY=MISSING; fi'
```

Esperado: URL preenchida, `INSTANCE` preenchida, `QA_WHATSAPP_NUMBER=5511973305448` (ou valor do `.env`), `EVOLUTION_API_KEY=SET`.

## Workflow smoke Evolution (não produtivo)

1. Importar `n8n/workflows/03_QA_Barbearia_Evolution_SendText_Smoke.json` na UI (`http://localhost:5679`).
2. Manter **`active=false`** — executar manualmente (Manual Trigger).
3. Reimportar após alterar o JSON no repositório.

Validação automática dos JSON:

```powershell
node scripts/n8n-validate-workflow-import.mjs
PowerShell -ExecutionPolicy Bypass -File scripts/audit-n8n-workflows.ps1
```

## Erros esperados (classificação)

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| `Configuracao ausente no container n8n` | Variáveis só na API ou `.env` sem recreate n8n | Preencher `.env` + `force-recreate n8n` |
| `fetch failed` / timeout | Evolution inacessível do container n8n | Usar `docker-compose.evolution-local.yml`; Evolution no host :8081 |
| HTTP **404** instance | `EVOLUTION_INSTANCE` errada | Alinhar ao nome na Evolution |
| HTTP **401** Unauthorized | API key inválida ou instância errada | Ajustar `EVOLUTION_API_KEY` no `.env` (pendência de credencial, não do workflow) |
| `QA_WHATSAPP_NUMBER invalido` | Formato | Usar `55` + DDD + número (10–11 dígitos) |

## Importação piloto automatizada (PS-08.5)

```powershell
docker compose up -d n8n
# n8n UI :5679 → Settings → n8n API → Create API Key
$env:N8N_API_KEY = 'n8n_api_...'
.\scripts\n8n-import-piloto-workflows.ps1
```

Importa os 4 JSON de `docs/n8n/` (fallback `n8n/workflows/`), força **`active=false`**, remove `pinData`, upsert por nome.

Validação prévia: `node scripts/n8n-validate-workflow-import.mjs`

## Importação staging (UI — alternativa manual)

1. Aceder `https://<N8N_HOST>` (basic auth em `.env.staging`).
2. Importar workflows de `n8n/workflows/` **um a um**.
3. Manter **`active=false`** até validação PO.
4. **Workflow 01:** substituir `SUBSTITUIR_PELO_ID_DO_WORKFLOW_02` no nó *Chamar Agente IA* pelo ID real do workflow **02** após import (obrigatório para QA integrado router → agente).
5. Credenciais Evolution **somente** em variáveis de ambiente do container n8n (nunca no JSON versionado).

## Regras PO

| Workflow | Evolution direto | Produção |
|----------|------------------|----------|
| `03_QA_Barbearia_Evolution_SendText_Smoke` | Sim (smoke isolado) | **Não** — `active=false` |
| `01_whatsapp_router_multitenant` | Só webhook inbound | **Não** — `active=false` |
| `02_ai_scheduling_agent_multitenant` | Não — Core API/outbox | **Não** — `active=false` |
| `03_recall_30_days_multitenant` | Não — Core API/outbox | **Não** — `active=false` |

## Referências

- `docs/N8N_VERSION_PIN.md` — imagem `n8nio/n8n:1.91.3`
- `QA_PACKAGE_BARBEARIA/03_N8N_WORKFLOWS/EVOLUTION_SENDTEXT_SMOKE.md`
- `docs/evidencias/piloto_staging_01/28_evolution_e2e.md`
