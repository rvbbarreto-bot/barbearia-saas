# Matriz de aceite — PILOTO-STAGING-04 (épico operação assistida)

**Legenda:** OK | PEND | BLOCKED | N/A  

**Proibido** mover `PEND→OK` sem **evidência objetiva** (teste automatizado nomeado ou artefacto anexado mascarado).  

**Última actualização estrutura:** kickoff apenas — maioria marcada **`PEND`**.

---

## A. Governança e CI / Segurança processual

| # | Critério | Status | Evidência esperada |
|---|----------|--------|---------------------|
| A1 | Branch `feature/piloto-staging-04-operacao-assistida-suite-produto` criada apenas de `piloto-staging-01` | OK | `git log --oneline` + merge-base manual |
| A2 | PR #5 contra `main` **fechado sem merge** | PEND | Screenshot/GitHub estado + `piloto_staging_03/qa_n8n/22_*` modelo |
| A3 | Nenhuma PR piloto dirigida erro contra `main` (processo GH) | PEND | Lista PRs repo + review manual periódica |
| A3b | Tentativa automatizada erro base `main` detectada antes merge | OK | Workflow `Governance — piloto não pode targetar main` deve falhar nesse cenário |
| A4 | Job CI bloqueador `feature/piloto-staging-*` → `main` | OK | Workflow `governance-piloto-no-main.yml`; ver `08_pr_e_ci.md` |
| A5 | PR épico apenas contra `piloto-staging-01` | BLOCKED até abertura real PR oficial | —
| A6 | Gitleaks continuando verde pushes filho | OK histórico | CI job `gitleaks` já existente |

---

## B. Dashboard operacional Web

| Critério | Status | Métricas prova futura |
|----------|--------|-----------------------|
| Health API / DB | PEND | Screenshot sanitizado chamando `/health/ready`, DB indicator |
| n8n + Evolution reachable flags | PEND | Mock ou probing seguro apenas DEV |
| Workers + outbox estados consolidados UI | PEND | —
| Lista últimos erros operativos filtros temporal | PEND | Playwright/smoke opcional |

---

## C. Dashboard gerencial

| KPI / painel | Status |
|--------------|--------|
| Agendas / Cancel / No‑show | PEND |
| Mensagens falhas/enviadas | PEND |
| Receita estimada | PEND |
| Per profissionais / período | PEND |

---

## D. Agenda avançada

Todos **PEND** até PR `feat(agenda)`: timeline vida, RBAC papel, mensagens utilizador UX, cross‑tenant tests.

---

## E. Outbox operacional UI + API filtros RBAC retries

Todos **PEND** até branch subseq.

---

## F. Auditoria rastreada

Todos **PEND** — modelo dados + endpoints read-only sanitized.

---

## G. Waitlist

Todos **PEND** — inclusão cliente + sugere slots + converte agora com integridade única índices.

---

## H. Financeiro mínimo

Todos **PEND** — valores serviços agregados relatórios.

---

## I. Comissão básica

Todos **PEND** — cálculo unitários explícitos.

---

## J. Histórico cliente

Todos **PEND** mascaramento obrigatório.

---

## K. Portal básico tokenizado

Todos **PEND política segurança expirações**.

---

## L. Recall seguro

Todos **PEND** apenas candidatos primeiro.

---

## M. Segurança plataforma reforços

Ampliações **PEND** — regressão garantida apenas após caso teste reproducível.
