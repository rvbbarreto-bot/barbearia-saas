# CI e PR — PILOTO-STAGING-06

## PR

- **Número:** [#12](https://github.com/rvbbarreto-bot/barbearia-saas/pull/12)
- **Base:** `piloto-staging-01` ✓
- **Head:** `feature/piloto-staging-06-expansao-operacional-gestao`
- **SHA feature (pré-merge):** `1a84c94` / `8983fa5`
- **Merge commit `piloto-staging-01`:** `c8d69024be246f5f390ad7441ab321de0386a41b`
- **CI pré-merge PR:** verde — 8/8 checks
- **CI pós-merge:** [run #117 — success](https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/26031913951) em `c8d6902`

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

- **MERGED** em `piloto-staging-01` — `c8d6902` (autorização PO 2026-05-18). Detalhes: `12_merge_executado_po.md`.
- **`main`:** inalterado (`276234e`).
