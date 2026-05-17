# Matriz de aceite — PILOTO-STAGING-04 (épico operação assistida)

**Legenda:** OK | PEND | BLOCKED | N/A  

**Proibido** mover `PEND→OK` sem **evidência objetiva** (teste automatizado nomeado ou artefacto anexado mascarado).  

**Última actualização:** governança PRs #4/#5/#6 (PO 2026-05-17) — ver `13_governanca_prs_abertos_po.md`.

---

## A. Governança e CI / Segurança processual

| # | Critério | Status | Evidência esperada |
|---|----------|--------|---------------------|
| A1 | Branch `feature/piloto-staging-04-operacao-assistida-suite-produto` criada apenas de `piloto-staging-01` | OK | `git log --oneline` + merge-base manual |
| A2 | PR #5 **fechado sem merge** | OK | `13_governanca_prs_abertos_po.md` |
| A3 | Nenhuma PR piloto dirigida erro contra `main` | OK | Só PR #6 aberto; canal único P04 |
| A4 | Tentativa automatizada erro base `main` detectada antes merge | OK | Workflow `Governance — piloto não pode targetar main`; ver `08_pr_e_ci.md` |
| A5 | PR #4 merge em `piloto-staging-01` | OK | Base `e6527e6` |
| A5b | Rebase P04 sobre `piloto-staging-01` | OK | HEAD `782b530`, 16 commits |
| A5c | PR #6 merge em `piloto-staging-01` | BLOCKED | CI verde pós-rebase + aceite PO |
| A6 | Gitleaks verde no PR piloto‑04 | PEND | Anexar run URL após primeira PR épica contra `piloto-staging-01` |

---

## B. Dashboard operacional Web

| Critério | Status | Métricas prova futura |
|----------|--------|-----------------------|
| API `GET /api/v1/operational/status` + RBAC manager+ + cross-tenant + filtros | OK | `04_testes_locais.txt`, commit `d9df160` |
| UI `/operacao/status` | OK | `operacaoStatusLabels.test.ts`, `nav.test.ts`, `route-access.test.ts`, `04_testes_locais.txt` |
| Health API / DB (painel) | OK | Incluído em operational/status |
| n8n + Evolution probe automático (API painel) | PEND | `not_probed` quando env ausente; distinto do smoke workflow |
| Smoke workflow `03_QA_Barbearia_Evolution_SendText` (reimport + Manual Trigger) | OK | `12_evolution_qa_smoke_evidencia.md`, commit `d687684`, PO 2026-05-17 |
| Filtros avançados (período/correlation) | PEND | Próxima fatia |
| Screenshots PNG piloto | PEND | `09_prints_ou_placeholders.md` |

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
