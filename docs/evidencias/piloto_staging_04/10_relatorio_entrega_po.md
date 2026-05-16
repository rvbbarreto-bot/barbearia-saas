# Relatório de entrega PO/GP — PILOTO-STAGING-04 (ampliação autorizada)

**Data:** 2026-05-16  
**Branch obrigatória:** `feature/piloto-staging-04-operacao-assistida-suite-produto`  
**Base obrigatória:** `piloto-staging-01`  

---

## 1. Hash inicial e final

| Marco | SHA |
|-------|-----|
| **Inicial** (tip `piloto-staging-01` antes desta fatia código) | `505447a700561ea9e54a90510e16eb7df9d38c69` |
| **Merge-base** `HEAD` × `piloto-staging-01` | `f1955e0dd2d9e03df728970a43a0ce852eb2fafb` |
| **Final** (após commit `feat(ops): operational dashboard manager RBAC`) | `d9df160984673fe8fb2fa8032ed41e941dff21ba` |

---

## 2. Branch e base confirmadas

```text
git branch --show-current
→ feature/piloto-staging-04-operacao-assistida-suite-produto

git merge-base HEAD piloto-staging-01
→ f1955e0dd2d9e03df728970a43a0ce852eb2fafb
```

**Confirmação:** desenvolvimento apenas em cima de `piloto-staging-01` (não em `main`).

---

## 3. Governança PR (pré-requisitos PO)

| Ação | Estado | Responsável |
|------|--------|-------------|
| Fechar PR piloto contra `main` (ex. PR #5) sem merge | **BLOCKED** neste ambiente | Admin GitHub — sem `gh` / `GITHUB_TOKEN` |
| PR válido apenas contra `piloto-staging-01` | **PEND** abertura/atualização após push | GP/DevOps |
| Working tree limpo após commit desta fatia | **OK** após commit | Fábrica |
| Workflow `governance-piloto-no-main.yml` | **OK** (kickoff `a971299`) | CI |

Referência incidente: `docs/evidencias/piloto_staging_03/01_governanca_incidente_pr5_base_main.md`

---

## 4. Arquivos alterados (fatia 1 entregue neste commit)

**API**

- `apps/api/src/modules/operationalStatus/*` (novo módulo)
- `apps/api/src/middlewares/rbac.ts`, `rbac.test.ts`
- `apps/api/src/server.ts`
- `apps/api/src/config/env.ts` (`N8N_WEBHOOK_URL` opcional)

**Web**

- `apps/web/src/features/operacao/*`
- `apps/web/src/config/nav.ts`, `nav.test.ts`
- `apps/web/src/lib/route-access.test.ts`
- `apps/web/src/router/index.tsx`

**Raiz / docs**

- `package.json` (`n8n:validate-workflows`)
- `docs/evidencias/piloto_staging_04/03_matriz_aceite.md`
- `docs/evidencias/piloto_staging_04/04_testes_locais.txt`
- `docs/evidencias/piloto_staging_04/10_relatorio_entrega_po.md`

---

## 5. Features entregues por bloco (escopo PO)

| # | Bloco | Estado nesta entrega | Evidência |
|---|-------|----------------------|-----------|
| **1** | Painel operacional Web + API read-only | **OK (fatia 1)** | Testes listados em `04_testes_locais.txt` |
| 2 | Outbox operacional (listagem/filtros/retry) | **PARCIAL** — já existia na base `piloto-staging-01`; sem alteração neste commit | `outbox.routes.integration.test.ts`, UI `/operacao/mensagens` |
| 3 | Auditoria / correlation | **PARCIAL** — endpoints/UI base existentes | Próximo PR dedicado |
| 4 | Dashboard gerencial | **PARCIAL** — `DashboardPage` KPIs existentes | Próximo PR KPI API dedicada |
| 5 | Histórico cliente | **PEND** | — |
| 6 | Agenda avançada | **PEND** (sem tocar motor validado) | — |
| 7 | n8n QA readiness | **PARCIAL** — JSONs + validador verdes | `npm run n8n:validate-workflows` |
| 8 | Waitlist + flags | **PARCIAL** — módulo + flags na base | `WAITLIST_*_ENABLED` |
| 9 | Financeiro read-only | **PARCIAL** — módulo finance na base | `finance.*.test.ts` |
| 10 | Comissão read-only | **PARCIAL** — módulo commission na base | — |
| 11 | Recall candidatos | **PARCIAL** — `RECALL_ENABLED` + candidates | — |

### Detalhe bloco 1 (entregue)

- `GET /api/v1/operational/status` — health API/DB/Redis, worker outbox (degradado se Redis falhar), probe n8n/Evolution quando env configurada.
- Contadores outbox por status; últimos erros **sanitizados** com classes `auth_401`, `not_found_404`, `timeout`, `fetch_failed`, `duplicate`, `provider_error`.
- Filtros query: `status`, `from`, `to`, `correlation_id` (tenant via JWT).
- RBAC: **manager+** (`operationalDashboard:read`); negativos attendant/viewer testados.
- Cross-tenant: `operational-status.integration.test.ts` (CI Postgres).
- Web `/operacao/status` — filtros UI, nav/RoleGuard manager+.

---

## 6. PEND / BLOCKED e motivos

| Item | Motivo |
|------|--------|
| PR #5 fechar | Sem API GitHub no agent |
| PR piloto-04 + CI verde | Aguarda push + abertura PR |
| Blocos 5–6, expansões 3–4 | Volume épico; entregas incrementais |
| E2E n8n com credencial real | **BLOCKED** — sem credencial real no sandbox; responsável: Piloto/Infra |
| Integração DB local completa | Credenciais Docker ≠ CI `barbearia_saas_test` |

---

## 7. Riscos residuais

- Probe HTTP n8n/Evolution pode marcar `ok` com 401/404 (alcance apenas, não valida credencial).
- Painel operacional não substitui monitoramento APM externo.
- PR contra `main` requer ação humana até fechamento formal.

---

## 8. Migrations

**Nenhuma** migration criada nesta fatia.

---

## 9. Variáveis de ambiente novas / usadas

| Variável | Uso |
|----------|-----|
| `N8N_WEBHOOK_URL` (opcional) | Probe operacional n8n |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` (já existentes) | Probe Evolution |

Documentadas em `.env.example` (n8n já existia; API passa a ler `N8N_WEBHOOK_URL`).

---

## 10. Evidências de testes

Ver **`04_testes_locais.txt`** (atualizar após CI).

Contagem API unit: **167 → 182** (+15) após fatia operacional completa.

---

## 11. Resultado dos comandos (local)

| Comando | Resultado |
|---------|-----------|
| `git status --short --branch` | branch correta; limpo após commit |
| API `npm run typecheck` | PASS |
| API `npm run lint` | PASS (warnings legados) |
| API `npm run test:unit` | PASS 182/182 |
| API `npm run build` | PASS |
| Web typecheck/lint/test/build | PASS |
| `npm audit` raiz | SKIP (sem lockfile) |
| `npm audit` api/web | api: 2 moderate; web: 0 |
| Gitleaks | PASS |
| `npm run n8n:validate-workflows` | PASS |

---

## 12. Link PR e CI

| Item | Valor |
|------|-------|
| PR contra `piloto-staging-01` | _URL após `gh pr create` / push_ |
| CI verde | _URL run Actions após PR_ |

---

## 13. Confirmação merge em main

**Não houve merge em `main`.** Nenhum push forçado/reset destrutivo executado pelo agent.

---

## Critério de aceite PO (esta rodada)

| Critério | Atende? |
|----------|---------|
| Código funcional bloco 1 | Sim |
| Testes verdes API/Web (unit + build) | Sim (local) |
| PR correto | Pendente abertura |
| Evidência objetiva | Sim (`04_*`, `10_*`, matriz B) |
| Épico completo (11 blocos) | **Não** — entrega incremental; matriz reflete PEND |
