# Guia de início dos testes QA — n8n (PILOTO-STAGING-03)

**Pacote:** preparação formal para o time de QA **antes** de validação operacional completa.  
**Branch de teste:** `feature/piloto-staging-03-qa-operacional-n8n-ready`  
**Base de integração:** `piloto-staging-01` — **não** usar `main` para esta fase.  
**Commit de preparação (pacote QA):** identificado pela mensagem `chore(piloto-03): prepare n8n QA test pack for PO approval` no histórico (`git log --oneline --grep "prepare n8n QA"`).

**Governança — incidente PR #2 → `main`:** ver `00_governanca_incidente_pr2_merge_main.md`. Sem reset/revert/force push sem autorização PO.

---

## 1. Pré-requisitos do ambiente

### 1.1 URLs padrão (Docker Compose na raiz do repo)

| Serviço | URL no host (desenvolvimento local típico) | Notas |
|---------|---------------------------------------------|--------|
| **n8n** | `http://localhost:5679` | Porta mapeada `5679:5678` no `docker-compose.yml`; UI com Basic Auth (`N8N_BASIC_AUTH_*`). |
| **Core API** | `http://localhost:3000` | Health: `GET /health/ready` e `GET /health/live` (ver OpenAPI). |
| **Web** | `http://localhost:3001` | Portal estático atrás do Compose. |
| **Evolution API** | `http://localhost:8081` (exemplo) | Quando corre no host; **no container da API** usar `http://host.docker.internal:8081` (ver `.env.example`). |

Dentro da **rede Docker**, o n8n chama a API por **`http://api:3000`** (variável `API_BASE_URL` injectada no serviço `n8n` no compose).

### 1.2 Branch e commit em teste

- Fazer **`git fetch`** e **`git checkout feature/piloto-staging-03-qa-operacional-n8n-ready`**.  
- **`git pull`** para alinhar com `origin`.  
- Registar **`git rev-parse HEAD`** como SHA do pacote em teste.

### 1.3 Validar que Docker / API / Web / n8n / Evolution estão activos

| Componente | Comando / acção |
|------------|-----------------|
| **Compose** | `docker compose ps` — serviços `postgres`, `redis`, `api`, `web`, `n8n` *healthy* ou *running*. |
| **API** | `curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/health/ready` → esperado `200`. |
| **Web** | `curl -sS -o /dev/null -w "%{http_code}" http://localhost:3001/` → `200`. |
| **n8n** | Browser: `http://localhost:5679` com utilizador/senha do `.env`; ou health interno do container (ver `docker-compose.yml`). |
| **Evolution** | `curl -sS -o /dev/null -w "%{http_code}" http://localhost:8081/` → tipicamente `200` (versão/local configurável). |

### 1.4 Validar variáveis no container n8n

O serviço `n8n` no `docker-compose.yml` recebe via `environment` / `env_file`: `EVOLUTION_*`, `QA_WHATSAPP_NUMBER`, `API_BASE_URL`, `N8N_WEBHOOK_URL`, etc.

**Execução exemplo (Linux/macOS/Git Bash):**

```bash
docker exec barbearia-n8n printenv | grep -E 'EVOLUTION_|QA_WHATSAPP|API_BASE_URL|N8N_WEBHOOK'
```

Valores **não** devem ser commitados; confirmar apenas **presença** (e formato) de chaves.

### 1.5 Conectividade n8n → API

- No workflow ou um **HTTP Request** de teste: `GET {{ $env.API_BASE_URL }}/health/ready` (ou nó dedicado).  
- Esperado: HTTP 200 e corpo de health.  
- **Problema típico:** `API_BASE_URL` apontar para `localhost:3000` **dentro** do container — deve ser `http://api:3000` (já definido no compose para o serviço n8n).

### 1.6 Conectividade n8n → Evolution

- A partir do container n8n: URL deve resolver para o host Evolution (ex.: `host.docker.internal:8081` no Windows/macOS Docker Desktop, conforme `.env`).  
- O workflow **03 QA** usa `$env.EVOLUTION_API_URL` + `EVOLUTION_INSTANCE` + POST `/message/sendText/...`.

---

## 2. Variáveis obrigatórias (sem segredos reais)

| Variável | Onde configurar | Como validar |
|----------|-----------------|--------------|
| **EVOLUTION_API_URL** | `.env` na raiz; propagado ao `api` e `n8n` | `docker exec barbearia-n8n printenv EVOLUTION_API_URL` |
| **EVOLUTION_INSTANCE** | Idem | `printenv` no container n8n |
| **EVOLUTION_API_KEY** | Idem (nunca em JSON Git) | Presença apenas; valor mascarado em logs |
| **QA_WHATSAPP_NUMBER** | Idem; formato `55DDDNUMERO` | Nó “Validar variaveis” do workflow 03 |
| **API_BASE_URL** | Compose define `http://api:3000` no n8n | `printenv API_BASE_URL` no n8n |
| **N8N_BASE_URL** | Uso documental: UI em `http://localhost:5679` | Browser |
| **WEBHOOK_URL / N8N_WEBHOOK_URL** | `.env` — `N8N_WEBHOOK_URL` no compose | Evoluções de webhook em `01` router |
| **JWT / token API** | Credenciais n8n (HTTP Header Auth) ou variável `N8N_WEBHOOK_TOKEN` alinhada ao tenant | Placeholder: `<TOKEN_WEBHOOK_TENANT_SEED>` — seed demo em `database/seeds/001_demo.sql` |

**Teste de carregamento:** após `docker compose up -d --force-recreate n8n`, repetir `printenv` e executar workflow 03 — nó de validação deve passar ou listar variáveis em falta com mensagem explícita.

---

## 3. JSONs n8n para importação (`docs/n8n/`)

Ficheiros **versionados no repositório** (cópia espelhada de `n8n/workflows/`):

| Ordem | Ficheiro | Objetivo | `active` no export | Variáveis principais | Gatilho de teste | Resultado esperado | Erros esperados (classificação) |
|------:|----------|----------|---------------------|----------------------|------------------|--------------------|--------------------------------|
| 1 | `docs/n8n/01_whatsapp_router_multitenant.json` | Evolution webhook → normalização → execução workflow 02 | **false** | `N8N_WEBHOOK_URL`, token webhook, ID workflow 02 | Webhook Evolution (sandbox) ou simulação | Encadeamento controlado sem loop | 401 token; 404 workflow id; timeout upstream |
| 2 | `docs/n8n/02_ai_scheduling_agent_multitenant.json` | IA / HTTP → Core API agendamentos + outbox | **false** | `API_BASE_URL`, auth API, IDs fluxo | Manual ou chamado por 01 | 201 agendamento / outbox enfileirado | 400 validação; 409 slot; 422 routing |
| 3 | `docs/n8n/03_QA_Barbearia_Evolution_SendText_Smoke.json` | Smoke SendText Evolution `{ number, text }` | **false** | `EVOLUTION_*`, `QA_WHATSAPP_NUMBER` | **Manual Trigger** | 2xx Evolution ou erro classificado no nó final | **Variável ausente** (throw no Code); **401** apikey; **404** instância; **timeout** 30s |
| 4 | `docs/n8n/03_recall_30_days_multitenant.json` | Recall 30 dias multitenant | **false** | `API_BASE_URL`, tenant context | Schedule / manual QA | Jobs/outbox conforme regras | RBAC; Evolution indisponível |

**Placeholder crítico:** em **01**, o campo `SUBSTITUIR_PELO_ID_DO_WORKFLOW_02` deve ser substituído pelo **ID numérico/UI do workflow 02** **após** importar o 02 no mesmo projecto n8n (o ID é gerado na primeira importação). Documentar o ID usado na evidência da matriz.

**Payload Evolution (03):** corpo JSON com **`number`** e **`text`** na raiz — não usar `textMessage.text` (Evolution 2.3.x).

---

## 4. Passo a passo de importação no n8n

1. Arrancar stack: `docker compose up -d` (Postgres, Redis, API, Web, n8n).  
2. Abrir browser: `http://localhost:5679` — autenticar com credenciais do `.env`.  
3. **Workflows → ⋮ → Import from File** (ou equivalente na versão n8n 1.91.x).  
4. Importar na ordem: **02** (para obter ID) → copiar ID para **01** se necessário → importar **01** → **03 QA** → **03 recall**.  
   - Ordem mínima aceitável para smoke imediato: **03** isolado; **01** depende do ID do **02**.  
5. Abrir cada workflow: confirmar nós **sem credenciais hardcoded**; usar **Credentials** do n8n para API se aplicável.  
6. Manter **Inactive / Save** — workflows **desactivados** (`active: false` no JSON já exportado).  
7. Para **03 QA**: clicar **Execute Workflow** a partir do **Manual Trigger**.  
8. Capturar **print** do nó “Validar variaveis obrigatorias” (saída OK ou erro).  
9. Capturar **print** do nó “Evolution SendText” / resposta.  
10. Copiar **JSON de saída** do último nó (“Classificar sucesso ou erro”) para pasta `qa_n8n/` (sanitizado).  
11. Registar falhas: repetir com variável removida no compose (teste negativo controlado).

---

## 5. Cenários de teste (BDD / Gherkin)

```gherkin
Feature: Smoke n8n Evolution SendText
  Scenario: Envio de mensagem com variáveis válidas
    Given que o n8n possui EVOLUTION_API_URL, EVOLUTION_INSTANCE, EVOLUTION_API_KEY e QA_WHATSAPP_NUMBER configurados
    And a instância Evolution está activa
    When o QA executa o workflow 03_QA_Barbearia_Evolution_SendText_Smoke
    Then o workflow deve validar as variáveis obrigatórias
    And deve enviar payload contendo number e text na raiz do JSON
    And a Evolution deve retornar sucesso ou erro classificado no nó final

  Scenario: Variável ausente no n8n
    Given que uma das variáveis obrigatórias Evolution ou QA_WHATSAPP_NUMBER não está definida no container n8n
    When o QA executa o workflow 03
    Then o nó de validação deve falhar com mensagem listando chaves em falta

  Scenario: Número WhatsApp inválido
    Given QA_WHATSAPP_NUMBER com formato inválido (não 55DDD...)
    When o QA executa o workflow 03
    Then o nó de validação deve rejeitar com erro de formato

  Scenario: Evolution API key inválida (401)
    Given EVOLUTION_API_KEY incorrecto
    When o workflow 03 envia POST sendText
    Then a resposta deve ser classificada como erro com status 401

  Scenario: Instância Evolution inválida (404)
    Given EVOLUTION_INSTANCE inexistente
    When o workflow 03 envia POST
    Then a resposta deve indicar 404 ou erro de instância

  Scenario: Evolution inacessível (timeout / fetch failed)
    Given EVOLUTION_API_URL aponta para host/porta inacessível
    When o workflow 03 executa
    Then deve registar timeout ou falha de rede classificável

  Scenario: Roteamento multitenant (workflow 01)
    Given o workflow 01 importado e ID do workflow 02 resolvido
    When um webhook de teste multitenant válido é recebido
    Then o encaminhamento segue sem vazamento de tenant

  Scenario: Tentativa cross-tenant bloqueada
    Given payloads de dois tenant_ids distintos
    When processados pelo Core API conforme regras
    Then não deve haver leitura cruzada de dados (404/403)

  Scenario: Agendamento válido cria registo outbox
    Given cliente com routing WhatsApp e integração activa
    When o fluxo 02 cria agendamento com confirmação
    Then deve existir linha em message_outbox relacionável via correlation_id

  Scenario: Agendamento em data passada
    When a API recebe starts_at no passado
    Then retorna erro APPOINTMENT_IN_PAST

  Scenario: Profissional altera agenda de outro profissional
    When utilizador role professional tenta cancelar/remarcar agendamento de outro professional_id
    Then retorna 403 FORBIDDEN

  Scenario: RBAC outbox retry
    Given mensagem outbox em failed ou dead
    When manager tenta POST .../retry
    Then 200 e re-enfileiramento
    When attendant tenta o mesmo
    Then 403

  Scenario: Rastreio por correlation_id
    When uma operação gera correlation_id
    Then logs e outbox permitem filtrar pelo mesmo identificador

  Feature: Recall 30 dias (se aplicável)
    Scenario: Workflow recall em modo seguro
      Given RECALL_ENABLED e regras tenant
      When o workflow 03_recall é executado em QA controlado
      Then não envia campanha em massa não autorizada
```

---

## 6. Matriz de execução QA

| ID | Workflow / escopo | Pré-condição | Massa de dados | Passos resumidos | Resultado esperado | Evidência obrigatória | Status |
|----|-------------------|--------------|----------------|------------------|--------------------|------------------------|--------|
| QA-01 | 03 SendText | Env Evolution OK | `.env` completo | Manual trigger 03 | 2xx ou erro classificado | Print + JSON saída | PEND |
| QA-02 | 03 SendText | Variável removida | Compose sem uma env | Executar 03 | Erro “Configuracao ausente…” | Log texto | PEND |
| QA-03 | 03 SendText | Key inválida | Key errado | Executar 03 | 401 | Corpo erro | PEND |
| QA-04 | 03 SendText | Instância inválida | Instance fake | Executar 03 | 404 / mensagem clara | Print | PEND |
| QA-05 | 03 SendText | Evolution down | URL inválida | Executar 03 | Timeout / fail | Log | PEND |
| QA-06 | 01 Router | 02 importado + ID | Webhook test | Disparar webhook | Encadeia 02 | Log n8n | PEND |
| QA-07 | 02 Agente | Token API válido | Payload demo | Executar / webhook | 201 ou erro negócio | Audit API | PEND |
| QA-08 | API Agenda | Tenant demo | Slot livre | POST appointment | 201 | correlation_id | PEND |
| QA-09 | API | Passado | starts_at antigo | POST | 422 PAST | Mensagem amigável | PEND |
| QA-10 | API | Profissional | Outro prof | PATCH cancel | 403 | Log | PEND |
| QA-11 | Outbox retry | Manager | UUID mensagem | POST retry | 200 pending | Audit | PEND |
| QA-12 | Outbox retry | Attendant | Idem | POST retry | 403 | Log | PEND |
| QA-13 | Recall | Workflow 03_recall | Flags seguras | Manual/schedule | Sem spam | Log | PEND |

*(Preencher links/prints na coluna evidência ao concluir cada linha.)*

---

## 7. Evidências esperadas

Armazenar artefactos em `docs/evidencias/piloto_staging_03/qa_n8n/` seguindo `qa_n8n/README.md`.

Mínimo para **liberar** execução QA formal (fábrica):

- Script `node scripts/n8n-validate-workflow-import.mjs` **exit 0** nos directórios `docs/n8n` e `n8n/workflows`.  
- Confirmação **active=false** em todos os exports validados.  
- Ausência de padrões bloqueados / segredos no script (ver mensagens do validador).

---

## 8. Validação técnica obrigatória (fábrica, pré-PO)

| # | Verificação | Como |
|---|-------------|------|
| 1 | Importabilidade JSON | Validador Node + import manual opcional |
| 2 | active=false | Grep + validador |
| 3 | Sem secrets hardcoded | Validador + revisão |
| 4 | Placeholders | `SUBSTITUIR_…` documentado na secção 3 |
| 5 | Smoke 03 com env carregado | Execução local (evidência em qa_n8n/) |
| 6 | Negativo variável ausente | Remover temp. uma env no compose / teste |
| 7 | n8n → Evolution | curl ou execução 03 |
| 8 | n8n → API | GET health via URL interna api:3000 |

---

## 9. Referências

- Compose: `docker-compose.yml`  
- Variáveis exemplo: `.env.example` na raiz  
- Governança PR #2: `docs/evidencias/piloto_staging_03/00_governanca_incidente_pr2_merge_main.md`  
- Matriz aceite entrega: `03_matriz_aceite.md`
