# Allowlist RLS — `users` e `audit_logs`

Este documento responde à revisão **DEV/QA-06** sobre `scripts/audit-tenant-context-allowlist.json`: justificativa arquitetural, classificação e riscos. Metadados espelhados em `entryMetadata` no mesmo JSON (o script `audit-tenant-context.mjs` só usa `ignoreTablesMissingRls` para pass/fail).

## Respostas objetivas

| Pergunta | `users` | `audit_logs` |
|----------|---------|----------------|
| Possui `tenant_id`? | Sim (NOT NULL operacional) | Sim (nullable — eventos auth/sistema podem usar NULL) |
| Tem RLS na base? | **Não** | **Não** |
| Deveria ter RLS? | **Sim**, como defesa em profundidade após resolver bootstrap de login (`SECURITY DEFINER` / role dedicada). | **Sim**, após políticas claras para `tenant_id IS NULL` vs leitura `tenant_admin`. |
| Quem pode consultar todos os `users`? | Apenas código com acesso à role DB; na API, rotas exigem JWT + `tenant_id` no contexto; **não há** endpoint público multi-tenant. `platform_admin` usa rotas `tenants/*`, não lista global de `users` por tenant. | Idem; leitura típica via `GET /audit-logs` com `WHERE tenant_id = $1`. |
| `tenant_admin` vê só o seu tenant? | **Sim** (serviço: `WHERE tenant_id = $1`). | **Sim** (`listAuditLogs`). |
| `platform_admin` vê tudo? | RBAC permite papel; rotas `/users` ainda filtram por `request.tenantId` do JWT — o admin da plataforma opera **com** um tenant no contexto ou usa rotas de tenants, não um “dump” global de `users`. | Mesmo padrão: sem rota de auditoria global nesta API. |
| Risco LGPD? | Residual: sem RLS, um bug de query sem `tenant_id` na app poderia expor emails/nomes. Mitigação atual: queries parametrizadas com `tenant_id`; testes de isolamento; roadmap RLS. | Residual: logs podem conter dados pessoais em `before`/`after`; acesso restrito a `tenant_admin`; mesma dívida RLS. |

## Classificação

| Tabela | Classificação DEV/QA-06 | Justificativa |
|--------|-------------------------|---------------|
| `users` | **Temporária** | Isolamento garantido por cláusulas SQL na camada de serviço + JWT + `tenant_id` no middleware. RLS pendente para alinhar ao resto do schema. |
| `audit_logs` | **Temporária** | Listagem força `tenant_id`; escritas usam transação tenant ou `tenant_id` explícito. RLS pendente para `NULL` e leituras futuras. |

Não são: exceção permanente sem plano, “tabela global”, nem `platform_admin` sem regra — a regra é **sempre filtrar por tenant na aplicação** até existir RLS.

## Testes

- `apps/api/src/modules/users/users.isolation.integration.test.ts`
- `apps/api/src/modules/audit/audit_logs.isolation.integration.test.ts`

## `webhook_events`

Corrigida em `022_webhook_events_enable_rls.sql` — fora da allowlist.
