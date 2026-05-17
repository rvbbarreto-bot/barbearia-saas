# Matriz de aceite — PILOTO-STAGING-05

**Legenda:** OK | PARCIAL | PEND | BLOCKED | N/A

| # | Bloco | Critério resumido | Status | Evidência |
|---|-------|-------------------|--------|-----------|
| 1 | Outbox | Filtros + error_class + customer_id | OK | API+Web+OpenAPI |
| 1 | Outbox | Detalhe sanitizado + error_class | OK | `classify-outbox-error.ts` |
| 1 | Outbox | Retry manager+ + auditoria | OK | `05_evidencia_retry_rbac_api.md` |
| 1 | Outbox | Cross-tenant | OK | `05_evidencia_cross_tenant_outbox.md` |
| 1 | Outbox | Testes Web render/empty/error/filtros | OK | `OutboxMessagesPage.test.tsx` |
| 1 | Outbox | Prints PNG P01-P10 | OK | `prints/` |
| 1 | Outbox | PR #7 vs piloto-staging-01 | OK | https://github.com/rvbbarreto-bot/barbearia-saas/pull/7 |
| 1 | Outbox | CI verde PR (8 checks) | OK | `04_saida_pr7_ci_verde.txt` |
| 1 | Outbox | Relatório testes | OK | `04_testes_locais_bloco1.txt` |
| 1 | Outbox | Investigação check vermelho | OK | `12_ci_investigacao_e93f9cd.md` |
| 2 | Auditoria | correlation_id + UI read-only | PEND | |
| 3 | Gerencial | KPIs + CSV | PEND | |
| 4 | Cliente 360 | Histórico RBAC | PEND | |
| 5 | Waitlist | Fila + conversão | PEND | |
| 6 | Financeiro | Receita + CSV | PEND | |
| 7 | Comissão | Regras + pago | PEND | |
| 8 | n8n 01/02 | Revalidação + evidências | PEND | |
| 9 | Recall | Candidatos only | PEND | |
| 10 | Portal | Token expiração | PEND | |

**Aceite PO:** PR vs `piloto-staging-01` + CI verde + QA + sem regressão smoke/agenda.
