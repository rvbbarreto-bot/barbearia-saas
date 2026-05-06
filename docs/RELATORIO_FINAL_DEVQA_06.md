# Relatório final — DEV/QA-06

**Data de referência:** 2026-05-03  
**Ambiente:** desenvolvimento local; matriz de validação alinhada ao harness `scripts/run-api-integration-local.ps1`.

---

## 1. Resumo executivo

O pacote **DEV/QA-06** documenta e testa a **allowlist** de `users` e `audit_logs`, reforça **isolamento multi-tenant** na camada de serviço (com testes de integração), endurece **`GET /api/v1/me`** com `tenant_id`, extrai **`listAuditLogs`** para serviço reutilizável com `JOIN users` seguro (`u.tenant_id = a.tenant_id`), expande **waitlist** (filtros API + UI, VIP, toasts), **OpenAPI** (auth, me, users, services, waitlist), **dashboard KPI** read-only para fila (só papel ≥ attendant), e consolida artefactos em **`artifacts/devqa-06`**.

---

## 2. Escopo entregue

| Área | Entrega |
|------|---------|
| Allowlist | `audit-tenant-context-allowlist.json` com `entryMetadata`; `docs/AUDIT_TENANT_CONTEXT_EXCEPTIONS.md`; `docs/TECH_DEBT_CARDS_DEVQA06.md` |
| Testes | `users.isolation.integration.test.ts`, `audit_logs.isolation.integration.test.ts`, waitlist `professional_id` filter |
| API | `modules/audit/service.ts`, `me` com `WHERE tenant_id`, waitlist `listWaitlistEntries` filtros |
| Web | Audit log colunas (resumo, entity id), waitlist filtros + VIP + sonner, dashboard KPI fila |
| OpenAPI | `/auth/login`, `/auth/refresh`, `/api/v1/me`, `/api/v1/users`, `/api/v1/services`, waitlist GET parâmetros |
| Harness / artefactos | Pasta `artifacts/devqa-06`; título harness DEV/QA-06 |

---

## 3. Decisão sobre allowlist `users` / `audit_logs`

| Tabela | Classificação | RLS hoje | Isolamento hoje | Decisão |
|--------|---------------|----------|-----------------|---------|
| `users` | **Temporária** | Não | SQL explícito + JWT + testes | Manter allowlist até migration RLS + bootstrap auth (ver cartão técnico) |
| `audit_logs` | **Temporária** | Não | `listAuditLogs` força `tenant_id`; JOIN actor tenant-safe | Manter allowlist até políticas RLS + tratamento `tenant_id` NULL |

Respostas objetivas: ver tabela em `docs/AUDIT_TENANT_CONTEXT_EXCEPTIONS.md`.

---

## 4. Testes `users` / `audit_logs`

- `apps/api/src/modules/users/users.isolation.integration.test.ts` — lista, get, update, create, deactivate cross-tenant.
- `apps/api/src/modules/audit/audit_logs.isolation.integration.test.ts` — escrita por tenant + listagem sem vazamento.

---

## 5. RLS corrigido?

**Não neste pacote** (escopo: justificativa + testes + endurecimento de rotas). Cartões em `docs/TECH_DEBT_CARDS_DEVQA06.md`.

---

## 6. Audit Log UI

Read-only: filtros, colunas data/ator/entidade/id/ação/resumo, estados loading/erro/vazio, `RoleGuard` tenant_admin. Teste unitário: `auditLogSummary.test.ts`.

---

## 7. Waitlist UI

Lista, estado, filtros serviço/profissional (API), VIP, período, criar/cancelar, toasts, `RoleGuard` attendant. Conversão para agendamento: apenas API (comentário UI mantido).

---

## 8. OpenAPI status

Rotas adicionadas/esticadas conforme secção 2. `GET /docs` inalterado (`register-openapi.ts`).

---

## 9. Finance / commission / plan_limits

Sem alteração funcional neste pacote; **plan_limits** continua conforme `docs/ADR_PLAN_LIMITS_ENFORCEMENT.md`.

---

## 10–11. Testes e contagens

Executar harness e preencher:

| Métrica | Valor |
|---------|--------|
| Ficheiros integração (Vitest) | **13** |
| Integração | **63 passed**, **0 skipped**, **0 failed** |
| Unit API | **109 passed** |

**Log harness:** `artifacts/devqa-06/integration-7ab28c34a3.log`

---

## 12. Web

Última execução local (2026-05-03): `npm run lint` (0 erros, avisos pré-existentes noutros ficheiros), `npm run typecheck` OK, `npm test` **24** passed, `npm run build` OK.

---

## 13. Gitleaks

`docker run ... gitleaks:v8.24.3 ...` — esperado sem leaks.

---

## 14. n8n audit

`scripts/audit-n8n-workflows.ps1` — workflows 01–03 `active=false`.

---

## 15. n8n Docker import

`scripts/validate-n8n-runtime-import.ps1 -TryDockerImport` — imagem pinada `1.91.3`.

---

## 16. Riscos remanescentes

- Sem RLS em `users`/`audit_logs`: defesa depende da qualidade das queries; LGPD residual.
- CI remoto ainda não é gate.
- Prints UI n8n runtime pendentes.

---

## 17. Itens pendentes QA futuro

- E2E browser; evidência UI n8n; RLS conforme cartões.

---

## 18. Próximo pacote recomendado

- Migrations RLS + funções bootstrap; CI remoto; conversão waitlist na UI com flag.

---

## 19. Declaração obrigatória

**Entrega DEV/QA. Não representa produção, piloto comercial ou GA.**
