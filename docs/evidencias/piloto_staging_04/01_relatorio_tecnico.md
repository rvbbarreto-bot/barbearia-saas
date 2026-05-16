# Relatório técnico — PILOTO-STAGING-04 (kickoff épico)

**Branch obrigatória:** `feature/piloto-staging-04-operacao-assistida-suite-produto`  
**Base obrigatória:** `piloto-staging-01`  
**SHA inicial recomendável (pai `piloto-staging-01` no branching):** `f1955e0` — confirmar na máquina de build com:

`git merge-base HEAD origin/piloto-staging-01`

**SHA final kickoff infra:** registar aqui ao fechar primeira PR épica piloto‑04 (`git rev-parse HEAD` após último push do kickoff).

## 1. Objectivo épico

Suíte operacional assistida de produto maior: dashboards (operacional + gerencial), agenda avançada, outbox observável com retry segregado por papel, auditoria operacional ponta‑a‑ponta (`correlation_id` / `request_id`), waitlist com conversão segura para slot livre, financeiro mínimo no agendamento, comissionamento simples sobre conclusões, histórico de cliente, portal por link tokenizado para self‑service restrito de agendamento, recall seguro apenas com evidência de consentimento/flags — **sem** regressão RBAC nem vazamentos cross‑tenant.

## 2. O que já foi entregue neste kickoff (somente infra & governança)

| Entrega | Estado |
|---------|--------|
| Branch criada a partir exclusivamente de `piloto-staging-01` | OK |
| Job GitHub falha sempre que existe PR **`feature/piloto-staging-*`** com **base `main`** | OK — `governance-piloto-no-main.yml` |
| CI em **push** desta branch de feature lista em `ci.yml` | OK |
| Pasta evidências PILOTO‑04 inicial | OK |

## 3. Implementação aplicacional (bloque seguinte PRs)

Todos os bullets A→M solicitados pela GP constituem trabalho volumoso distribuído em múltiplos commits/atómicos `feat*` / `test*` referidos pela PO sheet.

## 4. Estado relativo aos PRs PILOTO‑03

Antes/desenvolvimento paralelo:

- PR **#5** contra **`main`** continua sendo **infração**: deve permanecer **fechado sem merge** pelo administrador GitHub (**não acionável** pelo agent neste sandbox sem `GITHUB_TOKEN`).
- PR **#4** continua sendo o canal formal **PILOTO‑STAGING‑03**, **base `piloto-staging-01`**, até decisão novo merge pela GP (**separado** desta PILOTO‑04 nova PR).

Consultar sempre `docs/evidencias/piloto_staging_03/01_governanca_incidente_pr5_base_main.md`.

## 5. Orientação aos devs seguintes PRs incremental

Implementar apenas fatias revisáveis, protegidas por toggles/feature flags sempre que aplicável ao risco regressivo alto (ex.: portal novo). Se escopo ficar incompleto: **marcar matriz BLOCKED|PEND**, justificar causa, estimativa horas, **sem** regressão aos fluxos já verdes no `ci.yml`.
