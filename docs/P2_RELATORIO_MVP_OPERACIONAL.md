# P2 — Relatório MVP operacional (piloto controlado)

**Estado:** arranque formal da fase — baseline registado; implementação dos blocos A–J em curso conforme brief do PO.

**Branch:** `feature/p2-operational-mvp-pilot`

**Commit base (último HEAD da P1 no momento do fork):** `f8252d205428fd45e36a81fcbab91f1250c21a4d`

---

## 1. Resumo executivo

A Fase P2 transforma a base técnica da P1 (tenant resolution, RBAC, inbound dedup, outbox idempotente, QA negativo) num **MVP operacional integrado**: ciclo completo de appointment, availability com bloqueios, portal web, WhatsApp/N8N, auditoria, lembrete pré-atendimento, outbox visível ao suporte, segurança multi-tenant e QA reprodutível.

Este ficheiro acompanha a entrega até fecho: baseline, evidências, alterações, testes, gaps e recomendação final da fábrica.

---

## 2. Baseline no arranque (pré-código P2)

Registos capturados na máquina da fábrica ao criar a branch P2 (stack já levantada).

### 2.1 `git rev-parse HEAD`

```
f8252d205428fd45e36a81fcbab91f1250c21a4d
```

### 2.2 `git log -1`

```
commit f8252d205428fd45e36a81fcbab91f1250c21a4d
Author:     Barbearia SaaS P0 <dev@barbearia-saas.local>
AuthorDate: Thu May 14 21:09:52 2026 -0300
Commit:     Barbearia SaaS P0 <dev@barbearia-saas.local>
CommitDate: Thu May 14 21:09:52 2026 -0300

    docs(p1): avoid stale embedded git hash; instruct git log/status

    Co-authored-by: Cursor <cursoragent@cursor.com>
```

### 2.3 `git status` (imediato antes de `git checkout -b feature/p2-operational-mvp-pilot`; branch de origem: `feature/p1-inbound-outbox-hardening`)

```
On branch feature/p1-inbound-outbox-hardening
Untracked files:
	.env.backup_qa
	QA_PACKAGE_BARBEARIA.zip

nothing added to commit but untracked files present (use "git add" to track)
```

**Nota:** no primeiro commit P2, `.env.backup_qa` e `QA_PACKAGE_*.zip` passaram a constar do `.gitignore` para impedir commits acidentais.

### 2.4 `docker compose ps`

```
NAME                 IMAGE                COMMAND                  SERVICE    CREATED          STATUS                    PORTS
barbearia-api        barbearia-saas-api   "docker-entrypoint.s…"   api        21 minutes ago   Up 21 minutes (healthy)   0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
barbearia-n8n        n8nio/n8n:1.91.3     "tini -- /docker-ent…"   n8n        23 hours ago     Up 2 hours (healthy)      0.0.0.0:5679->5678/tcp, [::]:5679->5678/tcp
barbearia-postgres   postgres:16-alpine   "docker-entrypoint.s…"   postgres   23 hours ago     Up 2 hours (healthy)      0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
barbearia-redis      redis:7-alpine       "docker-entrypoint.s…"   redis      23 hours ago     Up 2 hours (healthy)      0.0.0.0:6380->6379/tcp, [::]:6380->6379/tcp
barbearia-web        barbearia-saas-web   "/docker-entrypoint.…"   web        23 hours ago     Up 12 hours (healthy)     0.0.0.0:3001->80/tcp, [::]:3001->80/tcp
```

### 2.5 `curl.exe http://localhost:3000/health`

Corpo (HTTP 200):

```json
{"status":"ok"}
```

### 2.6 `curl.exe http://localhost:3000/database/health`

Corpo (HTTP 200):

```json
{"status":"ok","database":"connected"}
```

### 2.7 Commits iniciais na branch P2 (documentação de arranque)

- **Kickoff:** `66893f57d8f39b087bd14a8a87b4302faeb9f987` — `chore(p2): kickoff branch, baseline evidence, P2 docs skeleton, gitignore QA artifacts`
- **Relatório baseline:** `ac043f5c62f5eeebcc2c4451d05b3fac5eade0c1` — `docs(p2): baseline section order and gitignore note in relatório`

Após estes commits, `git status` na raiz do repositório estava **limpo** (ficheiros `.env.backup_qa` e `QA_PACKAGE_*.zip` ignorados pelo `.gitignore`).

---

## 3. Escopo por blocos (referência)

| Bloco | Tema |
| ----- | ---- |
| A | Appointment lifecycle (status, cancel, reschedule, complete, no-show) |
| B | Auditoria de eventos críticos |
| C | Availability + bloqueios (`calendar_blocks`; REST `GET|POST|DELETE /api/v1/professionals/{id}/time-blocks`) |
| D | Portal web operacional |
| E | WhatsApp / N8N ponta a ponta |
| F | Outbox operacional (listagem; retry opcional) |
| G | Lembrete simples 24h (idempotente, outbox) |
| H | Segurança multi-tenant / RBAC em novos fluxos |
| I | `scripts/qa-api-p2-operational-battery.ps1` + CSV |
| J | README, OpenAPI, runbooks e documentos P2 |

Detalhe funcional: ver brief interno da fase (secções 4–21 do kickoff PO).

---

## 3.1 Marco P2.1 — Backend appointments + availability + auditoria

Entrega incremental (branch `feature/p2-operational-mvp-pilot`):

- Validação de **`calendar_blocks`** (bloqueios manuais já existentes) na **criação**, **confirmação** e **remarcação** de agendamentos, usando o **footprint** (slot + buffers) coerente com a availability.
- **Transições:** cancelamento recusado (`409`) para `completed` / `no_show`; remarcação recusada para `completed`, `no_show`, `expired`, `rescheduled`; remarcação exige **expediente** (`assertAppointmentFitsBusinessHours`).
- **Auditoria operacional:** tabela `operational_audit_events` (migration `103_operational_audit_events.sql`), RLS por tenant, eventos nas mutações críticas de appointment; leitura **`GET /api/v1/operational-audit-events`** (RBAC `tenant_admin`).
- **RBAC no-show:** permissão `appointments.noShow` com mínimo **`attendant`** (substitui `requireRole('manager')` na rota); UI da agenda alinha o botão a `canOperateAttendance`.
- **Cancelamento:** `reason` opcional no corpo (quando enviado, ≥3 caracteres).
- **OpenAPI:** actualizado (cancel opcional, `complete`, `no-show`, operational audit).
- **Testes:** `appointments-calendar-blocks.integration.test.ts` (requer `DATABASE_URL` + `JWT_SECRET` + `REDIS_URL` na stack de integração).
- **Nota de modelo:** bloqueios por profissional são **`calendar_blocks`** com `professional_id` — equivalente funcional ao `professional_time_blocks` do brief; availability já os consumia; faltava alinhar **writes** de appointments.

---

## 4. Critérios de aceite e reprovação

Resumo: integração ponta a ponta obrigatória; sem regressão P1; sem 500 em regra de negócio; OpenAPI alinhada; `git status` limpo para ficheiros rastreados na entrega; evidências anexadas neste relatório ou em `docs/` referenciados.

---

## 5. Secções a preencher na entrega final

1. Commit final e diff de migrations  
2. Alterações API / Web / workers / N8N  
3. Testes executados (unit, integração, negativos)  
4. Resultado `qa-api-p2-operational-battery.ps1` + `docs/QA_API_P2_OPERATIONAL_RESULTS.csv`  
5. Evidências: prints portal, logs API/worker, fluxo WhatsApp, auditoria, lembrete, RBAC, cross-tenant  
6. Bugs encontrados / corrigidos; gaps; riscos  
7. **Recomendação da fábrica:** aprovado | aprovado com ressalvas | reprovado | bloqueado  

---

## 6. Conformidade com política do PO

Esta fase **não** constitui homologação final de produção ou piloto comercial até decisão explícita do PO com base em evidência objetiva.
