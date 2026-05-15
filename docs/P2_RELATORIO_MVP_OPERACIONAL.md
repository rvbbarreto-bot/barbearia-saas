# P2 — Relatório MVP operacional (piloto controlado)

**Estado:** **P2.1 fechada tecnicamente** (§7.3); **P2.2 / P2.3 — Grande Pacote Operacional** em curso na branch **`feature/p2-2-web-outbox-whatsapp-operational`** (kickoff **§10**). A fase P2 global (blocos A–J) continua até fecho formal pelo PO.

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
- **RBAC no-show:** permissão `appointments.noShow` para papéis de balcão (**`attendant`** e **`tenant_admin`**); o papel **`professional`** fica **explicitamente excluído** (decisão de produto). Na UI da agenda, o botão alinha-se a **`canDesk`** (não `canOperateAttendance`).
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

---

## 7. Marco P2.1 — decisões PO

**Fecho técnico P2.1:** **§7.3** (HEAD na aprovação PO **`13cdd17835c9525290107a3ed36fb46fde30cc3c`**; tip consolidado relatório **`d02c273b0836e636739b3dfb4dca0d3eab69edf3`** — **§9**).

### 7.1 Primeira decisão PO (com ressalvas — histórico)

**Data de registo (documentação):** 2026-05-14.

- **Decisão:** aprovado com ressalvas obrigatórias; **não** representa fecho completo da P2, homologação final nem liberação de piloto.
- **Pontos aprovados (resumo):** correção do mock `isOutboxForceSendFailureRuntime`; `npm run test:unit` na API (140 testes); bateria `scripts/qa-api-p2-operational-battery.ps1` com exit `0`; `docs/QA_API_P2_OPERATIONAL_RESULTS.csv` atualizado; correção do 500 em POST de time-blocks via migrations **103** e **104**; RBAC no-show com exclusão de `professional`; ajuste em `AppointmentDrawer.tsx`; `rbac.test.ts`, OpenAPI e `P2_APPOINTMENT_LIFECYCLE.md`; `npm run typecheck` no Web; commit de referência da entrega funcional **`a30b0fcd40049cd863f8769a4267a4d3de256e57`**. Fecho das ressalvas obrigatórias (fluxo de migrations, runbook, evidências neste relatório): **`9ffc7ba972adae420522069f6f32ae439a839b3d`**, refresh do CSV de QA **`d19dc8461e1b7cfeb03fa71be3fb78706fa9c512`** (base do snapshot operacional em §8); commits posteriores podem ser só documentais — ver `git log`.

### 7.2 Ressalvas atendidas nesta versão do repositório

1. **Migrations 103/104 sem `docker exec` manual por ambiente:** fluxo oficial versionado — `npm run db:migrate` (`scripts/migrate-docker.mjs`, mesma tabela `_migrations` que `migrate.sh`) ou `./migrate.sh` com `psql` local; **`npm run db:migrate:backfill -- --through …`** quando o volume veio só do `initdb` e `_migrations` está vazia (ver `README.md`). Documentado em `README.md`, `docs/P2_QA_EXECUCAO.md`, `docs/P2_RUNBOOK_SUPORTE.md` (bloco **«Primeiro deploy após P2.1»**).
2. **Relatório:** evidências operacionais em **§8** (git, compose, health, logs, QA). **Working tree:** ver nota em §8.6 — distinguir ficheiros rastreados vs ignorados/local-only.

### 7.3 Fecho técnico P2.1 — decisão PO (aprovação para fechamento)

**Data de registo:** 2026-05-14.

- **Decisão:** P2.1 **aprovada para fechamento técnico**. As ressalvas anteriores foram tratadas de forma satisfatória.
- **Commit funcional P2.1 (implementação):** **`a30b0fcd40049cd863f8769a4267a4d3de256e57`**.
- **HEAD na aprovação PO (fecho técnico comunicado):** **`13cdd17835c9525290107a3ed36fb46fde30cc3c`**.
- **HEAD do repositório após registo desta decisão e do baseline P2.2 no relatório:** **`dfcbf194e9ece80db9eb3fad2d3955dba7a9e929`** (primeiro registo §7.3/§9).
- **Tip consolidado na fábrica antes do primeiro código P2.2 (último commit só de relatório):** **`d02c273b0836e636739b3dfb4dca0d3eab69edf3`** (ver **§9**).

**Pontos aprovados (síntese PO):** (1) `scripts/migrate-docker.mjs`; (2) `npm run db:migrate`, `db:migrate:dry-run`, `db:migrate:seed`, `db:migrate:backfill`; (3) backfill do registo de migrations para volumes antigos criados via `initdb`; (4) `migrate.sh` a apontar para o fluxo oficial; (5) README com «Primeiro deploy após P2.1»; (6) `docs/P2_RUNBOOK_SUPORTE.md` e `docs/P2_QA_EXECUCAO.md`; (7) relatório P2 com decisão PO, evidências, logs, health, database health, `docker compose ps` e QA exit `0`; (8) CSV da bateria QA P2.1; (9) clarificação de working tree limpo para ficheiros rastreados; (10) manutenção do commit funcional **a30b0fc** e da documentação até ao HEAD **`13cdd17`** na aprovação, consolidada nos commits de relatório **`dfcbf19`** e **`d02c273`** (tip antes de P2.2 — **§9**).

**Observações de controlo (operador):**

- **`db:migrate:backfill`** apenas quando o operador **confirmar** que as migrations anteriores ao limite `--through` estão **fisicamente** reflectidas no banco.
- Em **cada ambiente**, após `migration` / `backfill`: **smoke técnico** e **QA aplicável**.
- Esta aprovação **fecha a P2.1**; **não** representa aprovação da P2 completa, homologação final, produção nem piloto comercial.

**Autorizado:** avançar para **P2.2** — portal web operacional a consumir appointments, time-blocks, no-show, cancelamento, remarcação e availability. **Baseline de código:** **§9**.

### 7.4 Encaminhamento (pós-P2.1)

Manter runbooks e fluxo de migrations em todos os ambientes; executar **§9** como ponto de partida antes do primeiro commit P2.2.

---

## 8. Evidências anexas — snapshot P2.1 (fábrica)

Stack (Docker, health, logs, bateria QA) capturada na mesma sessão em que o repositório estava no commit **`d19dc8461e1b7cfeb03fa71be3fb78706fa9c512`** (`chore(qa): refresh P2 operational battery CSV`). Ordem de integração na branch: **`a30b0fcd40049cd863f8769a4267a4d3de256e57`** (feat P2.1) → **`9ffc7ba972adae420522069f6f32ae439a839b3d`** (fluxo `npm run db:migrate` + backfill + runbooks) → **`d19dc8461e1b7cfeb03fa71be3fb78706fa9c512`** (CSV QA; base do snapshot §8) → commits de documentação até **`13cdd17835c9525290107a3ed36fb46fde30cc3c`**, **`dfcbf194e9ece80db9eb3fad2d3955dba7a9e929`**, **`d02c273b0836e636739b3dfb4dca0d3eab69edf3`** (consolidação §7.3/§8/§9; baseline P2.2 — ver **§9** e nota de rodapé). Para o **tip** num clone, execute `git rev-parse HEAD`.

### 8.1 `git log -1` (congelado no commit da bateria QA)

```
commit d19dc8461e1b7cfeb03fa71be3fb78706fa9c512
Author:     Barbearia SaaS P0 <dev@barbearia-saas.local>
AuthorDate: Thu May 14 22:09:07 2026 -0300
Commit:     Barbearia SaaS P0 <dev@barbearia-saas.local>
CommitDate: Thu May 14 22:09:07 2026 -0300

    chore(qa): refresh P2 operational battery CSV
    
    Co-authored-by: Cursor <cursoragent@cursor.com>
```

### 8.2 `git rev-parse HEAD` (congelado no mesmo commit)

```
d19dc8461e1b7cfeb03fa71be3fb78706fa9c512
```

### 8.3 `git status`

```
On branch feature/p2-operational-mvp-pilot
nothing to commit, working tree clean
```

### 8.4 `docker compose ps`

```
NAME                 IMAGE                COMMAND                  SERVICE    CREATED         STATUS                   PORTS
barbearia-api        barbearia-saas-api   "docker-entrypoint.s…"   api        7 minutes ago   Up 7 minutes (healthy)   0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
barbearia-n8n        n8nio/n8n:1.91.3     "tini -- /docker-ent…"   n8n        23 hours ago   Up 3 hours (healthy)     0.0.0.0:5679->5678/tcp, [::]:5679->5678/tcp
barbearia-postgres   postgres:16-alpine   "docker-entrypoint.s…"   postgres   23 hours ago   Up 3 hours (healthy)     0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
barbearia-redis      redis:7-alpine       "docker-entrypoint.s…"   redis      23 hours ago   Up 3 hours (healthy)     0.0.0.0:6380->6379/tcp, [::]:6380->6379/tcp
barbearia-web        barbearia-saas-web   "/docker-entrypoint.…"   web        23 hours ago   Up 13 hours (healthy)    0.0.0.0:3001->80/tcp, [::]:3001->80/tcp
```

### 8.5 `GET http://localhost:3000/health` e `GET http://localhost:3000/database/health`

Corpo **/health** (HTTP 200):

```
{"status":"ok"}
```

Corpo **/database/health** (HTTP 200):

```
{"status":"ok","database":"connected"}
```

### 8.6 Nota sobre working tree

**Interpretação (§8.3):** o working tree está **limpo** para ficheiros rastreados (`nothing to commit, working tree clean`). Ficheiros ignorados pelo `.gitignore` ou artefactos locais não listados pelo `git status` podem existir noutros clones — tratar como **local-only** se aplicável.

### 8.7 Logs finais da API (trecho)

```
barbearia-api  | {"level":30,"time":1778807130986,"pid":1,"hostname":"7b3d4a36f60d","reqId":"77e74711-47d8-4284-8889-9856538e6166","req":{"method":"GET","url":"/health","requestId":"77e74711-47d8-4284-8889-9856538e6166"},"msg":"incoming request"}
barbearia-api  | {"level":30,"time":1778807130986,"pid":1,"hostname":"7b3d4a36f60d","reqId":"77e74711-47d8-4284-8889-9856538e6166","res":{"statusCode":200},"responseTime":0.7474939972162247,"msg":"request completed"}
barbearia-api  | {"level":30,"time":1778807131028,"pid":1,"hostname":"7b3d4a36f60d","reqId":"1d705bf2-9572-41cd-a21d-e2202858b82c","req":{"method":"GET","url":"/database/health","requestId":"1d705bf2-9572-41cd-a21d-e2202858b82c"},"msg":"incoming request"}
barbearia-api  | {"level":30,"time":1778807131029,"pid":1,"hostname":"7b3d4a36f60d","reqId":"1d705bf2-9572-41cd-a21d-e2202858b82c","res":{"statusCode":200},"responseTime":1.0138679966330528,"msg":"request completed"}
(... linhas anteriores de healthcheck interno `GET /health/ready` omitidas — ver `docker compose logs api` no ambiente.)
```

### 8.8 Execução `qa-api-p2-operational-battery.ps1` (exit code 0)

```
CSV escrito: C:\Users\Ricardo\OneDrive\Empresas Ricardo\Exeq\Projeto_Barbearia_V2\barbearia_saas_pacote_fabrica\barbearia-saas\docs\QA_API_P2_OPERATIONAL_RESULTS.csv
Bateria P2.1: OK.
EXIT_CODE=0
```

---

## 9. P2.2 — baseline de arranque (ponto de partida)

Registo na **fábrica** após consolidação no relatório do fecho técnico P2.1 (**§7.3**). Branch: **`feature/p2-operational-mvp-pilot`**. O commit **`13cdd17835c9525290107a3ed36fb46fde30cc3c`** corresponde ao HEAD referido na **aprovação PO**; **`dfcbf194e9ece80db9eb3fad2d3955dba7a9e929`** regista §7.3/§9 iniciais; o **tip** em **§9.1** reflecte o último commit de consolidação do relatório antes do primeiro código P2.2.

### 9.1 `git rev-parse HEAD`

```
d02c273b0836e636739b3dfb4dca0d3eab69edf3
```

### 9.2 `git log -1`

```
commit d02c273b0836e636739b3dfb4dca0d3eab69edf3
Author:     Barbearia SaaS P0 <dev@barbearia-saas.local>
AuthorDate: Thu May 14 22:17:03 2026 -0300
Commit:     Barbearia SaaS P0 <dev@barbearia-saas.local>
CommitDate: Thu May 14 22:17:03 2026 -0300

    docs(p2): align §7.3/§8 chain and §9 baseline with approval HEAD dfcbf19
    
    Co-authored-by: Cursor <cursoragent@cursor.com>
```

### 9.3 `git status`

```
On branch feature/p2-operational-mvp-pilot
nothing to commit, working tree clean
```

**Referência de implementação P2.1 (API / regras):** commit **`a30b0fcd40049cd863f8769a4267a4d3de256e57`**. Evidências de stack e bateria QA no estado congelado em **§8**.

*Identificador canónico em qualquer clone: executar na raiz `git rev-parse HEAD` após `git pull` até ao último commit desta branch, com working tree limpo.*

---

## 10. P2.2 / P2.3 — Grande Pacote Operacional (kickoff)

**Data de registo:** 2026-05-14.

**Decisão PO:** P2.1 fechada tecnicamente; arranque imediato da entrega **P2.2 / P2.3** — portal web operacional, outbox para suporte, WhatsApp/N8N mínimo, tratamento de erros, QA ampliado, OpenAPI e evidências (ver brief interno do PO).

**Branch:** `feature/p2-2-web-outbox-whatsapp-operational`

**Commit base (último HEAD da P2.1 no momento do `git checkout -b`):** `f57b1a3dafe596111fb1314d949f0976e8d78dd7`

**Primeiro commit na branch P2.2 (registo kickoff no repositório):** `2218163936d5c949f5e43585c83213c82df38ca8` — `chore(p2.2): kickoff branch, baseline evidence, P2.2 scope doc`

### 10.1 Evidências no arranque (fábrica)

#### `git status`

```
On branch feature/p2-2-web-outbox-whatsapp-operational
nothing to commit, working tree clean
```

#### `git log -1`

```
commit f57b1a3dafe596111fb1314d949f0976e8d78dd7
Author:     Barbearia SaaS P0 <dev@barbearia-saas.local>
AuthorDate: Thu May 14 22:18:17 2026 -0300
Commit:     Barbearia SaaS P0 <dev@barbearia-saas.local>
CommitDate: Thu May 14 22:18:17 2026 -0300

    docs(p2): set §9 factory tip to d02c273 and clarify commit chain
    
    Co-authored-by: Cursor <cursoragent@cursor.com>
```

#### `git rev-parse HEAD`

```
f57b1a3dafe596111fb1314d949f0976e8d78dd7
```

#### `docker compose ps`

```
NAME                 IMAGE                COMMAND                  SERVICE    CREATED          STATUS                    PORTS
barbearia-api        barbearia-saas-api   "docker-entrypoint.s…"   api        25 minutes ago   Up 25 minutes (healthy)   0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
barbearia-n8n        n8nio/n8n:1.91.3     "tini -- /docker-ent…"   n8n        24 hours ago     Up 3 hours (healthy)      0.0.0.0:5679->5678/tcp, [::]:5679->5678/tcp
barbearia-postgres   postgres:16-alpine   "docker-entrypoint.s…"   postgres   24 hours ago     Up 3 hours (healthy)      0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
barbearia-redis      redis:7-alpine       "docker-entrypoint.s…"   redis      24 hours ago     Up 3 hours (healthy)      0.0.0.0:6380->6379/tcp, [::]:6380->6379/tcp
barbearia-web        barbearia-saas-web   "/docker-entrypoint.…"   web        24 hours ago     Up 13 hours (healthy)     0.0.0.0:3001->80/tcp, [::]:3001->80/tcp
```

#### `GET http://localhost:3000/health` (HTTP 200)

```json
{"status":"ok"}
```

#### `GET http://localhost:3000/database/health` (HTTP 200)

```json
{"status":"ok","database":"connected"}
```

#### `npm run db:migrate:dry-run` (trecho final)

```
  DRY   103_operational_audit_events.sql (pendente)
  DRY   104_calendar_blocks_created_by.sql (pendente)

Dry-run: 29 pendentes (não executadas), 0 já registadas em _migrations.
Concluído.
```

**Interpretação:** o resultado acima indica que, neste volume Postgres, a tabela `_migrations` está **vazia** apesar do esquema ter sido criado pelo `initdb` (cenário documentado no `README.md`). **Não** correr `npm run db:migrate` sem `db:migrate:backfill --through …` alinhado ao que já está aplicado no volume, ou sem recriar o volume em desenvolvimento. Em ambientes com `_migrations` sincronizada, esperam-se linhas `SKIP` para ficheiros já aplicados.

### 10.2 Regras obrigatórias (controlo)

- Não commitar `.env` real, `.env.backup_qa`, ZIP local, tokens ou secrets.
- Não remover testes nem quebrar scripts QA existentes (P1, P2.1).
- OpenAPI alinhada a qualquer alteração de contrato.
- Sem `catch` genérico a mascarar erros; sem 500 em regra de negócio esperada.
- Entrega com relatório e evidências.

### 10.3 Próximo passo (fábrica)

Implementação integrada dos blocos A–I descritos em `docs/P2_2_PORTAL_OPERACIONAL.md` (portal, availability/time-blocks, erros, outbox, WhatsApp/N8N, auditoria no portal, QA P2.2, documentação, hardening).
