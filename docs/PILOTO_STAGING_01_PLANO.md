# PILOTO-STAGING-01 — Plano de homologação operacional

**Data diagnóstico:** 2026-05-15  
**HEAD:** `a379e11d7c964522698cff5d5c0f33897f2d24b5`  
**Branch:** `feature/p2-2-web-outbox-whatsapp-operational`  
**Prazo entrega técnica:** 3–5 dias úteis (D+5: 2026-05-22)

---

## Status gate PO (entrada)

| Item | Status |
|------|--------|
| CI remoto (#8, #9) | APROVADO |
| Gitleaks CI | APROVADO |
| Branch remota | APROVADA |
| Merge `main` | NÃO autorizado |
| Piloto externo | NÃO autorizado |
| Próxima etapa | **PILOTO-STAGING-01** |

---

## Fase 0 — Governança (D+0, 24h)

| # | Entrega | Responsável | Status |
|---|---------|-------------|--------|
| G1 | PR `feature/p2-2` → `main` (sem merge) | Fábrica + PO | Em abertura |
| G2 | CI verde no HEAD do PR | CI automático | OK (`a379e11`, run #9) |
| G3 | Repositório Private ou waiver público | Proprietário GitHub | **BLOQUEIO** — repo **Public** |
| G4 | Working tree limpa | Fábrica | OK |

**Link compare PR:**  
https://github.com/rvbbarreto-bot/barbearia-saas/compare/main...feature/p2-2-web-outbox-whatsapp-operational?expand=1

**Commits no PR:** 45 (desde `main` @ `a98586e` Initial commit)

---

## Fase 1 — Staging infra (D+1 a D+2)

| # | Entrega | Artefato |
|---|---------|----------|
| S1 | Host/VPS ou cloud com Docker + Traefik | `docker-compose.staging.yml` |
| S2 | `.env.staging` preenchido (fora do git) | `.env.staging.example` |
| S3 | Imagem API versionada (`API_IMAGE`) | GHCR / registry semver |
| S4 | Web staging (Traefik ou compose local) | URL documentada |
| S5 | Postgres + Redis + n8n staging | healthchecks |
| S6 | Procedimento deploy | `docs/PILOTO_STAGING_01_DEPLOY_ROLLBACK.md` |
| S7 | Procedimento rollback | idem |
| S8 | `/health` + `/database/health` | JSON em evidências 06–07 |

**Referência local (dev/QA):** `docker compose up` — API `http://localhost:3000`, Web `http://localhost:3001`.

---

## Fase 2 — Evolution / WhatsApp (D+2 a D+4) — CRÍTICO

| # | Entrega | Critério |
|---|---------|----------|
| E1 | `EVOLUTION_API_URL` staging real | Sem placeholder `evolution.example.com` |
| E2 | `EVOLUTION_API_KEY` em secret manager | Nunca no repositório |
| E3 | Smoke sendText | Status `sent` no outbox |
| E4 | Fluxo 10 passos PO (agenda → outbox → worker → portal) | Evidências 18–23 |
| E5 | Retry admin + 403 atendente | Já coberto em testes; repetir em staging |

**Se Evolution indisponível:** waiver formal em `docs/WAIVER_PILOTO_SEM_WHATSAPP_REAL.md` (base: `DECLARACAO_PILOTO_EVOLUTION.md`).

| Campo waiver | Valor |
|--------------|-------|
| Causa raiz | Credenciais/host Evolution não provisionados |
| Responsável | DevOps / cliente |
| Impacto | Piloto externo bloqueado |
| Prazo estimado | 2–3 d.u. após credenciais |
| Esforço | ~16h (provisionar + smoke + evidências) |

---

## Fase 3 — Fluxos core + UX (D+3 a D+5)

Reutilizar baterias existentes:

- `scripts/qa-p2-2-web-outbox-whatsapp-battery.ps1`
- `scripts/qa-api-negative-battery.ps1`
- Evidências MVP em `docs/evidencias/mvp_piloto_aceite/` (baseline UI)

Novas capturas staging: `docs/evidencias/piloto_staging_01/` (25 itens).

---

## Fase 4 — Observabilidade (D+4)

| Log obrigatório | Onde |
|-----------------|------|
| correlation_id / request_id | API Fastify + worker `[outbox-worker]` |
| RBAC 403 | middleware rbac |
| cross-tenant | tenant middleware |
| Evolution send | worker + `last_error` / `provider_response` |

Coleta: `docker logs barbearia-api-staging`, `docker logs barbearia-api` (local).

---

## Fase 5 — Testes + CI (contínuo)

| Suíte | Comando |
|-------|---------|
| API unit | `cd apps/api && npm run test:unit` |
| API full | `cd apps/api && npm test` (com Postgres) |
| Web | `cd apps/web && npm run typecheck && npm test && npm run build` |
| Gitleaks | CI + Docker local |
| npm audit | CI Security job |

---

## Matriz de risco (resumo)

| Risco | Prob. | Impacto | Mitigação |
|-------|-------|---------|-----------|
| Repo público | Alta | Alto (vazamento futuro) | Tornar Private |
| Evolution não configurado | Alta | Alto (piloto externo) | Staging creds ou waiver |
| PR grande (45 commits) | Média | Médio | Review por fases; não merge até PO |
| Staging não provisionado | Alta | Alto | Fase 1 com DevOps |

---

## Critérios de aprovação PO (checklist final)

- [ ] PR aberto
- [ ] CI HEAD verde
- [ ] Gitleaks verde
- [ ] Repo Private **ou** waiver público assinado
- [ ] Staging URLs + health OK
- [ ] Evolution validado **ou** waiver WhatsApp
- [ ] Fluxo agenda + outbox + (WhatsApp) comprovado
- [ ] RBAC + cross-tenant comprovados
- [ ] Documentação operacional para QA/suporte
