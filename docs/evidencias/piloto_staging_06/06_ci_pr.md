# CI e PR — PILOTO-STAGING-06

## PR

- **Número:** [#12](https://github.com/rvbbarreto-bot/barbearia-saas/pull/12)
- **Base:** `piloto-staging-01` ✓
- **Head:** `feature/piloto-staging-06-expansao-operacional-gestao`
- **SHA final:** `8983fa5e9b7db7a372a1cfe7f5776737f2eda00d`
- **CI:** **verde** — 8/8 checks (API, Web, Gitleaks, npm audit × push + pull_request)

## Jobs

| Job | Status |
|-----|--------|
| API — typecheck · lint · test · build | Pass |
| Web — lint · typecheck · test · build | Pass |
| Security — Gitleaks | Pass |
| Security — npm audit | Pass |

**Testes API:** 367 passed (integração + unitários, RLS `barbearia_app`).

## Histórico de correções CI

| SHA | Descrição |
|-----|-----------|
| `1b50a7f` | RLS `tenant_settings` car-wash |
| `aa1550d` | CT-073 `walk_in` |
| `dfa4da0` | Slots distintos overlap |
| `bb2863a` | Asserções `withTenant` car-wash |
| `a9a4e65` | Portal oficial, idempotência, placa |
| `a9f8ce2` | `trade_name` portal view |
| `8983fa5` | `loadAppointmentView` pós-mutação em `withTenant` |

## Governança

- Merge alvo: **`piloto-staging-01`** após aceite PO (`11_relatorio_entrega_po_pr12.md`).
- **Sem merge em `main`.**
