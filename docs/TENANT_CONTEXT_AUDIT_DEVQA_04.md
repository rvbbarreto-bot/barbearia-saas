# Auditoria de tenant context — DEV/QA-04

**Data:** 2026-05-03  
**Âmbito:** alinhamento entre sessão PostgreSQL, função `app_tenant_id()`, políticas RLS, helpers da API e testes de integração.

---

## Respostas diretas (checklist PO)

| Pergunta | Resposta |
|----------|----------|
| Qual *setting* real a aplicação usa? | `app.tenant_id`, definido por transação com `SELECT set_config('app.tenant_id', <uuid>, true)` (ver `apps/api/src/infra/db/pool.ts` — `withTenant`). |
| Qual *setting* as policies usam? | A função SQL `app_tenant_id()` lê `current_setting('app.tenant_id', true)::uuid` (`database/migrations/001_init.sql`). As políticas `tenant_isolation` / `tenant_*` usam `tenant_id = app_tenant_id()` (ou equivalente `USING` / `WITH CHECK`). |
| Existe `app.tenant_id`? | Sim: é o nome do parâmetro GUC definido em runtime (`set_config`). |
| Existe `app.current_tenant_id`? | **Não** no código da API nem nas migrations revistas: não há referência a `app.current_tenant_id` em `apps/api` nem padrão divergente nas políticas pesquisadas (`grep` em `database/migrations`). |
| Existe função `app_tenant_id()`? | Sim, criada em `001_init.sql`: `RETURN NULLIF(current_setting('app.tenant_id', true), '')::uuid`. |
| Os testes usam o mesmo padrão da aplicação? | **Sim** para o harness DEV/QA-04: `withTenant` (pool) e `withAppTenant` (`test-utils/with-app-tenant.ts`) ambos chamam `set_config('app.tenant_id', …, true)`. O ficheiro `tenant-context.integration.test.ts` documenta e valida esse alinhamento. O teste de waitlist define um helper local `withTenantClient` que replica o mesmo `BEGIN` + `set_config` + `COMMIT/ROLLBACK`. |
| Alguma migration usa padrão divergente? | As políticas RLS analisadas referem-se consistentemente a `app_tenant_id()`. Não foi encontrada política baseada só em `current_setting('app.current_tenant_id', …)` ou nome alternativo. |
| Alguma tabela tenant-scoped está sem RLS? | Esta auditoria **não** executou inventário automático de *todas* as tabelas com `tenant_id`; recomenda-se script SQL de inventário em QA futuro. Tabelas criadas nas fases 1–21 seguem o padrão de `ENABLE/FORCE ROW LEVEL SECURITY` + `tenant_isolation` onde aplicável nos ficheiros de migração existentes. |
| Alguma policy está inconsistente? | Não foi identificada inconsistência de *nome* de setting entre `app_tenant_id()` e o que a API define. **Nota:** `apps/api/src/infra/queues/outbox.integration.test.ts` (não incluído no harness DEV/QA-04) usa `SET app.tenant_id = '...'` em alguns cenários — semanticamente equivalente a GUC `app.tenant_id` no PostgreSQL, mas diferente de `set_config`; para homogeneização futura, preferir `set_config` como na aplicação. |

---

## Referências de código

- Definição GUC + função: `database/migrations/001_init.sql` (`app_tenant_id`, políticas iniciais).
- Helper de pool: `apps/api/src/infra/db/pool.ts` — `withTenant`.
- Helper de teste: `apps/api/src/test-utils/with-app-tenant.ts` — `withAppTenant`.
- Testes de consistência: `apps/api/src/infra/db/tenant-context.integration.test.ts`.

---

## Testes automatizados relacionados

- `tenant-context.integration.test.ts`: falha sem RLS configurado corretamente; valida INSERT sem tenant, INSERT com `withAppTenant`, leitura de `current_setting` alinhada a `withTenant`, isolamento cross-tenant.
- Suites de domínio (waitlist, customers, professionals, appointments, etc.) executam sob o mesmo modelo quando usam `withAppTenant` / `withTenant` / helper equivalente.

---

## Conclusão

O padrão único suportado pelo motor e pelas políticas é **`app.tenant_id` → `app_tenant_id()`**. A aplicação e os testes do harness DEV/QA-04 estão alinhados. Divergências menores (ex.: `SET` vs `set_config` em testes fora do harness) são débito de homogeneização, não de semântica de tenant.

**Entrega DEV/QA.** Não representa produção, piloto comercial ou GA.
