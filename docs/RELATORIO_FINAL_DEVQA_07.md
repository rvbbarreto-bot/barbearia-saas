# Relatório final — DEV/QA-07

**Data:** 2026-05-03  
**Pacote:** maturidade RLS/auth/audit (desenho), OpenAPI, financeiro/comissão (API+testes+UI read-only), dashboard, waitlist conversão controlada, plan_limits (ADR), harness `artifacts/devqa-07/`.

---

## 1. Resumo executivo

Foi entregue incremento **DEV/QA** focado em desenho de RLS/auth/audit, listagem financeira na API, resumo read-only da outbox, paginação e filtros de comissão na API, telas web read-only (Financeiro, Comissões), dashboard com KPIs adicionais condicionados por papel, conversão de waitlist na UI protegida por flag, expansão de OpenAPI e testes de integração ampliados. Harness Docker + Vitest **passou** (70 testes de integração, 0 skipped por env). Gitleaks **sem leaks**. Auditoria estática n8n **OK**; import Docker n8n **OK**. O script `audit-tenant-context.ps1` executado **isoladamente** falhou por ausência de `DATABASE_URL` na sessão; o mesmo audit corre **dentro** do harness com env definido.

---

## 2. Escopo entregue

- Documento `docs/RLS_AUTH_AUDIT_DESIGN_DEVQA_07.md`.
- `GET /api/v1/finance/appointments` (lista paginada + filtros).
- `GET /api/v1/integrations/outbound/outbox-summary` (manager+).
- `GET /api/v1/commission/entries` passa a responder `{ data, total, page, limit }` com filtros `from`/`to`/`branch_id` (janela sobre `appointments.completed_at`).
- OpenAPI: novos paths (finance list, outbox summary, waitlist convert, recall cancel) + enriquecimento de commission entries.
- UI: `FinanceiroPage`, `ComissaoPage`, rotas `/operacao/financeiro` e `/operacao/comissao`, navegação.
- Dashboard: no-show, recall, outbox, receita do dia (tenant_admin+), comissão pendente (attendant+), com `enabled` por papel para evitar 403 em cascata.
- Waitlist: conversão com `VITE_FEATURE_WAITLIST_CONVERT_UI`, modal, validação de cliente via `GET /appointments/:id`.
- ADR `docs/ADR_PLAN_LIMITS_DEVQA_07.md` (não implementar 402 neste pacote).
- Harness e scripts de artefactos atualizados para `devqa-07`.

---

## 3. Decisão RLS / Auth / Audit

Ver `docs/RLS_AUTH_AUDIT_DESIGN_DEVQA_07.md`. **Decisão:** não aplicar nova migração RLS em `users`/`audit_logs` neste incremento; manter allowlist com plano de migração faseado e testes de isolamento existentes.

---

## 4. Status allowlist `users` / `audit_logs`

Permanecem na allowlist do inventário RLS (`[OK] DB RLS inventory...` no harness). Decisão atualizada: **dívida explícita** até fases §12–13 do desenho.

---

## 5. OpenAPI status

Expandida para incluir:

- `GET /api/v1/finance/appointments` (filtros, RBAC, tenant).
- `GET /api/v1/integrations/outbound/outbox-summary`.
- `POST /api/v1/waitlist/{entryId}/convert`.
- `POST /api/v1/recall/cancel`.
- `GET /api/v1/commission/entries` (query + resposta paginada).

Demais domínios críticos já parcialmente documentados em `apps/api/src/openapi/spec.ts` (iteração DEV/QA-06 + este incremento). **GET /docs** (ou stack equivalente que sirva `openApiDocument`) permanece dependente da configuração do servidor Fastify existente.

---

## 6. Testes finance

Ficheiro `apps/api/src/modules/finance/finance.service.integration.test.ts`:

- Novo: listagem com `financial_status` open/settled, período, isolamento por tenant, filtro por profissional.
- Novo: Zod rejeita desconto com motivo curto quando `discount_cents > 0`.
- Cobertura existente mantida: liquidação, desconto manager, RBAC professional bloqueado, relatório diário, isolamento de relatório.

---

## 7. Testes commission

Ficheiro `apps/api/src/modules/commission/commission.service.integration.test.ts`:

- `listCommissionEntries` com `branch_id`.
- `patchCommissionEntryStatus` pending → approved (actor `undefined` para FK audit).
- Isolamento: outro tenant não vê linhas.

---

## 8. Financeiro UI

- Rota `/operacao/financeiro`, `RoleGuard` manager+.
- Tabela com `appointment_financials` via API lista; filtros data, estado liquidação, profissional; botões “Liquidar”/“Desconto” desativados com tooltip QA.

---

## 9. Comissão UI

- Rota `/operacao/comissao`, `RoleGuard` attendant+.
- Lista `commission_entries` com filtros de período, estado, profissional; botão “Aprovar” desativado (tooltip QA).

---

## 10. Dashboard KPIs

Cartões adicionais: no-show hoje, recall (total candidatos), outbox pending/dead (manager+), receita do dia via relatório (tenant_admin+), comissão pendente (attendant+). Queries desativadas por papel quando não aplicável.

---

## 11. Waitlist UI

- Botão “Converter” com flag `VITE_FEATURE_WAITLIST_CONVERT_UI` (defeito `false` em `.env.example`).
- Modal, confirmação, validação de `customer_id` contra agendamento, toast, erros claros; sem WhatsApp direto.

---

## 12. Plan_limits status

ADR final: `docs/ADR_PLAN_LIMITS_DEVQA_07.md` + referência a `docs/ADR_PLAN_LIMITS_ENFORCEMENT.md`. **Sem** middleware 402 neste pacote.

---

## 13. Integração (harness)

| Métrica   | Valor |
|----------|-------|
| Passed   | **70** |
| Skipped  | **0** |
| Failed   | **0** |

**Log:** `artifacts/devqa-07/integration-5c748e6db5.log`

---

## 14. Testes web

Vitest (apps/web): **26** testes em **5** ficheiros — OK.

---

## 15. Gitleaks

`docker run ... gitleaks:v8.24.3 detect` — **no leaks found** (exit 0).

---

## 16. n8n audit

`powershell -File scripts/audit-n8n-workflows.ps1` — workflows 01/02/03 com **`active: false`** no JSON exportado; regras estáticas OK.

---

## 17. n8n Docker import

`powershell -File scripts/validate-n8n-runtime-import.ps1 -TryDockerImport` — import CLI OK para 01/02/03.

**Log:** `artifacts/devqa-07/n8n-runtime-validation-20260503-224625.log`

---

## 18. Tenant audit

- **Dentro do harness:** `node scripts/audit-tenant-context.mjs` — **OK** (`[OK] DB RLS inventory...`).
- **Script isolado:** `audit-tenant-context.ps1` falhou na mesma sessão por **autenticação Postgres** — `DATABASE_URL` não estava definido no ambiente ao correr fora do harness. Recomendação: correr após `run-api-integration-local.ps1` ou exportar `DATABASE_URL` válido.

---

## 19. Riscos remanescentes

- RLS completo em `users`/`audit_logs` ainda pendente (ver desenho).
- `GET /finance/appointments` usa janela temporal em `appointments.starts_at` — alinhar com PO se o relatório operacional preferir `completed_at` ou timezone de unidade.
- Resposta paginada de `commission/entries` é **breaking** para clientes que esperavam array puro (não identificados no repo além de OpenAPI).

---

## 20. Itens pendentes para QA futuro

- Testes E2E browser para Financeiro/Comissão/Dashboard.
- Ativar `VITE_FEATURE_WAITLIST_CONVERT_UI` apenas em ambiente controlado e exercitar fluxo com dados seed.
- Implementar `plan_limits` + 402 conforme ADRs.
- Evoluir OpenAPI com schemas JSON Schema completos (hoje ainda há `additionalProperties: true` em vários corpos).

---

## Declaração obrigatória

**Entrega DEV/QA. Não representa produção, piloto comercial ou GA.**
