# Evidência — correção ambiente Evolution/n8n (smoke SendText)

**Data:** 2026-05-16  
**Status PO:** integração n8n → Evolution → WhatsApp **funcional** (evidência PO 2026-05-17).  
**Correção final:** classificador trata `status=PENDING` + `key.*` como **sucesso técnico** (`ok: true`).  
**Commit classificador (aprovado PO):** `d687684` — `fix(n8n): classify Evolution PENDING SendText as technical success`  
**Aceite funcional smoke:** **PEND** — ver secção «Gate final» abaixo.  
**Merge:** **BLOQUEADO** até CI verde PR #6 + evidência final.

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

## 8. Resultado teste via n8n (PO 2026-05-17)

| Item | Estado |
|------|--------|
| Workflow sem `pinData` | **OK** (evidência PO) |
| Variáveis (number/instance/baseUrl) | **OK** |
| Evolution SendText (remoteJid, key.id, PENDING) | **OK** |
| WhatsApp QA recebeu mensagem | **OK** |
| Classificador (antes do fix) | **REPROVADO** — confundia `status=PENDING` com HTTP |
| Classificador (após fix) | **OK** — `ok: true`, `delivery_status=queued_or_pending` |

**Causa do bug no classificador:** `Number(res.status ?? 0)` usava o campo **Evolution** `status: "PENDING"` em vez de `statusCode` HTTP → falha na regra 2xx.

**Saída esperada após reimport + execução:**

```json
{
  "ok": true,
  "status": "PENDING",
  "delivery_status": "queued_or_pending",
  "message_id": "<key.id>",
  "remoteJid": "5511973305448@s.whatsapp.net",
  "requires_whatsapp_confirmation": true,
  "whatsapp_received_evidence": true
}
```

Classes de erro (quando falha real): `auth_401_invalid_api_key`, `not_found_404_instance_or_route`, `timeout`, `network_error`, `provider_invalid_response`.

---

## Gate final — aceite funcional (obrigatório PO)

| Item | Estado |
|------|--------|
| Correção técnica classificador (`d687684`) | **APROVADO** |
| Testes `n8n-qa-sendtext-classify-snippet.test.mjs` | **PASS** (local) |
| CI verde PR #6 | **PEND** — verificar Actions no GitHub |
| Reimport workflow + Manual Trigger + print classificador | **PEND operador** |

### Procedimento operador (n8n UI)

1. Abrir `http://localhost:5679` → importar de novo:
   - `n8n/workflows/03_QA_Barbearia_Evolution_SendText_Smoke.json`  
   - (espelho: `docs/n8n/03_QA_Barbearia_Evolution_SendText_Smoke.json`)
2. Confirmar **sem pinData** no workflow importado.
3. Executar **Manual Trigger QA** (workflow `active=false`).
4. No nó **Classificar sucesso ou erro**, capturar saída com **todos** os campos:
   - `ok` = `true`
   - `status` = `PENDING`
   - `delivery_status` = `queued_or_pending`
   - `message_id` preenchido
   - `remoteJid` = `5511973305448@s.whatsapp.net` (ou equivalente)
5. Salvar print em:
   - `docs/evidencias/piloto_staging_04/13_n8n_classificador_ok_true.png`  
   - (sem API keys visíveis no screenshot)

Evidências anteriores (já aprovadas PO): nós 1–3 + WhatsApp recebido — manter no pacote QA.

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
