# Relatório de rastreabilidade — migrations **011** a **018** (DEV oficial)

**Instruções:** preencher pela **fábrica / DBA / DevOps** no ambiente DEV oficial. Este ficheiro substitui placeholders até evidência real.

**DATABASE_URL (mascarada):** `postgres://USER:***@HOST:***/DBNAME`

| # | Ficheiro | Objetivo (resumo) | Aplicada em DEV (sim/não) | COMMIT / sucesso (sim/não) | ERROR / ROLLBACK (sim/não + nota) | Evidência (log/ticket/commit hash) | Aceite PO (sim/não) | Pendências |
|---|----------|-------------------|---------------------------|----------------------------|-----------------------------------|-----------------------------------|---------------------|------------|
| 011 | `011_user_professional_link.sql` | `users.professional_id` + índice | | | | | | |
| 012 | `012_noop_documentation.sql` | Noop numeración + doc GAP | | | | | | |
| 013 | `013_channel_walk_in_admin.sql` | Enum `channel`: walk_in, admin | | | | | | |
| 014 | `014_support_tickets_handoff.sql` | Colunas handoff em `support_tickets` | | | | | | |
| 015 | `015_customer_restrictions_operational_v4.sql` | Tabela `customer_restrictions` + RLS | | | | | | |
| 016 | `016_recall_templates_and_sends.sql` | Recall: templates + `recall_sends` + services | | | | | | |
| 017 | `017_appointment_holds_idempotency_active.sql` | Índice único holds só `active` | | | | | | |
| 018 | `018_pix_payments.sql` | Tabela `pix_payments` + RLS | | | | | | |

## Verificações sugeridas (comando exemplo)

```sql
-- Adaptar ao sistema de tracking interno; exemplo genérico:
SELECT version, success FROM schema_migrations ORDER BY version;
```

## Declaração

- [ ] Todas as linhas 011–018 preenchidas com evidência.
- [ ] Nenhuma migration pendente com transação abortada.
- [ ] Lacuna 012 tratada (noop + `GAP_012_EXPLICACAO.md`).

**Assinatura / data:** _______________
