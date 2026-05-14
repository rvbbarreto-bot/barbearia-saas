# Relatório — Bateria de testes negativos da API (Barbearia SaaS)

## 1. Resumo executivo

| Campo | Valor |
|--------|--------|
| Data da execução | 2026-05-14 |
| Branch/commit testado | `3c1cfa0fe294069e8bc5e94111c47136600af6a8` |
| Responsável pela execução | Fábrica (agente automatizado + script `scripts/qa-api-negative-battery.ps1`) |
| Ambiente | Docker local (Windows): API `http://localhost:3000`, Postgres `barbearia_saas`, utilizador `barbearia_test` |
| Status geral | **Aprovado com ressalvas** — todos os CT automatizados executados sem `FALHA`/`BUG`; ressalvas em CT-020 e CT-073 (gaps funcionais); CT-093/100/101 **Pendentes** (credenciais/mecanismo de teste indisponíveis no script). |

Esta rodada **não** substitui homologação final de produção ou piloto; valida robustez mínima da API para avanço controlado do pacote seguinte.

---

## 2. Evidências de ambiente

### 2.1 `docker compose ps` (trecho)

Todos os serviços reportados como **healthy**: `api`, `web`, `postgres`, `redis`, `n8n`.

### 2.2 Health da API

- Comando: `curl.exe http://localhost:3000/health`
- Resposta: `{"status":"ok"}` — HTTP 200

### 2.3 Health da base de dados

- Comando: `curl.exe http://localhost:3000/database/health`
- Resposta: `{"status":"ok","database":"connected"}` — HTTP 200

### 2.4 Utilizador e base de dados (Postgres)

- Comando: `docker compose exec postgres psql -U barbearia_test -d barbearia_saas -c "SELECT current_database(), current_user;"`
- Resultado: `current_database = barbearia_saas`, `current_user = barbearia_test`

### 2.5 Massa mínima

| Tabela | COUNT |
|--------|------:|
| tenants | 1 |
| services | 3 |
| professionals | 3 |
| customers | 2 |

Critério mínimo do pedido: satisfeito (todos > 0).

### 2.6 Collection / environment (sem segredos)

Valores equivalentes aos do Postman (tokens **omitidos**):

- `base_url` = `http://localhost:3000`
- `api_url` = `http://localhost:3000/api/v1`
- `tenant_id` = `00000000-0000-0000-0000-000000000001`
- `professional_id` / `service_id` / `customer_id` — obtidos em runtime via `GET /professionals` e `GET /customers` (script escolhe profissional com `service_ids` e primeiro cliente).
- `appointment_start_iso` / `appointment_end_iso` — **primeiro slot** devolvido por `GET /availability` em datas futuras dedicadas (ex.: `2027-03-15`), para evitar conflitos com execuções anteriores.

---

## 3. Resultado por bloco

| Bloco | Resultado |
|--------|------------|
| 0 Smoke (CT-000, CT-001) | OK |
| 1 Auth negativo | OK |
| 2 Tenant negativo | OK com **GAP** (CT-020) |
| 3 RBAC negativo | OK |
| 4 Catálogo negativo | OK |
| 5 Availability negativo | OK |
| 6 Appointments negativo | OK (inclui CT-075 fora de expediente com **409** após regra de negócio na API) |
| 7 Idempotência | OK (CT-080: segundo `POST` idêntico devolve **201** com o **mesmo** `id`) |
| 8 Webhook | OK nos cenários executáveis sem segredo de instância real (CT-090–092); CT-093 pendente |
| 9 Outbox | Pendente (sem endpoint de teste no script) |
| 10 Regressão positiva (CT-110–115) | OK |

---

## 4. Tabela de cenários (consolidada)

A evidência linha a linha (incluindo corpos de resposta truncados) está em:

`docs/QA_API_NEGATIVE_BATTERY_RESULTS.csv`

Resumo dos veredictos da última execução bem-sucedida (`exit 0` do script):

| ID | Cenário | Esperado (síntese) | Obtido | Verdict |
|----|---------|-------------------|--------|-----------|
| CT-000 | Health API | 200 + `status ok` | 200 | OK |
| CT-001 | Database health | 200 + DB connected | 200 | OK |
| CT-010 | Services sem token | 401 | 401 | OK |
| CT-011 | Token inválido | 401 | 401 | OK |
| CT-012 | POST appointment sem token | 401 | 401 | OK |
| CT-020 | Services sem `x-tenant-id` | 401/403 | 200 | **GAP** |
| CT-021 | Tenant header nil UUID | 403 | 403 | OK |
| CT-022 | Cross-tenant header | 403 | 403 | OK |
| CT-030 | GET `/tenants` como `tenant_owner` | 403 | 403 | OK |
| CT-031 | POST `/tenants` como `tenant_owner` | 403 | 403 | OK |
| CT-040–043 | Catálogo inválido / inexistente | 400/404 | 400/404 | OK |
| CT-050–054 | Availability inválida | 400/404 | 400/404 | OK |
| CT-060–065 | Appointment campos obrigatórios | 400 | 400 | OK |
| CT-066 | `customer_id` inexistente | 400/404 | 404 | OK |
| CT-067–068 | FK inexistente | 400/404 | 404 | OK |
| CT-069–070 | Período inválido | 400/422 | 400 | OK |
| CT-071 | Passado | 422 | 422 | OK |
| CT-072 | Sem `explicit_confirmation` | 400 | 400 | OK |
| CT-073 | `explicit_confirmation: false` | 400/422 (ou GAP) | 201 | **GAP** |
| CT-074 | `source` inválido | 400 | 400 | OK |
| CT-075 | Fora do expediente | 409 | 409 | OK |
| CT-076 | Overbooking | 409 | 409 | OK |
| CT-077 | Sobreposição parcial | 409 | 409 | OK |
| CT-080 | Idempotência mesmo body | 201 + mesmo id | 201 + mesmo id | OK |
| CT-081 | Idempotência body diferente | 409 | 409 | OK |
| CT-090–092 | Webhook (instância / payload / phone) | 404/400 | 404/400 | OK |
| CT-093 | Duplicado `message_id` | — | — | **Pendente** |
| CT-100–101 | Outbox | — | — | **Pendente** |
| CT-110–115 | Regressão mínima | 200/201/409 | conforme | OK |

---

## 5. Bugs identificados (corrigidos nesta entrega)

### BUG-1 — CT-066: `customer_id` inexistente gerava 500

- **Severidade:** Crítica (antes do fix)
- **Causa:** `INSERT` sem validação prévia do cliente no tenant.
- **Correção:** validação explícita com `CUSTOMER_NOT_FOUND` **404** em `createAppointment`.
- **Evidência:** CSV CT-066 com HTTP 404 após rebuild da imagem `api`.

### BUG-2 — CT-071: agendamento no passado era aceite (201)

- **Severidade:** Crítica (antes do fix)
- **Correção:** regra `APPOINTMENT_IN_PAST` com HTTP **422** após parse do payload.
- **Evidência:** CSV CT-071 com HTTP 422.

### BUG-3 — CT-075: fora de expediente não era garantido / payload com offset falhava validação Zod

- **Severidade:** Alta (produto + contrato de teste)
- **Correção:** `assertAppointmentFitsBusinessHours` alinhado ao calendário (`business_hours` + timezone do profissional) devolvendo **409** `SLOT_UNAVAILABLE` quando fora da janela; script usa instantes **UTC** válidos fora do expediente.
- **Evidência:** CSV CT-075 com HTTP 409.

### BUG-4 — Idempotência: segundo `POST` idêntico podia falhar com conflito de slot em vez de replay

- **Severidade:** Média
- **Correção:** lookup por `idempotency_key` antes do insert; se o payload nominal for o mesmo, devolve o registo existente (mesmo `id`); se divergir, `DUPLICATE_IDEMPOTENCY_KEY` **409**.
- **Evidência:** CSV CT-080 (duas respostas 201 com o mesmo `id`).

---

## 6. Gaps funcionais (decisão do PO)

1. **CT-020 — Header `x-tenant-id` opcional quando o JWT já contém `tenant_id`:** a API devolve **200** com lista de serviços. O script marca **GAP** face ao critério estrito do documento de testes (401/403). **Contrato documentado** em `README.md` (secção *Contexto multi-tenant*) e em `apps/api/src/openapi/spec.ts` (`info.description` e `components.securitySchemes.tenantHeader`).

2. **CT-073 — `explicit_confirmation: false` com utilizador `tenant_owner`:** a API permite **201** (confirmação imediata para perfis de balcão ou superiores na hierarquia RBAC). **Não** representa confirmação do cliente por canal próprio — ver `docs/DECISAO_PRODUTO_CT073_EXPLICIT_CONFIRMATION.md` e `POST /api/v1/appointments` no OpenAPI.

3. **CT-090 vs especificação “sem segredo”:** o script usa instância inexistente (404). Um teste adicional com instância válida **sem** `x-webhook-token` exigiria credenciais reais da massa — não automatizado aqui.

4. **CT-093 / CT-100 / CT-101:** não executados fim-a-fim por falta de credenciais de instância Evolution e de superfície de teste para outbox/worker no script. **Backlog:** `docs/BACKLOG_INBOUND_OUTBOX_QA.md`.

---

## 7. Logs da API

Comando de recolha:

`docker compose logs api --tail=150`

Os pedidos da bateria aparecem como JSON estruturado (Fastify): mistura de `200`, `400`, `401`, `403`, `404`, `409`, `422` e `201` em `POST /api/v1/appointments`, sem **500** nas validações negativas exercidas.

Cópia em ficheiro: `docs/EVIDENCIA_API_LOGS_TAIL_2026-05-14.log`.

---

## 8. Conclusão da fábrica

**Aprovado com ressalvas** para avanço do próximo pacote de desenvolvimento, desde que o PO:

1. Aceite ou ajuste o comportamento **GAP** do CT-020 (header tenant opcional com JWT completo) — **contrato já espelhado em README + OpenAPI**.
2. Registe decisão formal sobre CT-073 em `docs/DECISAO_PRODUTO_CT073_EXPLICIT_CONFIRMATION.md`.
3. Planeje execução dos CT-093 e bloco Outbox (100–101) conforme `docs/BACKLOG_INBOUND_OUTBOX_QA.md`.

**Não** houve bloqueio de ambiente nesta execução (smoke CT-000/CT-001 verdes; Postgres acessível; massa mínima presente).

---

## 9. Fecho PO / Análise de Sistemas (anexo)

Evidências consolidadas de fecho (git, script `ExitCode`, artefactos): **`docs/FECHO_QA_API_NEGATIVOS_PO_2026-05-14.md`**.

---

## 10. Escopo explícito (não homologação final)

Conforme alinhamento PO: esta rodada **libera avanço do desenvolvimento core** e **não** substitui homologação final, produção ou piloto comercial.
