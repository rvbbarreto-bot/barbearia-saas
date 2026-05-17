# Relatório final — PILOTO-STAGING-01 (diagnóstico D+0)

**Data:** 2026-05-15  
**Fábrica:** Barbearia SaaS V2  
**HEAD:** `a379e11d7c964522698cff5d5c0f33897f2d24b5`  
**Branch:** `feature/p2-2-web-outbox-whatsapp-operational`

---

## 1. Resumo executivo

O gate de **CI/segurança** foi **aprovado pelo PO** (runs #8 e #9 verdes). A fábrica iniciou **PILOTO-STAGING-01** com diagnóstico em 24h: governança Git, segurança do repositório, plano de staging, Evolution e pacote de evidências estruturado. **Homologação operacional real** (staging cloud + WhatsApp) permanece em execução (3–5 d.u.).

---

## 2. Repositório e Git

| Item | Valor |
|------|--------|
| Repositório | https://github.com/rvbbarreto-bot/barbearia-saas |
| Branch | `feature/p2-2-web-outbox-whatsapp-operational` |
| HEAD | `a379e11` |
| Remote | `origin` → https://github.com/rvbbarreto-bot/barbearia-saas.git |
| Working tree | Limpa |
| Commits vs `main` | 45 |

**Últimos commits:**
```
a379e11 docs(mvp): CI verde run #8 e relatório de fechamento atualizado
7f154cf fix(whatsapp): RLS-safe inbound webhook tenant resolution
2222a46 fix(ci): green integration tests and outbox worker RLS
4e7f938 fix(test): mock withTenant in outbox worker unit tests
1cf9671 fix(ci): RLS-safe outbox worker and integration test DB context
```

---

## 3. Pull Request

| Item | Status |
|------|--------|
| PR aberto | **Pendente** — requer login proprietário |
| Compare URL | https://github.com/rvbbarreto-bot/barbearia-saas/compare/main...feature/p2-2-web-outbox-whatsapp-operational?expand=1 |
| Merge automático | **Não** |
| Históricos | `main` (initial only) vs feature (histórico completo) — GitHub alerta *unrelated histories* |

Corpo PR: `docs/PR_PILOTO_STAGING_01_BODY.md`

---

## 4. CI e Gitleaks (HEAD)

| Run | Commit | Status |
|-----|--------|--------|
| [#9](https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25929603100) | `a379e11` | **Success** |
| [#8](https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25929492356) | `7f154cf` | **Success** |

Gitleaks: OK (CI + scan local). Evidências: `02_ci_head_verde.txt`, `03_gitleaks_head_limpo.txt`.

---

## 5. Repositório Public/Private

| Verificação | Resultado |
|-------------|-----------|
| Visibilidade GitHub API | **Public** (`private: false`) |
| Recomendação PO | **Private** |
| Waiver se Public | `docs/WAIVER_REPO_PUBLICO.md` — **não assinado** |
| Segredos no git | Gitleaks limpo; `.env` ignorado; examples com placeholders |

---

## 6. Ambiente staging

| Componente | Status D+0 |
|------------|------------|
| Staging cloud (URL pública) | **Não provisionado** |
| `docker-compose.staging.yml` | Existe no repo |
| `.env.staging.example` | Existe |
| Local Docker (dev/QA) | 5/5 healthy — API :3000, Web :3001 |
| `/health` | OK — ver `06_staging_api_health_ok.json` |
| `/database/health` | OK — ver `07_staging_database_health_ok.json` |
| Deploy / rollback doc | `docs/PILOTO_STAGING_01_DEPLOY_ROLLBACK.md` |

---

## 7. Evolution / WhatsApp

| Item | Status |
|------|--------|
| `EVOLUTION_API_URL` / `EVOLUTION_INSTANCE` / `EVOLUTION_API_KEY` | Documentados em `.env.example`; override local `docker-compose.evolution-local.yml` |
| Payload worker | `{ number, text }` na raiz (Evolution 2.3.7) — já no `outbox-worker.ts` |
| `EVOLUTION_INSTANCE` env | Prioridade sobre `tenant_integrations` (piloto instância `teste`) |
| E2E local (Agenda → outbox → Evolution) | **Parcial** — fluxo até HTTP Evolution; `sent` pendente alinhar `EVOLUTION_API_KEY` no `.env` com a instância |
| Validação manual PO | **OK** (Evolution 2.3.7, `host.docker.internal:8081`, sendText manual) |
| Staging cloud | **Pendente** |
| Waiver sem WhatsApp | Base em `docs/DECLARACAO_PILOTO_EVOLUTION.md` |

**Atenção operador:** se `.env` tiver `EVOLUTION_API_URL=http://evolution.test` (placeholder CI), o worker falha com `fetch failed`. Usar `docker-compose.evolution-local.yml` ou URL real no `.env`.

**Evidência:** `28_evolution_e2e.md`, `28_evolution_e2e_log.txt`, script `scripts/piloto-evolution-e2e.ps1`.

**Bloqueio piloto externo:** staging cloud + secret manager + evidências PNG.

---

## 8. Fluxos core

| Fluxo | Local/CI | Staging cloud |
|-------|----------|---------------|
| Login Admin/Atendente | Evidências MVP 01–02 | Pendente PNG 08–09 |
| RBAC API 403 | OK (txt) | Revalidar |
| Cross-tenant 403 | OK (txt) | Revalidar |
| Agenda / bloqueio / outbox UI | Evidências MVP 03–13 | Pendente PNG 15–18 |
| Outbox → Evolution E2E | **Parcial** (script + log 28) | **Pendente** 18–21 PNG |

Testes automatizados: **152** unit API + integração no CI; Web **40** testes.

---

## 9. Matriz de risco

| ID | Risco | Prob. | Impacto | Mitigação |
|----|-------|-------|---------|-----------|
| R1 | Repo público | Alta | Alto | Private ou waiver |
| R2 | Evolution ausente | Alta | Alto | Credenciais staging + smoke |
| R3 | Staging não deployado | Alta | Alto | DevOps Fase 1 (plano 3–5 d.u.) |
| R4 | PR unrelated histories | Média | Médio | Squash merge com PO |
| R5 | PR grande (45 commits) | Média | Médio | Review modular |

---

## 10. Bugs conhecidos

Nenhum bloqueante novo além dos itens de ambiente (Evolution placeholder, staging não cloud).

---

## 11. Pendências (com estimativa)

| # | Pendência | Responsável | Horas | Prazo |
|---|-----------|-------------|-------|-------|
| P1 | Abrir PR (login GitHub) | PO/DevOps | 0,5h | D+0 |
| P2 | Repo → Private | Proprietário | 0,5h | D+0 |
| P3 | Provisionar staging | DevOps | 8–16h | D+1–2 |
| P4 | Evolution staging | DevOps/cliente | 8–16h | D+2–4 |
| P5 | Evidências PNG 01–24 | QA/Fábrica | 8h | D+3–5 |
| P6 | Smoke WhatsApp E2E | QA | 4h | Após P4 |

---

## 12. Recomendações da fábrica

| Pergunta | Resposta |
|----------|----------|
| **Pronto para merge?** | **Não** — aguardar PO + staging/Evolution |
| **Pronto para piloto interno?** | **Parcial** — ambiente local/CI sim; staging cloud não |
| **Pronto para piloto externo?** | **Não** — Evolution + staging + repo Private |
| **Pronto para produção?** | **Não** |

**Risco operacional residual:** código homologado em CI, mas operação real (mensagens WhatsApp, URLs staging, visibilidade repo) não fechada.

**Data sugerida para liberar cliente piloto:** **2026-05-22** (D+5 úteis), condicionada a P2–P4 concluídos.

---

## 13. Documentos relacionados

- Plano: `docs/PILOTO_STAGING_01_PLANO.md`
- Deploy/rollback: `docs/PILOTO_STAGING_01_DEPLOY_ROLLBACK.md`
- Evidências: `docs/evidencias/piloto_staging_01/`
- MVP aceite (baseline UI): `docs/evidencias/mvp_piloto_aceite/`

---

## 14. Addendum — PILOTO-STAGING-02 integrado (2026-05-15)

| Campo | Valor |
|--------|--------|
| PR | [#3](https://github.com/rvbbarreto-bot/barbearia-saas/pull/3) → base **`piloto-staging-01`** (**merged**) |
| Merge commit em `piloto-staging-01` | `e5a0f0d282251faed2cd6597d3aceddf011dce4f` |
| CI pós-merge (push `piloto-staging-01`) | [Actions run #23](https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25946809629) — **success** |
| Escopo | Núcleo operacional de agenda (regras, RBAC profissional, testes) — detalhe em `docs/evidencias/piloto_staging_02/` |

**Nota:** PR #2 (base `main`) não faz parte desta linha; deve permanecer **fechado sem merge**. Linha oficial de desenvolvimento: **`piloto-staging-01`** após `e5a0f0d`.
