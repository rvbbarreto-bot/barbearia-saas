# Matriz de aceite — PILOTO-STAGING-03

**Legenda:** OK | PEND | N/A

## A. Pacote de preparação QA n8n (liberação formal para o time de QA iniciar leitura/execução guiada)

| # | Critério | Status |
|---|----------|--------|
| A1 | Documento `10_guia_inicio_testes_qa_n8n.md` entregue (pré-requisitos, variáveis, import, BDD, matriz, evidências) | OK |
| A2 | JSONs versionados em `docs/n8n/` (01, 02, 03 QA Smoke, 03 recall) espelho de `n8n/workflows/` | OK |
| A3 | `node scripts/n8n-validate-workflow-import.mjs` sem erro em `docs/n8n` e `n8n/workflows` | OK |
| A4 | Export workflows com `"active": false` (validado pelo script) | OK |
| A5 | Ausência de segredos hardcoded nos JSON (validador + revisão) | OK |
| A6 | Pasta `qa_n8n/` com instruções + `VALIDATION_SCRIPT_OUTPUT.txt` | OK |
| A7 | Governança incidente PR #2/main: `00_…` + secção **Correção documental** | OK |
| A8 | Script `n8n-validate-workflow-import.mjs` actualizado (inclui 03 QA SendText, excepção controlada) | OK |

## B. Entrega funcional completa PILOTO-STAGING-03 (ainda não aprovada para “fim de piloto” sem itens PO)

| # | Critério | Status |
|---|----------|--------|
| 1 | Branch criada a partir de `piloto-staging-01` apenas | OK (kickoff + pacote QA) |
| 2 | PR aberto **só** para `piloto-staging-01` | PEND |
| 3 | CI verde no PR (API, Web, Security npm audit, Gitleaks) | PEND |
| 4 | Workflows n8n **executados** em ambiente controlado + evidências smoke/erros (além do validador) | PEND |
| 5 | Painel operacional Web real (status + filtros + fluxo) | PEND |
| 6 | Agenda avançada sem regressão | PEND |
| 7 | Outbox + retry RBAC + classificação erros | PEND |
| 8 | Auditoria correlation_id / request_id | PEND |
| 9 | Cross-tenant + professional scope com evidência | PEND |
| 10 | Evidências finais (prints CI, logs QA completos) | PEND |
| 11 | Incidente PR #2/main documentado | OK |
| 12 | Nenhum merge em `main` desta entrega | PEND |

**Nota:** O commit **7256f19** mantém-se apenas **kickoff**; o commit `chore(piloto-03): prepare n8n QA test pack for PO approval` fecha o **pacote A** para revisão PO antes da QA operacional completa.
