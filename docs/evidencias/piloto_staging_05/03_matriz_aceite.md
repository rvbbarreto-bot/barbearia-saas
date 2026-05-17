# Matriz de aceite — PILOTO-STAGING-05

**Legenda:** OK | PARCIAL | PEND | BLOCKED | N/A

| # | Bloco | Critério resumido | Status | Evidência |
|---|-------|-------------------|--------|-----------|
| 1 | Outbox | Filtros + error_class + customer_id | OK | API+Web+OpenAPI |
| 1 | Outbox | Detalhe sanitizado + error_class | OK | `classify-outbox-error.ts` |
| 1 | Outbox | Retry manager+ + auditoria | OK | `05_evidencia_retry_rbac_api.md` |
| 1 | Outbox | Cross-tenant | OK | `05_evidencia_cross_tenant_outbox.md` |
| 1 | Outbox | Testes Web render/empty/error/filtros | OK | `OutboxMessagesPage.test.tsx` |
| 1 | Outbox | Prints PNG Web P01-P09 | OK | `prints/` + `10_relatorio_bloco1_outbox.md` |
| 1 | Outbox | Print P10 PR CI | PEND | Após `gh pr create` |
| 1 | Outbox | PR + CI verde | PEND | `11_pr_piloto05.md` |
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
