# Matriz de aceite — PILOTO-STAGING-05

**Legenda:** OK | PARCIAL | PEND | BLOCKED | N/A

| # | Bloco | Critério resumido | Status | Evidência |
|---|-------|-------------------|--------|-----------|
| 1 | Outbox | Filtros status/período/provider/correlation/customer_id | PARCIAL | API+Web customer_id; demais já existiam |
| 1 | Outbox | Detalhe sanitizado + error_class | PARCIAL | `classify-outbox-error.ts` |
| 1 | Outbox | Retry manager+ + auditoria | OK | `retry-message.service.ts` |
| 1 | Outbox | Cross-tenant | PARCIAL | `outbox.isolation.integration.test.ts` |
| 1 | Outbox | Testes Web permissões | PARCIAL | `outboxRetryAccess.test.ts` |
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
