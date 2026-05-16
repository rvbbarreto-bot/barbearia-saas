# Relatório final — QA técnico n8n (`piloto_staging_03`)

## Identificação

| Campo | Valor |
|-------|-------|
| Branch de trabalho | `feature/piloto-staging-03-qa-operacional-n8n-ready` |
| HEAD / commit | *(preencher após merge / push com `git rev-parse HEAD`)* |

## Alterações relevantes versionadas

- `docs/n8n/*.json`, `n8n/workflows/*.json`
- `.env.example`, `docker-compose.yml`
- `scripts/n8n-validate-workflow-import.mjs` (políticas reforçadas)
- `scripts/embed-n8n-workflow-snippets.mjs`
- `scripts/n8n-snippets/*.code.js`
- `package.json` — script `n8n:validate-workflows`
- Pasta `docs/evidencias/piloto_staging_03/qa_n8n/` (texto + placeholders PNG)

## Variáveis críticas

| Variável | Esperado no container `barbearia-n8n` (QA Compose) |
|----------|-----------------------------------------------------|
| `API_BASE_URL` | `http://api:3000` |
| `EVOLUTION_API_URL` | `http://host.docker.internal:8081` |
| `EVOLUTION_INSTANCE` | ex.: `teste` |
| `EVOLUTION_API_KEY` | segredo apenas em `.env` local |
| `QA_WHATSAPP_NUMBER` | `55DDDNUMERO` válido (obrigatório no `.env` — compose sem default) |
| `N8N_WEBHOOK_TOKEN` | igual a `tenants.webhook_token` |
| `N8N_WEBHOOK_URL` / `N8N_BASE_URL` | `http://localhost:5679/` e `http://localhost:5679` |
| `N8N_HMAC_SECRET` | manter **vazio** para este export (tenants apenas-HMAC ⇒ proxy ou outro artefacto) |
| `N8N_WORKFLOW_02_ID` | após import do workflow 02 |
| `N8N_RECALL_ALLOW_SCHEDULE` | `false` até PO autorizar cron |
| `NODE_FUNCTION_ALLOW_BUILTIN` | **não obrigatório** para estes workflows |

## Bugs corrigidos

1. **01 Router**: unwrap `body` do Webhook; filtro preservado sem `crypto`/`AbortController`; POST Core apenas com token; erro explícito se `N8N_HMAC_SECRET` preenchido.
2. **03 Smoke QA**: classificação para respostas Evolution sem só `statusCode` numérico.
3. **03 Recall**: gate antes do GET quando origem é *Schedule*; mantém `active=false`.
4. **Infra**: `.env.example`/`docker-compose` coerentes; removido default de número WhatsApp sensível no compose.

## Testes automatizados / estáticos (executados aqui)

- `npm run n8n:validate-workflows` (exit 0) — registos em `17_*.txt` e `18_*.txt`.
- **E2E Docker / Evolution / WhatsApp físico**: **não executados nesta IDE** — obrigatório no host do piloto pelo PO checklist §9–§11.

## Riscos residuais

- Workflow **02**: dependência de LangChain + credenciais HTTP (Bearer/`x-tenant-id`) configuradas apenas na UI do n8n.
- Dedup ponta‑a‑ponta deve ser demonstrado duas vezes com `QA-N8N-DEDUP-001`.

## Objetivas (Sim / Não)

| Pergunta | Resposta |
|----------|-----------|
| Workflow **01** aprovado? | **Não** *(estrutura aprovável; falta E2E + dedup no ambiente físico).* |
| Workflow **02** aprovado? | **Não** *(credenciais & LLM pendentes).* |
| Workflow **03 SendText** aprovado? | **Não** *(mensagem física QA não validada pela fábrica remotamente).* |
| Workflow **recall** aprovado? | **Parcial** *(defesa operacional aumentada + inactive; cron real bloqueável).* |
| **QA formal** pode seguir? | **Sim com ressalvas** *(após matriz física).* |
| Piloto pode usar **n8n**? | **Sim** *(stack saudável + `.env`).* |
| Risco spam / disparo dup? | **Mitigável / baixo** *(Core dedup — teste formal ainda requer evidência).* |
| Risco **cross‑tenant**? | **Mitigável** *(resolver instâncias + JWT — depende dados seed/prod).* |
| Credencial exposta nesta revisão? | **Não** *(apenas placeholders em `.example`).* |

## Comandos mínimos de retomada para o QA

```
docker compose ps
curl http://localhost:3000/health/ready
npm run n8n:validate-workflows
docker exec barbearia-n8n printenv API_BASE_URL
docker exec barbearia-n8n printenv EVOLUTION_API_URL
```

**Recomendação da fábrica:** só promover workflows a “aprovados” no relatório oficial após evidências físicas PNG/JSON solicitadas pelo replacing dos ficheiros `*.png.txt` desta pasta.
