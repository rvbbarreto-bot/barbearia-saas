# Relatório de auditoria — Governança n8n (Barbearia SaaS)

**Pacote:** Governança n8n (auditoria estática; sem alteração de workflows nem endpoints neste entregável).  
**Baseline:** `docs/Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.pdf`  
**Workflows analisados:** `barbearia-saas/n8n/workflows/*.json`  
**API verificada:** `apps/api/src/server.ts` e módulos de rotas (Fastify).

---

## 1. Lista de workflows versionados

| # | Ficheiro | Nome interno (`name` no JSON) |
|---|----------|-------------------------------|
| 1 | `n8n/workflows/01_whatsapp_router_multitenant.json` | `01 - WhatsApp Inbound Router V4` |
| 2 | `n8n/workflows/02_ai_scheduling_agent_multitenant.json` | `SaaS Barbearia - 02 Agente Agenda Multi-Tenant` |
| 3 | `n8n/workflows/03_recall_30_days_multitenant.json` | `SaaS Barbearia - 03 Recall 30 Dias Multi-Tenant` |

---

## 2. Validações executadas (evidência)

| # | Validação | Método | Resultado |
|---|-----------|--------|-----------|
| 1 | JSON válido | `JSON.parse` em cada `.json` | OK (`01`, `02`, `03`) |
| 2 | Nós Postgres | grep tipo `n8n-nodes-base.postgres` | Encontrado em `03` apenas |
| 3 | Queries SQL | Leitura de `parameters.query` | `03`: `SELECT * FROM v_recall_candidates ...` |
| 4 | Evolution / WhatsApp | `EVOLUTION_API_URL`, `sendText` | `02`, `03` chamam Evolution HTTP direto |
| 5 | Endpoints HTTP Core | Cruzamento com rotas em `apps/api/src` | Ver secção 12.4; `POST /api/v1/audit/recall-sent` **inexistente** |
| 6 | Credenciais hardcoded | Busca em JSON por tokens literais longos | Nenhum segredo literal nos 3 JSON; uso de `$env.*` e credenciais genéricas |
| 7 | `tenant_id` no body | grep em `01` | Notes/code explicam **ausência** de tenant no body do webhook; tenant vem da resposta Core — adequado para `01` |
| 8 | Smoke n8n | Ambiente Evolution+n8n não executado neste relatório | **Justificado:** auditoria estática apenas |
| 9 | Workflows chamam API | Análise nó a nó | `01` chama Core; `02`/`03` misturam API + bypass |

---

## 3. Tabela — auditoria por workflow

### 3.1 `01_whatsapp_router_multitenant.json`

| Campo | Valor |
|-------|--------|
| Finalidade | Receber webhook Evolution, normalizar mensagem, registar inbound na Core API, opcionalmente disparar workflow do agente. |
| Gatilho | Webhook POST (`path` relativo `whatsapp/inbound`, configurável no n8n). |
| Nós HTTP | Implicitamente via **Code** (`fetch`) para Core — não usa nó `httpRequest` isolado. |
| Nós Postgres | **Nenhum.** |
| Evolution/WhatsApp | **Nenhum envio**; só ingestão via webhook Evolution → n8n. |
| Nós IA | **Nenhum**; `executeWorkflow` para `02` se `route=agent`. |
| Endpoints chamados | `POST {API_BASE_URL}/webhooks/whatsapp/inbound` (verificar que `API_BASE_URL` não inclui sufixo duplicado). |
| Escreve em BD | **Não** (delegado à API). |
| Calcula disponibilidade | **Não.** |
| Cria agenda | **Não.** |
| WhatsApp direto (Evolution send) | **Não** (só inbound). |
| `tenant_id` seguro | **Sim** para este fluxo: body Core sem tenant; API resolve por `x-webhook-instance` + integrações. |
| Risco | **Baixo** no JSON atual; depende de env (`N8N_HMAC_SECRET` / `N8N_WEBHOOK_TOKEN`) e de `workflowId` do `02` estar correto após import. |
| Recomendação | Manter; revisar após correção dos workflows `02`/`03`. Substituir placeholder `SUBSTITUIR_PELO_ID_DO_WORKFLOW_02` em importação real. |
| Status | **Aprovado com ressalvas** (ressalva: dependência do sub-workflow `02` não conforme isoladamente). |

### 3.2 `02_ai_scheduling_agent_multitenant.json`

| Campo | Valor |
|-------|--------|
| Finalidade | Agente LangChain: contexto de agenda + decisão de intenção + criação opcional de agendamento + resposta WhatsApp. |
| Gatilho | `executeWorkflowTrigger` (chamado pelo `01`). |
| Nós HTTP | `GET .../api/v1/appointments?...`; `POST .../api/v1/appointments`; `POST {EVOLUTION_API_URL}/message/sendText/...` |
| Nós Postgres | **Nenhum.** |
| Evolution/WhatsApp | **Sim** — envio direto `sendText` (fora do outbox da Core API). |
| Nós IA | **Sim** — `@n8n/n8n-nodes-langchain.agent`. |
| Escreve em BD | **Não diretamente**; usa API para `POST /appointments`. |
| Calcula disponibilidade | **Sim no efeito prático:** não há chamada a `GET /api/v1/availability` no JSON; o prompt pede respeitar disponibilidade, mas o grafo **não consome** o endpoint de disponibilidade da API. |
| Cria agenda | **Via API** (`POST /api/v1/appointments`) com `jsonBody` = `$json.appointment_payload` (shape definido pelo agente — validação final é da API, mas entrada é “JSON livre” da IA até o parse na Core). |
| WhatsApp direto | **Sim** — **bloqueador** face ao critério interno “via API/outbox”. |
| `tenant_id` seguro | **Parcial:** depende do utilizador JWT/cabeçalhos configurados no `httpHeaderAuth`; não há `tenant_id` no body do primeiro GET listado no workflow, mas o isolamento multi-tenant exige credencial de serviço **por tenant** ou política explícita — **não evidenciado no JSON**. |
| Risco | **Bloqueador** (Evolution direto); **Alto** (disponibilidade não obtida da API no grafo). |
| Recomendação | Remover `sendText` direto; passar respostas transacionais por endpoint/Core que enfileire `message_outbox`. Introduzir nó `GET /api/v1/availability` antes de qualquer compromisso de horário; formalizar contrato IA (card seguinte). |
| Status | **Reprovado** para produção até correções. |

### 3.3 `03_recall_30_days_multitenant.json`

| Campo | Valor |
|-------|--------|
| Finalidade | Job agendado: ler candidatos a recall, enviar mensagem, auditar envio. |
| Gatilho | `scheduleTrigger` (a cada 6 horas no JSON). |
| Nós HTTP | Evolution `sendText`; `POST {API_BASE_URL}/api/v1/audit/recall-sent` |
| Nós Postgres | **Sim** — `executeQuery` `SELECT * FROM v_recall_candidates WHERE due_at <= now() LIMIT 200` |
| Evolution/WhatsApp | **Sim** — direto. |
| Nós IA | **Nenhum.** |
| Escreve em BD | **Não há INSERT/UPDATE explícitos** no SQL mostrado; contudo **acesso direto ao BD** da barbearia para **dados de negócio** viola governança “API como fonte”. |
| Calcula disponibilidade | Não aplicável diretamente; seleção de candidatos é regra de negócio **no SQL/view**. |
| Cria agenda | **Não.** |
| WhatsApp direto | **Sim** — **bloqueador**. |
| `tenant_id` seguro | Colunas `tenant_slug` etc. vêm da view — consistência depende da view; **não** passa pela API para decisão de elegibilidade/opt-out. |
| Risco | **Bloqueador** (Evolution direto + bypass API para recall); **Alto** (endpoint de auditoria inexistente). |
| Recomendação | Substituir Postgres por `GET /api/v1/recall/candidates` (com JWT de sistema ou fluxo batch documentado); eliminar Evolution direto; implementar ou remover chamada a `/audit/recall-sent`; aplicar opt-out apenas via API/serviços Core. |
| Status | **Reprovado** para produção até correções. |

---

## 4. Violações explícitas (lista)

1. **`02`**: `POST {EVOLUTION_API_URL}/message/sendText/...` — envio fora do outbox/Core (critério §5.5 / risco bloqueador tipo §10 item 3).  
2. **`02`**: Ausência de chamada a **`GET /api/v1/availability`** — disponibilidade não é obtida da API no grafo (critério §5.2).  
3. **`03`**: Nó **Postgres** com leitura de `v_recall_candidates` — decisão de negócio fora da API (critério §5.1 espírito + §10 item 7).  
4. **`03`**: `POST /api/v1/audit/recall-sent` — **rota não existe** na Core API (`auditRoutes` só expõe `GET /api/v1/audit-logs`). Chamadas resultam em 404 ou erro de rede.  
5. **`03`**: Envio Evolution **direto** — mesmo problema que `02`.

---

## 5. Riscos classificados

| ID | Descrição | Severidade |
|----|-----------|------------|
| R1 | Evolution direto (`02`, `03`) ignora outbox, retry unificado e políticas futuras de consentimento no pipeline de mensagens | **Bloqueador** |
| R2 | Recall elegível via SQL/view sem passar pela API (`03`) | **Alto** (trata-se como bloqueador organizacional face ao pacote PO) |
| R3 | Endpoint fantasma `/api/v1/audit/recall-sent` | **Alto** |
| R4 | Agente agenda sem nó de disponibilidade (`02`) | **Alto** |
| R5 | `appointment_payload` montado pelo agente até `POST /appointments` — mitigado pela validação Zod/DAL na API, mas aumenta superfície de erro e bypass mental no n8n | **Médio** |
| R6 | Credencial JWT multi-tenant no `02` mal configurada poderia expor dados entre tenants | **Médio** (operacional) |

---

## 6. Endpoints permitidos — recomendação por workflow (alvo)

*Não substitui aprovação PO; define alvo após remediação.*

### Workflow `01`

| Endpoint | Método | Finalidade | Autorizado | Observação |
|----------|--------|------------|------------|------------|
| `/webhooks/whatsapp/inbound` | POST | Registar mensagem inbound | **Sim** | Existe em `whatsappRoutes` (rota pública). |

### Workflow `02` (após correção)

| Endpoint | Método | Finalidade | Autorizado | Observação |
|----------|--------|------------|------------|------------|
| `/api/v1/availability` | GET | Slots oficiais | **Sim** (com JWT + tenant) | **Em falta** no JSON atual |
| `/api/v1/appointments` | POST | Criar agendamento | **Sim** | Com corpo validado pela API |
| `/api/v1/appointment-holds` | POST | Hold opcional antes de criar | **Sim** (se política exigir) | Pendente desenho |
| Outbox via API | — | Resposta WhatsApp | **Pendente** | Core não expõe `POST .../outbox/enqueue` público genérico no código revisto; envio transacional passa por serviços internos/`enqueueOutboundMessage` |

### Workflow `03` (após correção)

| Endpoint | Método | Finalidade | Autorizado | Observação |
|----------|--------|------------|------------|------------|
| `/api/v1/recall/candidates` | GET | Listar candidatos | **Sim** | Implementado como `GET /api/v1/recall/candidates` em `recallRoutes` |
| Auditoria pós-envio | POST | Registar recall enviado | **Não implementado** | Definir contrato na API ou usar recurso existente (`audit_logs` via serviço), **sem inventar path** até card backend |

---

## 7. Ações tomadas neste pacote

| Ação | Estado |
|------|--------|
| Documentação de auditoria | **Criada** (este ficheiro) |
| Checklist de PR | **Criado** (`docs/N8N_WORKFLOW_REVIEW_CHECKLIST.md`) |
| Alteração aos workflows JSON | **Fora de escopo** — não alterado |
| Isolamento de risco em produção | **Pendente operação** (desativar `02`/`03` ou não importar até correção) |

---

## 8. Fora de escopo (confirmado não iniciado neste pacote)

Pix novo; PSP; webhook Pix novo; financeiro novo; comissão nova; telas; migrations; endpoints novos na Core para recall-sent; alterações funcionais em `appointments`; novo fluxo além de documentação; IA nova além da já referenciada no `02`; recall automático **implementado** na API neste pacote — apenas **auditoria** dos JSON existentes.

---

## 9. Próximo passo recomendado

**Ordem:** **(2) Correção dos bloqueadores n8n** nos workflows `02` e `03` (e validação operacional do `01` contra sub-fluxo corrigido). **Não** avançar para **Contrato de IA** ou **E2E** até o PO aceitar formalmente o plano de remediação ou versões corrigidas dos workflows.

---

## 10. Critérios de aceite PO (§13) — estado

| # | Critério | Estado |
|---|----------|--------|
| 1 | Todos os workflows listados | **Sim** |
| 2 | Nós Postgres identificados | **Sim** (`03`) |
| 3 | Escrita/leitura direta classificada | **Sim** |
| 4 | Endpoints chamados documentados | **Sim** |
| 5 | Workflows produtivos **conformes** (sem BD bypass / sem Evolution direto) | **Não** (`02`, `03`) |
| 6 | Endpoints permitidos documentados | **Sim** (secção 6 + tabelas) |
| 7 | Checklist de PR criado | **Sim** |
| 8 | Riscos classificados | **Sim** |
| 9 | Funcionalidade fora do escopo não iniciada | **Sim** |
| 10 | Relatório com evidência | **Sim** (parse JSON + cruzamento código API) |

**Conclusão:** entrega do **pacote de auditoria** está **completa**; **aceitação PO para “workflows produtivos conformes”** permanece **pendente** até remediação de `02` e `03`.

---

## 11. Relatório executivo (formato solicitado §12)

### 11.1 Status geral

**Reprovado** para **conformidade arquitetural em produção** dos workflows `02` e `03` na revisão atual dos JSON.  
**Aprovado** como **entrega do trabalho de governança** (auditoria + artefactos documentais + checklist).

### 11.2 Workflows analisados (resumo)

| Ficheiro | Workflow | Status auditoria | Risco dominante | Recomendação |
|----------|----------|------------------|-----------------|--------------|
| `01_whatsapp_router_multitenant.json` | WhatsApp Inbound Router V4 | Aprovado com ressalvas | Baixo | Rever dependência do `02` |
| `02_ai_scheduling_agent_multitenant.json` | Agente Agenda | Reprovado | Bloqueador | Evolution direto + falta availability API |
| `03_recall_30_days_multitenant.json` | Recall 30 dias | Reprovado | Bloqueador | Postgres + Evolution + endpoint inexistente |

### 11.3 Achados críticos

- Nó **Postgres** (`03`) com SQL em `v_recall_candidates`.  
- **Evolution HTTP direto** (`02`, `03`) — fora do outbox.  
- **`tenant_id` no body:** não é problema no `01`; **`02`** depende de auth multi-tenant correta (risco operacional).  
- **Credencial hardcoded:** não encontrada nos JSON; uso de `$env`.  
- **Regra de negócio no n8n:** elegibilidade recall via view SQL (`03`); decisão de horários delegada ao agente sem nó `availability` (`02`).

### 11.4–11.7 Ver secções 3, 6, 7, 9 acima.

---

### Histórico

| Data | Autor | Notas |
|------|-------|-------|
| 2026-05-02 | Equipa técnica (auditoria estática) | Primeira versão após leitura de `n8n/workflows/*.json` e rotas Core API. |
