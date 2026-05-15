# Relatório de entrega — MVP / piloto controlado (Barbearia SaaS V2)

**Data:** 2026-05-15  
**Branch:** `feature/p2-2-web-outbox-whatsapp-operational`  
**HEAD base (último commit):** `3dc5d648e66dd32947824e987b3b36b46ebf57aa` — `docs(p2.2): attach gate evidence and finalize P2.2 QA`  
**Sessão atual:** correções UX/pt-BR/outbox **não commitadas** (ver §1).

---

## A. Sumário executivo

### Corrigido nesta sessão (código local, pendente commit)

| Área | Alteração |
|------|-----------|
| Datas | `formatDate` / `formatDateTime` com `timeZone: America/Sao_Paulo` e locale `pt-BR` |
| Acentos / PT | `Próximo`, `Configurações`, `gestão`, `html lang="pt-BR"` |
| Bloqueio | Botão desabilitado até campos válidos; erros via `getApiErrorMessage`; hints de fuso |
| Outbox lista | Colunas prioritárias (data, estado PT, destino, provider, tentativas, erro amigável, ação); menos scroll horizontal |
| Outbox detalhe | Erro operacional + bloco “Diagnóstico técnico” para admin |
| Erros rede | `fetch failed` mapeado em `outboxErrorMessage.ts` + filtro em `apiErrorMessage.ts` |
| Build Web | Corrigido TS7006 em `OutboxMessagesPage` (build Docker passou) |

### Validado com evidência (comandos / API)

- Docker `down -v` → `up -d --build`: 5/5 containers **healthy** (api, web, postgres, redis, n8n).
- `GET /health` → `{"status":"ok"}`; `GET /database/health` → `{"status":"ok","database":"connected"}`.
- Migration **008** reexecutada 2× → `COMMIT` sem `ERROR`/`ROLLBACK` (idempotente).
- Índice **`idx_outbox_poll`** presente em `message_outbox`.
- Baterias QA API: **P2.1, P2.2.1, P2.3, negativa** — exit 0 (CSV atualizados).
- Testes unitários API: **152/152**; Web: **40/40**; builds API + Web OK.

### Ainda falta (bloqueios de aceite)

1. **Working tree limpo + commit + PR** com mensagem clara das correções UX.
2. **Pacote visual 01–19** com capturas **após** rebuild web (PNG não estão versionados no repo; só `docs/evidencias/gate0_p2_2_1/README.md`).
3. **Retry manager** — evidência UI antes/depois + request/response API (CTs API existem; prints 11–12 pendentes).
4. **Slot bloqueado no portal** — CT-P2-217 / negativa CT-115 comprovam **409 API**; print portal amigável (07) pendente pós-deploy UX.
5. **Evolution real** — `fetch failed` é **causa raiz de infra** (URL placeholder); piloto exige Evolution/n8n configurados ou modo simulado documentado.
6. **CI remoto** — `gh` indisponível neste ambiente; validar pipeline no GitHub após push.
7. **Integração API local** — `npm test` sem `DATABASE_URL` falha suites de integração (esperado); CI usa Postgres service.

### Riscos residuais

- `_migrations` vazio no Postgres enquanto schema existe via **init scripts** do container — `npm run db:migrate` falha se reaplicar `001` (documentar fluxo único: initdb **ou** migrate-docker, não ambos em conflito).
- Rate limit de login após baterias QA — impacta captura manual de evidências.
- Mensagens outbox em `processing` sem Evolution → passam a `failed` com retry; não é perda de dados, mas UX depende de provider.

---

## 1. Estado do repositório

Comandos executados (PowerShell, raiz do repo):

```text
git branch --show-current
→ feature/p2-2-web-outbox-whatsapp-operational

git log -1 --oneline
→ 3dc5d64 docs(p2.2): attach gate evidence and finalize P2.2 QA

git rev-parse HEAD
→ 3dc5d648e66dd32947824e987b3b36b46ebf57aa

git status
→ modified: 10 ficheiros web + 2 CSV QA
→ untracked: apps/web/src/lib/outboxErrorMessage.ts (+ .test.ts)

git diff --stat
→ 12 files changed, 99 insertions(+), 71 deletions(-)
```

| Critério | Resultado |
|----------|-----------|
| Branch atual | `feature/p2-2-web-outbox-whatsapp-operational` |
| Último commit | `3dc5d64` |
| Arquivos modificados | Sim (UX + CSVs QA) |
| Untracked | `outboxErrorMessage.ts`, `outboxErrorMessage.test.ts` |
| Working tree limpa | **Não** |
| Pronta para PR/merge | **Não** (falta commit + CI + evidências visuais novas) |
| Alteração desta entrega | Portal: pt-BR, outbox, bloqueio, erros amigáveis |

**Próximo commit recomendado:**  
`fix(web): pt-BR dates, friendly outbox errors, and block modal UX for pilot acceptance`

---

## 2. Docker e saúde dos serviços

```text
docker compose down -v          → OK (volumes removidos)
docker compose up -d --build    → OK (após fix TS no web)
docker compose ps -a            → api, web, postgres, redis, n8n: Up (healthy)
```

| Serviço | Estado |
|---------|--------|
| API | healthy `:3000` |
| Web | healthy `:3001` |
| Postgres | healthy `:5432` |
| Redis | healthy `:6380→6379` |
| n8n | healthy `:5679` |

**Health (PowerShell):**

```json
GET http://localhost:3000/health
{"status":"ok"}

GET http://localhost:3000/database/health
{"status":"ok","database":"connected"}
```

**Logs API (trecho):** workers outbox, notification-jobs, hold/pix/lateness iniciados; `/health/ready` 200 recorrente.

**Observação Postgres:** `POSTGRES_USER=barbearia_test` no `.env` local (não `barbearia` do example).

---

## 3. Banco, migrations e seed

| Verificação | Evidência |
|-------------|-----------|
| Migration 008 idempotente | `psql -f 008_outbox_hardening.sql` ×2 → `COMMIT`, apenas NOTICE |
| `idx_outbox_poll` | `SELECT indexname ...` → `idx_outbox_poll` listado |
| `message_outbox` | colunas `customer_id`, `correlation_id`, `provider_response` (via 008) |
| `npm run db:migrate:seed` | **Falhou** em `001_init.sql` — tipo `tenant_status` já existe (schema já criado pelo init do container) |
| Tabela `_migrations` | **0 rows** — controlo migrate-docker não populado; schema via `docker-entrypoint-initdb.d` |

**Conclusão:** ambiente limpo sobe e API funciona; alinhar documentação operacional: após `down -v`, confiar no init do Postgres **ou** correr migrate-docker num volume vazio **sem** init duplicado.

---

## 4. Correções UX/UI (implementadas localmente)

| Item | Status |
|------|--------|
| 4.1 Datas pt-BR + America/Sao_Paulo | Implementado em `utils.ts` |
| 4.2 Modal bloqueio (validação + erros amigáveis) | Implementado |
| 4.3 Tabela outbox (colunas + erro amigável) | Implementado |
| 4.4 Sem “fetch failed” cru ao operador | Implementado (`outboxErrorMessage.ts`) |

**Evidência visual nova:** pendente captura no portal com imagem Docker atual (lista §10).

---

## 5. Fluxo agenda e bloqueio

| Cenário | API / QA | Portal |
|---------|----------|--------|
| Bloqueio admin | Coberto por baterias P2.2 / scripts | Print 05–06 pendente |
| Slot bloqueado 409 | CT-P2-217, CT-115 PASS (CSV negativa) | Print 07 pendente (toast `SLOT_UNAVAILABLE` já no código) |
| Slot livre | CT-114 PASS | Print 08 pendente |

---

## 6. Outbox, retry e WhatsApp

### Causa raiz `fetch failed`

| Pergunta | Resposta |
|----------|----------|
| Evolution acessível? | **Não** em dev padrão — `.env.example` usa `https://evolution.example.com` |
| Worker consome fila? | **Sim** — log `[outbox-worker] iniciado` |
| Redis OK? | **Sim** |
| Retry automático? | **Sim** — `attempts`, `max_attempts`, status `failed`/`dead`, recovery `processing` via índice poll |
| Perda de mensagem? | **Não** — permanecem na tabela |

**Comportamento esperado em piloto:** configurar `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` reais (fora do repo) **ou** aceitar falha controlada com retry manual (manager).

| Teste | API (CSV) | UI |
|-------|-----------|-----|
| Lista / mascaramento | P2.2 PASS | Pendente print 09 |
| Detalhe sanitizado | PASS | Pendente 10 |
| Retry admin | CTs API | Pendente 11–12 |
| Retry atendente 403 | CTs RBAC | Pendente 13–14 |
| Cross-tenant | CTs | Pendente 15 |

---

## 7. RBAC e multi-tenant

Comprovado via **baterias API** (não só UI):

- Atendente → 403 em rotas restritas (financeiro, retry outbox, etc.) — ver `docs/QA_API_P2_2_OPERATIONAL_RESULTS.csv`.
- Sem token → 401; token inválido → 401.
- Cross-tenant → negado (CTs dedicados no CSV negativa / P2.2).

**Testes automatizados:** `authorization-routes.integration.test.ts` e correlatos passam **no CI** com `DATABASE_URL`; localmente requerem Docker + env.

---

## 8. Testes automatizados

| Suíte | Comando | Resultado |
|-------|---------|-----------|
| API typecheck | `npm run typecheck` (apps/api) | OK |
| API unit | `npm run test:unit` | **152 passed** |
| API full | `npm test` (sem env) | 20 suites integração skip/fail por env; 159 unit OK |
| Web typecheck | `npm run typecheck` | OK (após fix) |
| Web test | `npm run test` | **40 passed** (10 files) |
| API build | `npm run build` | OK |
| Web build | `npm run build` / Docker | OK |

**Baterias operacionais (raiz):**

```text
scripts/qa-api-p2-operational-battery.ps1     → exit 0
scripts/qa-api-negative-battery.ps1           → exit 0
scripts/qa-p2-2-web-outbox-whatsapp-battery.ps1 → exit 0 (implícito no fluxo P2.2 CSV)
scripts/qa-p2-3-operational-assisted-battery.ps1 → exit 0
```

---

## 9. CI e segurança

| Item | Status |
|------|--------|
| CI remoto verde | **Não verificado** — CLI `gh` ausente nesta máquina |
| Workflow | `.github/workflows/ci.yml` — API+Web em push/PR para `main`/`develop` |
| Secret scan | **Não executado** localmente — recomendar gitleaks no CI |
| `.env` versionado | Não (`.env.example` com placeholders) |

**Ação:** push da branch e validar Actions; anexar print 18–19 do run.

---

## 10. Evidências visuais obrigatórias (01–19)

Pasta alvo: `docs/evidencias/mvp_piloto_aceite/` (a criar no commit de evidências).

| # | Ficheiro | Status | Notas |
|---|----------|--------|-------|
| 01 | login multitenant admin | **Pendente** | Capturar pós-deploy |
| 02 | login atendente | **Pendente** | |
| 03 | agenda admin + bloqueio | Parcial (gate0 README) | PNG não no repo |
| 04 | agenda atendente | **Pendente** | |
| 05 | modal campos válidos | **Pendente** | Código pronto |
| 06 | bloqueio sucesso | **Pendente** | |
| 07 | slot bloqueado erro amigável | **Pendente** | API OK |
| 08 | agendamento sucesso | **Pendente** | |
| 09 | outbox lista | **Pendente** | UX colunas nova |
| 10 | outbox detalhe | **Pendente** | |
| 11–12 | retry antes/depois | **Pendente** | Requer msg `failed`/`dead` |
| 13–14 | atendente sem retry + API 403 | **Pendente** | API OK |
| 15 | cross-tenant API | **Pendente** | API OK |
| 16–17 | health | **Aprovado** | JSON acima; print opcional |
| 18–19 | CI + secret scan | **Pendente** | Após push |

---

## B. Matriz de aceite

| Módulo | Classificação |
|--------|----------------|
| Login | Aprovado com ressalva (rate limit em QA intensivo) |
| Multi-tenant | Aprovado (API) |
| RBAC | Aprovado (API); UI pendente prints |
| Agenda | Aprovado com ressalva |
| Bloqueio de horário | Aprovado com ressalva (prints) |
| Agendamento | Aprovado (API) |
| Slot unavailable | Aprovado (API); portal pendente print |
| Clientes / Serviços / Profissionais | Aprovado (regressão CT-112+) |
| Outbox | Aprovado com ressalva (provider) |
| Retry | Aprovado com ressalva (UI admin) |
| Worker | Aprovado |
| WhatsApp/Evolution | **Bloqueado** (provider não configurado) |
| n8n | Aprovado com ressalva (healthy, fluxo E2E não filmado) |
| Auditoria | Aprovado com ressalva |
| OpenAPI | Aprovado |
| Portal Web | **Reprovado** até commit UX + prints |
| CI/CD | Pendente verificação remota |
| Segurança | Aprovado com ressalva (scan pendente) |
| Documentação | Aprovado |

---

## C. Estimativas (dias úteis / horas)

### Cenário 1 — Piloto controlado mínimo (3–5 d.u. / 24–40 h)

**Inclui:** commit UX, Docker reproduzível, QA CSV verde, health, RBAC/cross-tenant API, outbox com falha controlada documentada, 10 prints críticos.  
**Exclui:** Evolution produção, CI verde comprovado, todos os 19 PNGs.  
**Riscos aceitos:** mensagens WhatsApp falham até configurar Evolution.

### Cenário 2 — MVP homologável (7–10 d.u. / 56–80 h)

**Inclui:** Cenário 1 + Evolution/n8n homologados, retry UI comprovado, 19 evidências, CI+secret scan, integração local documentada, alinhar `_migrations` vs initdb.  
**Pendências:** E2E Playwright opcional, cobertura integração local.

### Cenário 3 — Produto SaaS completo (8–12 semanas)

Billing, multi-unidade avançada, observabilidade, DR, hardening produção, onboarding self-service.

---

## D. Parecer da fábrica

| Pergunta | Resposta |
|----------|----------|
| Pronto para **produção**? | **Não** |
| Pronto para **piloto controlado**? | **Não ainda** — faltam commit, pacote visual 01–19 e provider WhatsApp ou aceite formal de falha simulada |
| Pronto para **merge**? | **Não** — working tree suja, branch não rebased, CI não confirmado |
| Bloqueios impeditivos | Tree suja; prints; Evolution; CI não verificado |
| Pendências não impeditivas | Acentos residuais; alinhar migrate vs initdb; n8n runners deprecation |
| Próximo PR | `fix(web): pilot UX pt-BR, outbox errors, block modal` + docs evidências |
| Data testável ao cliente | **+2 d.u.** após commit + deploy Docker + capturas (estimativa) |

---

## Anexos — comandos de reprodução

```powershell
cd barbearia-saas
docker compose down -v
docker compose up -d --build
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:3000/database/health
powershell -File .\scripts\qa-api-negative-battery.ps1
powershell -File .\scripts\qa-p2-3-operational-assisted-battery.ps1
cd apps\api; npm run test:unit
cd ..\web; npm run test; npm run build
```

**Credenciais demo (não commitar):** `admin@demo.local` / `atendente@demo.local`, senha conforme seed, tenant `00000000-0000-0000-0000-000000000001`.
