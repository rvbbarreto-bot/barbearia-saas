# Kickoff — PS-08 Sprint 2 (P2) · Hardening + QA automation

**Data:** 2026-05-27  
**Base:** `origin/piloto-staging-01` (pós merge PR #14)  
**Branch de trabalho:** `feature/ps08-4-evolution-compose` (PS-08.4 + PS-08.5 na mesma linha)  
**PO / Tech Lead:** retomada pós Sprint 1 P1

---

## 1. Objetivo da sprint

Consolidar na linha piloto o trabalho local que estava fora do merge #14 e preparar homologação doc 10 + Sprint 2 (P2).

| Pacote | Branch / PR alvo | Conteúdo |
|--------|------------------|----------|
| **A** | `feature/ps08-sprint2-hardening` | PS-08.6 cobertura + GAP-03 viewer + scripts seed |
| **B** | mesmo branch ou PR seguinte | Automação QA (Robot, Playwright, rodada3) |
| **C** | `feature/ps08-agenda-ux` (opcional) | UX agenda — card separado PO |
| **D** | Sprint 2 P2 | PS-08.4 Evolution, PS-08.5 n8n import, PS-08.9 CI browser |

---

## 2. Entregas deste branch (hardening)

- [x] `vitest.ps06.config.ts` + testes unitários módulos PS-06
- [x] `npm run test:api:coverage:ps06` na raiz
- [x] Perfil `viewer` — migration `108` + `scripts/qa-seed-viewer.ps1`
- [x] RBAC read-only viewer (`rbac.ts` + testes)
- [ ] CI verde no PR [#15](https://github.com/rvbbarreto-bot/barbearia-saas/pull/15) → base `piloto-staging-01` (fix typecheck PS-06 mocks em curso)
- [ ] QA reexecuta `run-doc10.mjs` + assinatura PO Sprint 1 P1

---

## 3. Comandos de validação (time sênior)

```powershell
docker compose up -d postgres redis api web
npm run db:migrate
npm run test:api:unit
npm run test:api:coverage:ps06
npm run test:web
.\scripts\qa-piloto-staging-07-rodada3.ps1
$env:QA_WEB_BASE = "http://localhost:3001"
node scripts/qa-browser/run-doc10.mjs
```

---

## 4. Critérios de aceite PR hardening

| Critério | Responsável |
|----------|-------------|
| Gate PS-06 ≥82% local e CI | Dev |
| Viewer login no seed + 403 em POST gestão | QA |
| Regressão API 26/26 | QA |
| Sem `_portal_token.txt` no commit | Tech Lead |
| Prints PS-08 P1 em `piloto_staging_08/prints/` | QA + PO |

---

## 5. Próximo card PO (Sprint 2 P2 — após merge hardening)

1. **PS-08.4** — profile Evolution `:8081` *(código na branch; QA C35–C36 pendente Docker)*
2. **PS-08.5** — `scripts/n8n-import-piloto-workflows.ps1` *(implementado; QA C34 pendente n8n up)*
3. **PS-08.9** — job CI browser smoke

Referência: `docs/evidencias/piloto_staging_07/12_demandas_po_proxima_release_fabrica.md` §3–4.

---

## 6. Rastreabilidade

| Artefato | Uso |
|----------|-----|
| `01_relatorio_entrega_ps08_sprint1.md` | Entrega P1 mergeada (#14) |
| `02_kickoff_ps08_sprint2_p2.md` | **Este documento** |
| `docs/QA_AUTOMATION_STRATEGY.md` | Estratégia testes |
