# Relatório final — DEV/QA-07.1 (hotfix RBAC, contrato e governança)

**Data:** 2026-05-03

---

## 1. Resumo executivo

O hotfix **DEV/QA-07.1** endereça riscos levantados na entrega DEV/QA-07: restringe a visão de comissão a **manager+** no frontend e na API, documenta o **contrato paginado** de `GET /api/v1/commission/entries`, melhora o script **`audit-tenant-context.ps1`** quando `DATABASE_URL` não está definida e acrescenta testes de rota, menu, integração HTTP e contrato. A entrega continua a ser **apenas DEV/QA**; não constitui aprovação para produção, piloto comercial, GA, workflows 02/03 ativos, PIX real ou recall automático real.

---

## 2. Correções realizadas

| Área | Ação |
|------|------|
| Frontend | `RoleGuard` e `APP_NAV` em **Comissões** com `minRole: manager`; rota `/operacao/comissao` alinhada. |
| API | Política `commissions.readEntries` com papel mínimo **manager** (já em `rbac.ts`). |
| OpenAPI | Descrição de `GET /commission/entries` atualizada para **mín. manager** e resposta `{ data, total, page, limit }`. |
| Testes | Novo teste HTTP de integração para RBAC + forma do corpo; `route-access` e `nav` atualizados. |
| Scripts | `audit-tenant-context.ps1`: mensagem explícita, exit **2** sem `DATABASE_URL` (sem `-StaticOnly`); `-StaticOnly` força auditoria estática. |
| Harness | Artefactos e lista de ficheiros de integração em `scripts/run-api-integration-local.ps1` (pasta `artifacts/devqa-07-1`). |

---

## 3. RBAC Comissão (frontend)

- **Rota:** `apps/web/src/router/index.tsx` — `RoleGuard minRole="manager"` em `/operacao/comissao`.
- **Menu:** `apps/web/src/config/nav.ts` — item **Comissões** com `minRole: 'manager'` (o `Sidebar` filtra com `hasMinRole`).
- **Dashboard:** KPI de comissão pendente só consulta a API quando o utilizador tem **`manager+`** (evita pedidos desnecessários e alinha com a API).
- **Testes:** `route-access.test.ts` (attendant bloqueado; manager, `tenant_admin`, `tenant_owner` permitidos) e `nav.test.ts` (atendente não vê “Comissões” após o mesmo filtro do menu).

---

## 4. RBAC Comissão (backend)

- **Política:** `apps/api/src/middlewares/rbac.ts` — `readEntries: 'manager'`.
- **Rota:** `GET /api/v1/commission/entries` usa `requirePermission('commissions', 'readEntries')`.
- **Testes unitários:** `apps/api/src/modules/commission/commission.rbac.test.ts` — attendant **não** tem `readEntries`; manager sim.
- **Testes de integração HTTP:** `apps/api/src/modules/commission/commission.entries.http.integration.test.ts` — attendant e professional **403**; manager, `tenant_admin` e `tenant_owner` **200** com corpo paginado.
- **Isolamento multi-tenant:** coberto em **`commission.service.integration.test.ts`** (“listCommissionEntries outro tenant não vê linhas”); o fluxo HTTP usa o mesmo `tenantId` do JWT + `withTenant` na camada de serviço.

---

## 5. Tratamento do breaking change `GET /commission/entries`

Na **DEV/QA-07**, a resposta deixou de ser um array JSON cru e passou a:

```json
{ "data": [], "total": 0, "page": 1, "limit": 20 }
```

Isto é um **breaking change** para clientes que esperavam um array na raiz. **Consumidores internos revistos:**

| Consumidor | Estado |
|------------|--------|
| **apps/web** | `PaginatedResponse` em `comissaoService.ts`, `DashboardPage.tsx` — já alinhados. |
| **OpenAPI** (`apps/api/src/openapi/spec.ts`) | Documenta objeto paginado e RBAC manager+. |
| **n8n/workflows** | Sem referências a `commission/entries` nos JSON exportados. |
| **Testes** | Novo teste HTTP valida `data`, `total`, `page`, `limit`. |

Decisão PO/registro: **alteração aceite apenas no âmbito DEV/QA**; equipas externas devem migrar para o contrato paginado antes de qualquer uso fora do harness.

---

## 6. Consumidores atualizados

- OpenAPI (descrição RBAC + formato).
- Web (já em paginação; reforço de testes de rota e menu).
- Nenhum workflow n8n no repositório consome este endpoint.
- Documentação: este relatório e comentários nos scripts de harness/auditoria.

---

## 7. Testes criados ou alterados

| Ficheiro | Alteração |
|----------|-----------|
| `apps/api/src/modules/commission/commission.entries.http.integration.test.ts` | **Novo** — RBAC + contrato paginado. |
| `apps/web/src/lib/route-access.test.ts` | Comissão **manager+**. |
| `apps/web/src/config/nav.test.ts` | **Novo** — menu Comissões só para manager+. |
| `apps/api/src/openapi/spec.ts` | Texto RBAC `GET /commission/entries`. |
| `scripts/run-api-integration-local.ps1` | Inclui o novo ficheiro de integração; artefactos `devqa-07-1`. |

---

## 8. Resultado harness

- Comando: `powershell -File scripts/run-api-integration-local.ps1`
- **Sucesso:** typecheck, lint, `test:unit`, pacote de integração (incl. `commission.entries.http.integration.test.ts`), `audit-tenant-context.mjs` com `DATABASE_URL` do harness.
- **Log de exemplo:** `artifacts/devqa-07-1/integration-*.log` (nome varia por execução).

---

## 9. Resultado web

- Comandos: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` em `apps/web`.
- **Sucesso:** build de produção concluído; testes Vitest passaram (incluindo `route-access` e `nav`).

---

## 10. Resultado Gitleaks

- Comando: `docker run --rm -v ${PWD}:/repo ghcr.io/gitleaks/gitleaks:v8.24.3 detect --source=/repo --verbose --redact`
- **Resultado:** `no leaks found` (execução local 2026-05-03).

---

## 11. Resultado n8n audit

- `powershell -File scripts/audit-n8n-workflows.ps1` — workflows 01/02/03 verificados (export `active=false`; regras estáticas OK).
- `powershell -File scripts/validate-n8n-runtime-import.ps1 -TryDockerImport` — importação Docker OK para os três JSON.

---

## 12. Script `audit-tenant-context.ps1`

- Sem `DATABASE_URL` e **sem** `-StaticOnly`: mensagem  
  **«DATABASE_URL ausente. Execute via scripts/run-api-integration-local.ps1 ou use -StaticOnly.»** — **exit code 2**.
- Com **`-StaticOnly`**: remove `DATABASE_URL` temporariamente, corre apenas varredura estática — **exit 0** se OK.
- Logs em `artifacts/devqa-07-1/tenant-context-audit-*.log`.

---

## 13. Riscos remanescentes

- Entrega **não** validada para produção ou piloto comercial; workflows **02/03** e integrações sensíveis continuam desativadas por política de produto.
- Clientes **externos** à repo que ainda esperem array em `GET /commission/entries` precisam de migração explícita (breaking documentado).
- Relatórios e automações fora do repositório não foram auditados automaticamente.

---

## 14. Declaração obrigatória

**Esta entrega é DEV/QA. Não representa produção, piloto comercial ou GA.**
