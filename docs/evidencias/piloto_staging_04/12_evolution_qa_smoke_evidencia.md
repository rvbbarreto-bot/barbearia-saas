# Evidência — correção ambiente Evolution/n8n (smoke SendText)

**Data:** 2026-05-16  
**Status PO:** smoke SendText **desbloqueado para revalidação** após alinhamento de chave (teste direto HTTP 201).  
**Workflow n8n manual:** executar operador em `http://localhost:5679` e anexar prints dos 3 nós.

---

## 1. Causa raiz do HTTP 401

A Evolution (`evolution_api`, compose `C:\Projetos`) usava **`AUTHENTICATION_API_KEY=123456`** (placeholder de 6 caracteres).  
n8n e API Barbearia enviavam **`EVOLUTION_API_KEY`** do `.env` local (38 caracteres, últimos 4: `dade`).  
Chaves **diferentes** → Evolution respondia **401 Unauthorized**.

Adicionalmente o `.env` Barbearia tinha **duplicidade** de `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` (dois blocos); o Docker Compose usa a **última** ocorrência — risco de homologação confusa.

---

## 2. Variável de autenticação na Evolution

| Variável | Estado |
|----------|--------|
| `AUTHENTICATION_API_KEY` | **SET** (usada pela Evolution v2.3.7) |
| `API_KEY` | MISSING |
| `GLOBAL_API_KEY` | MISSING |
| `EVOLUTION_API_KEY` | MISSING (não é lida pelo container Evolution) |

---

## 3–5. Evidência mascarada (após correção)

| Onde | Variável | Estado | Tamanho | Últimos 4 |
|------|----------|--------|---------|-----------|
| Evolution | `AUTHENTICATION_API_KEY` | SET | 38 | `dade` |
| n8n (`barbearia-n8n`) | `EVOLUTION_API_KEY` | SET | 38 | `dade` |
| API (`barbearia-api`) | `EVOLUTION_API_KEY` | SET | 38 | `dade` |

**Alinhamento:** os três tamanhos e sufixos coincidem.

**n8n env (não sensível):**

- `EVOLUTION_API_URL=http://host.docker.internal:8081`
- `EVOLUTION_INSTANCE=teste`
- `QA_WHATSAPP_NUMBER=5511973305448`

**API env:** mesmos valores para URL/INSTANCE.

---

## 6. Comandos executados

```powershell
# Barbearia repo
./scripts/normalize-evolution-env.ps1

# Evolution (stack Projetos) — sem down -v
docker compose -f C:\Projetos\docker-compose.yml --env-file .env up -d --force-recreate evolution_api

# API + n8n Barbearia
docker compose -f docker-compose.yml -f docker-compose.evolution-local.yml up -d --force-recreate api n8n

# Teste direto (host)
POST http://localhost:8081/message/sendText/teste
# Header apikey: <do .env> — Body number 5511973305448
```

Script repetível: `scripts/qa-evolution-env-align.ps1`

---

## 7. Resultado teste direto Evolution

| Resultado | Detalhe |
|-----------|---------|
| **HTTP 201** | SendText aceito; `status: PENDING` no JSON de resposta |
| Instância | `teste` |
| Número | `5511973305448` |

**Não houve 401** após alinhar `AUTHENTICATION_API_KEY` com `EVOLUTION_API_KEY`.

---

## 8. Resultado teste via n8n

| Item | Estado |
|------|--------|
| Workflow JSON | `03_QA_Barbearia_Evolution_SendText_Smoke.json` atualizado (classificação erro) |
| `pinData` no JSON | **Ausente** |
| `evolution.test` no JSON | **Ausente** |
| Execução manual UI | **PEND** — operador deve rodar Manual Trigger e anexar prints |

Classificação de erro no nó final (após ajuste):

- `auth_401_invalid_api_key`
- `not_found_404_instance_or_route`
- `timeout`
- `network_error`
- `provider_error`

---

## 9–10. Prints workflow

**PEND operador:** anexar capturas de:

1. `Validar variaveis obrigatorias` (number, instance, baseUrl)
2. `Evolution SendText`
3. `Classificar sucesso ou erro`

---

## 11–12. Confirmações

| Critério | OK? |
|----------|-----|
| Sem `pinData` no workflow versionado | Sim |
| Sem `http://evolution.test` no workflow / env containers | Sim |
| `.env` sem duplicidade Evolution | Sim (script normalize) |

---

## 13. Arquivos alterados (repositório Barbearia)

| Arquivo | Alteração |
|---------|-----------|
| `scripts/normalize-evolution-env.ps1` | Remove duplicatas `.env` |
| `scripts/qa-evolution-env-align.ps1` | Alinha + recria + teste direto |
| `n8n/workflows/03_QA_Barbearia_Evolution_SendText_Smoke.json` | Classificação erro objetiva |
| `docs/evidencias/piloto_staging_04/12_evolution_qa_smoke_evidencia.md` | Este documento |

**Fora do repo (operador):** `C:\Projetos\docker-compose.yml` — `AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY:-123456}` + `--env-file` do `.env` Barbearia.

**Não commitado:** `.env`, chaves reais.

---

## Governança

- Sem merge em `main` / `piloto-staging-01` por esta correção isolada.
- Aceite smoke n8n UI + mensagem WhatsApp QA = critério final PO.
