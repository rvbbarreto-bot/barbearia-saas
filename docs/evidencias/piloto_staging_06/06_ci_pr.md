# CI e PR — PILOTO-STAGING-06

## PR

- **Número:** [#11](https://github.com/rvbbarreto-bot/barbearia-saas/pull/11)
- **Base:** `piloto-staging-01`
- **Head:** `feature/piloto-staging-06-expansao-operacional-gestao`

## Histórico SHA relevante

| SHA | Descrição | CI API |
|-----|-----------|--------|
| `1e349c9` | Entrega MVP PS-06 + Lava Rápido | FAILURE — RLS `tenant_settings` no setup car-wash |
| `1b50a7f` | fix RLS `withTenant` em car-wash.integration | FAILURE — CT-073 `FORBIDDEN` em `createAppointment` |
| *(pendente push)* | fix `walk_in` para `explicit_confirmation: false` | Aguardar run |

## Correções aplicadas (fábrica)

1. **RLS:** inserts/deletes em `tenant_settings` e `users` via `withTenant`.
2. **CT-073:** testes com `explicit_confirmation: false` usam `source: 'walk_in'` (attendant+).
3. **ci.yml:** branch `feature/piloto-staging-06-expansao-operacional-gestao` no trigger `push`.

## Jobs esperados no PR

- API — typecheck · lint · test · build
- Web — lint · typecheck · test · build
- Security — npm audit
- Security — Gitleaks

## Sem merge em main

Nenhum PR aberto contra `main`. Merge em `piloto-staging-01` apenas com aceite PO/GP.
