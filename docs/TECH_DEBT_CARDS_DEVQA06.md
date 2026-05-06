# Cartões de dívida técnica — DEV/QA-06

## Card RLS — `users` {#card-rls-users}

- **Problema:** tabela com `tenant_id` sem `ROW LEVEL SECURITY` na base PostgreSQL.
- **Mitigação atual:** todas as queries na API usam `tenant_id` derivado do JWT / `request.tenantId`; testes `users.isolation.integration.test.ts`.
- **Destino:** migration `ENABLE ROW LEVEL SECURITY` + `FORCE` + policy `tenant_isolation`; login e rotas bootstrap via função `SECURITY DEFINER` ou role que define `app.tenant_id` antes do `SELECT` credencial.
- **Critério de fecho:** remoção de `users` da allowlist + `audit-tenant-context.mjs` verde sem exceção.

## Card RLS — `audit_logs` {#card-rls-audit-logs}

- **Problema:** idem; eventos com `tenant_id` NULL (auth) complicam política única.
- **Mitigação atual:** `listAuditLogs` com `WHERE a.tenant_id = $1`; `JOIN users` com `u.tenant_id = a.tenant_id`; testes `audit_logs.isolation.integration.test.ts`.
- **Destino:** RLS por tenant; política separada ou tabela de auditoria de sistema para eventos sem tenant.
- **Critério de fecho:** remoção de `audit_logs` da allowlist.
