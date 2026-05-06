# Relatório final — DEV/QA-05

**Data de referência:** 2026-05-03  
**Ambiente:** desenvolvimento local Windows; validações Docker conforme máquina do operador.

---

## 1. Resumo executivo

O pacote DEV/QA-05 fecha ressalvas do DEV/QA-04 em torno do **import CLI n8n em Docker** (comando correto `import:workflow`, imagem alinhada ao **staging `1.91.3`**), introduz **auditoria automatizada de tenant context** (grep + inventário RLS opcional com `DATABASE_URL`), integra **finance** e **commission** no harness de integração, documenta **plan_limits** via ADR (sem enforcement 402 ainda), **expande OpenAPI** (finance, commission, filtros de audit), entrega **frontend de baixo risco** (Auditoria read-only, Lista de espera com criar/cancelar, shell Financeiro/Comissão com feature flag), e consolida artefactos em **`artifacts/devqa-05`**.

---

## 2. Escopo entregue

| Área | Entrega |
|------|---------|
| n8n | `n8n/.docker-image-tag` (= staging), `scripts/validate-n8n-runtime-import.ps1` import 01/02/03 com `-TryDockerImport`, logs em `artifacts/devqa-05` |
| Tenant | `scripts/audit-tenant-context.mjs` (`pg` via `createRequire` em `apps/api`) + `audit-tenant-context.ps1` (`-StaticOnly` opcional) + allowlist; `docs/AUDIT_TENANT_CONTEXT_EXCEPTIONS.md`; migration `022_webhook_events_enable_rls.sql`; execução no harness após Vitest |
| Integração | Harness inclui `finance.service.integration.test.ts` e `commission.service.integration.test.ts` |
| plan_limits | `docs/ADR_PLAN_LIMITS_ENFORCEMENT.md` |
| OpenAPI | Rotas finance, commission, audit com mais parâmetros |
| Frontend | `AuditLogsPage`, `WaitlistPage`, `FinanceCommissionShellPage` + rotas/nav |
| Docs | `docs/N8N_VERSION_PIN.md`, este relatório |

---

## 3. Ressalvas DEV/QA-04 fechadas

| Ressalva | Tratamento |
|---------|------------|
| Docker “Command n8n not found” | Uso de `import:workflow` após o nome da imagem (sem prefixo `n8n` duplicado); revalidado no script |
| Versão n8n confusa | Pin único `1.91.3` (= `docker-compose.staging.yml`) + `docs/N8N_VERSION_PIN.md` |
| Evidência pós-correção Docker | `validate-n8n-runtime-import.ps1 -TryDockerImport` com exit 0 em 2026-05-03; log `artifacts/devqa-05/n8n-runtime-validation-20260503-215223.log` |
| Tenant context só documentado | Script automático + passo no harness |

---

## 4. Ressalvas ainda abertas

- Importação **UI** n8n com prints (checklist DEV/QA-04); validação CLI Docker reduz risco técnico mas não substitui evidência UI.
- **CI remoto** formal com a mesma matriz.
- **Conversão waitlist → agendamento** na UI (deixada para pacote seguinte; API já coberta por integração).
- Enforcement **402 PLAN_LIMIT_EXCEEDED** (ADR apenas).
- Tabelas **`users`** e **`audit_logs`** permanecem sem RLS na base; documentadas em `docs/AUDIT_TENANT_CONTEXT_EXCEPTIONS.md` e allowlist até decisão de modelo de policies + fluxo de login.

---

## 5. Versão n8n validada

- **`n8nio/n8n:1.91.3`** — origem: `docker-compose.staging.yml` serviço `n8n`; espelhado em `n8n/.docker-image-tag`.

---

## 6. Resultado Docker import n8n

**Comando:** `powershell -File scripts/validate-n8n-runtime-import.ps1 -TryDockerImport`

**Resultado (2026-05-03):** exit **0**. Imagem **`n8nio/n8n:1.91.3`**. Três `docker run` com argumento **`import:workflow`** (sem prefixo `n8n` duplicado). Cada workflow: mensagem CLI `Successfully imported 1 workflow.` Sem **`Command n8n not found`**.

**Log:** `artifacts/devqa-05/n8n-runtime-validation-20260503-215223.log` (avisos n8n: permissões de config, release >6 semanas, migrações internas SQLite efémeras — esperado em contentor descartável).

**Estático pré-Docker:** `n8n-validate-workflow-import.mjs` — 01/02/03 com `active=false`.

---

## 7. Resultado tenant context audit

**Harness (com `DATABASE_URL` efémero):** após os 53 testes de integração, `audit-tenant-context.mjs` — **`[OK] DB RLS inventory`** (log `artifacts/devqa-05/integration-169074456b.log`).

**Standalone sem base:** `powershell -File scripts/audit-tenant-context.ps1 -StaticOnly` — **`[OK] Static tenant-context scan passed`**; log `artifacts/devqa-05/tenant-context-audit-20260503-215249.log`.

- Falha se aparecer `app.current_tenant_id` em `database/migrations` ou `apps/api/src`.
- Com `DATABASE_URL`: inventário de tabelas `public` com coluna `tenant_id` e `relrowsecurity = false`; exceções em `scripts/audit-tenant-context-allowlist.json` + `docs/AUDIT_TENANT_CONTEXT_EXCEPTIONS.md`.
- **`webhook_events`:** corrigida com `database/migrations/022_webhook_events_enable_rls.sql` (ENABLE RLS + policy `tenant_isolation`).

---

## 8–9. Testes e contagem (integração)

**Comando:** `powershell -File scripts/run-api-integration-local.ps1`

| Métrica | Valor (última execução bem-sucedida, 2026-05-03) |
|---------|--------------------------------------------------|
| Ficheiros Vitest (integração) | **11** |
| Testes (`Tests`) | **53 passed**, **0 skipped**, **0 failed** |
| Unidades (`test:unit`) | **109 passed** (26 ficheiros) |

**Log:** `artifacts/devqa-05/integration-169074456b.log`

**Web (`apps/web`, 2026-05-03):** `npm run lint` — 0 erros (avisos pré-existentes noutros módulos); `npm run typecheck` OK; `npm test` — **22** testes passed; `npm run build` OK.

---

## 10. Finance tests

- Ficheiro: `apps/api/src/modules/finance/finance.service.integration.test.ts` — liquidação, desconto, relatório diário, isolamento tenant, `ensureFinancialOnServiceCompleted`, RBAC camada serviço (manager vs professional).

---

## 11. Commission tests

- Ficheiro: `apps/api/src/modules/commission/commission.service.integration.test.ts` — flag `commission_enabled`, percentual, branch cross-tenant rejeitado, fecho diário idempotente.

---

## 12. Plan_limits status

- Coluna `tenants.plan_limits` persistida; **sem** middleware de enforcement nem 402.
- Ver **`docs/ADR_PLAN_LIMITS_ENFORCEMENT.md`**.

---

## 13. OpenAPI status

- **`GET /docs`** inalterado (`register-openapi.ts`).
- Novas entradas em `apps/api/src/openapi/spec.ts`: finance (4 rotas), commission (7 rotas), audit com filtros adicionais; descrição com referência ao ADR de plan_limits.

---

## 14. Frontend entregue

| Rota | Conteúdo |
|------|------------|
| `/auditoria` | Tabela audit logs, filtros, `RoleGuard` tenant_admin |
| `/lista-espera` | Lista, filtro estado, criar, cancelar, `RoleGuard` attendant |
| `/operacao/financeiro` | Shell read-only; expansão com `VITE_FEATURE_FINANCE_COMMISSION_UI=true` |

---

## 15. Feature flags

- API: `RECALL_ENABLED`, `PIX_REAL_PROVIDER_ENABLED`, `WAITLIST_*` (harness inalterado).
- Web: **`VITE_FEATURE_FINANCE_COMMISSION_UI`** (defeito `false` em `.env.example`).

---

## 16. Gitleaks

**Comando:** `docker run --rm -v "${PWD}:/repo" ghcr.io/gitleaks/gitleaks:v8.24.3 detect --source=/repo --verbose --redact`

**Resultado (2026-05-03):** `no leaks found`; exit **0**; `1 commits scanned` (clone local / histórico shallow conforme ambiente).

---

## 17. n8n audit

**Comando:** `powershell -File scripts/audit-n8n-workflows.ps1`  

**Resultado (2026-05-03):** exit **0**. Workflows 01, 02, 03 com **`active (export default): False`**. Mensagem de nota sobre 02/03 (sem `[MATCH]` bloqueador no output do script).

---

## 18. Riscos remanescentes

- CI remoto; evidência UI n8n; Gitleaks em clone com histórico completo no remoto.

---

## 19. Próximo pacote recomendado

- QA formal / E2E; import UI n8n; conversão waitlist na UI com flag; implementação `PLAN_LIMIT_EXCEEDED` + testes 402; CI.

---

## 20. Declaração obrigatória

**Entrega DEV/QA. Não representa produção, piloto comercial ou GA.**
