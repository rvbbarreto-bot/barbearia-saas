# RLS / Auth / Audit — desenho técnico (DEV/QA-07)

**Estado:** desenho recomendado para evolução pós-DEV/QA-06. **Não** ativa produção nem altera homologação.  
**Allowlist atual (DEV/QA-06):** `users` e `audit_logs` permanecem com políticas excepcionais documentadas; **sem** RLS “duro” equivalente ao resto do núcleo neste pacote.

---

## 1. Como proteger `users` sem quebrar login?

**Problema:** `users` participa no fluxo de autenticação antes de `app.tenant_id` estar disponível em todas as consultas; RLS estrito por tenant na leitura de credenciais pode bloquear bootstrap.

**Recomendação (faseada):**

1. **Curto prazo (atual):** manter `users` na allowlist com **acesso apenas via serviços** que fixam `tenant_id` no JWT e validam `x-tenant-id`; testes `users.isolation.integration.test.ts` cobrem regressões óbvias.
2. **Médio prazo:** introduzir colunas mínimas em tabela técnica `auth_credentials` (ou view materializada) **só** com campos necessários ao login (`email`, `password_hash`, `tenant_id`, `id`), com RLS por `tenant_id` + política `SECURITY DEFINER` limitada para lookup por email **sem** expor perfil completo.
3. **Longo prazo:** separar “identidade global” (opcional) de “membership tenant” (`tenant_users`) com RLS em `tenant_users`; login resolve memberships e emite JWT com `tenant_id` escolhido.

**Risco:** atrasar (2) mantém superfície maior em `users` se alguma rota SQL ad-hoc escapar ao `withTenant`.

---

## 2. Login antes ou depois do tenant context?

**Recomendação:** **híbrido**.

- **Antes (transporte):** o cliente envia `tenant_id` no login (como hoje) para desambiguar email repetido entre tenants.
- **Depois (sessão):** após JWT válido, **todo** acesso a dados de negócio passa por middleware que define `request.tenantId` e executa queries com `withTenant` / `SET LOCAL app.tenant_id`.

Login **não** deve carregar dados de negócio além do estritamente necessário (user + role + tenant).

---

## 3. Como identificar tenant no login?

- Corpo ou cabeçalho explícito `tenant_id` (UUID) alinhado ao registo em `users.tenant_id`.
- Validação: utilizador existe **e** `users.tenant_id` = `tenant_id` pedido.

---

## 4. `platform_admin` acessa globalmente?

**Recomendação:** rotas dedicadas `/platform/...` (prefixo separado) com:

- JWT com `role = platform_admin`,
- **sem** `x-tenant-id` obrigatório, ou
- `x-tenant-id` opcional apenas quando a ação é “agir em nome de tenant”.

Nunca misturar política `platform_admin` com handlers multi-tenant genéricos sem guard explícito.

---

## 5. `tenant_admin` acede apenas ao seu tenant?

Sim: JWT contém `tenant_id`; middleware rejeita mismatch com `x-tenant-id`; RLS em tabelas de negócio garante isolamento mesmo com bug parcial na cláusula SQL.

---

## 6. Isolamento de `audit_logs`

**Alvo:** política RLS `tenant_id = app_tenant_id()` + `FORCE ROW LEVEL SECURITY`, alinhada a `commission_*`, `appointment_financials`, etc.

**Bloqueio atual:** volume de leituras/escritas em auth e necessidade de `JOIN` com `users` para enrich — já mitigado em serviço com `JOIN` qualificado por tenant (DEV/QA-06).

**Plano:** migrar quando:

- todas as escritas passarem por `writeAuditLog` com `tenant_id` não nulo **ou** política explícita para linhas `tenant_id IS NULL` (sistema),
- relatórios admin usarem rotas `platform_admin` com bypass controlado.

---

## 7. `writeAuthAudit` antes do utilizador autenticado?

Sim para eventos de **pré-auth** (tentativa de login, lockout). Deve usar:

- `actor_user_id = NULL`,
- `tenant_id` resolvido pelo **pedido de login** (corpo), não pelo JWT,
- ou tabela técnica separada `auth_events` se quisermos não poluir `audit_logs` de negócio.

---

## 8. Audit de falha de login tem `tenant_id`?

**Recomendação:** sim, quando o cliente enviou `tenant_id` válido (UUID parseável). Se o cliente não enviou tenant, registar `tenant_id NULL` + `action` específico `LOGIN_FAILED_NO_TENANT` para telemetria.

---

## 9. Tenant ainda não resolvido?

- **Pré-auth:** não usar `withTenant` de dados de negócio; só tabelas técnicas ou `auth_events`.
- **Pós-auth sem tenant (bug):** falhar fechado (`403` / `401`) — nunca “default tenant”.

---

## 10. Tabelas que precisam RLS (núcleo operacional)

Todas as tabelas com `tenant_id` **exceto** exceções temporárias documentadas. Lista viva: inventário em `scripts/audit-tenant-context.mjs` (executado no harness DEV/QA-07).

---

## 11. Exceções temporárias

| Tabela       | Motivo                                      | Prazo alvo   |
|-------------|---------------------------------------------|--------------|
| `users`     | Login + FKs + migração de modelo           | Ver §1       |
| `audit_logs`| Volume JOIN + eventos pré-auth             | Ver §6       |

**Não** usar allowlist para esconder falta de validação na camada de aplicação — allowlist é **última** defesa, não substituto de `withTenant` + testes.

---

## 12. Plano de migração (alto nível)

1. Congelar novas queries raw em `users` / `audit_logs`.
2. Introduzir `auth_events` (opcional) ou estreitar colunas expostas no login.
3. `ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY` + políticas + backfill `tenant_id` onde NULL legível.
4. `users`: modelo `tenant_users` ou view de credenciais.
5. Remover allowlist no script de auditoria quando inventário estiver verde.

---

## 13. Testes que provam a solução

- Integração: `users.isolation.integration.test.ts`, `audit_logs.isolation.integration.test.ts` (existentes).
- Novos (futuro): “login RLS” com role `barbearia_app` + tentativa de leitura cross-tenant em view de credenciais.
- Harness: `scripts/run-api-integration-local.ps1` (artefactos `artifacts/devqa-07/`).

---

## 14. Decisão deste pacote (DEV/QA-07)

- **Não** aplicar nova migração RLS em `users` / `audit_logs` neste incremento (risco de regressão de login).
- Manter desenho acima como **linha de implementação**; allowlist atualizada como **dívida técnica explícita** com dono de produto.

---

## 15. Estimativa de esforço (ordem de grandeza)

| Fase                          | Esforço   | Risco   |
|------------------------------|-----------|---------|
| `audit_logs` RLS + backfill  | 3–5 d     | Médio   |
| `auth_events` + login estreito | 5–8 d | Médio-alto |
| `tenant_users` modelo novo   | 10–15 d | Alto     |

---

**Entrega DEV/QA.** Não representa produção, piloto comercial ou GA.
