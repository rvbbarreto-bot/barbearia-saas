# Matriz de aceite — PILOTO-STAGING-02

| # | Critério | Status |
|---|----------|--------|
| 1 | Branch `feature/piloto-staging-02-agenda-operacional` a partir de `piloto-staging-01` | OK |
| 2 | Sem merge na `main` | OK |
| 3 | Working tree limpo ao fechar | OK |
| 4 | Sem conflito de slot (create/reschedule) | OK (código + testes) |
| 5 | Bloqueio impede agendamento | OK (testes existentes `appointments-calendar-blocks`) |
| 6 | RBAC positivo/negativo | OK (+ confirm rota) |
| 7 | Cross-tenant negativo | OK (+ lifecycle) |
| 8 | Happy + failure path testes | OK |
| 9 | CI verde (GitHub Actions) | OK — PR #3 e **pós-merge** em `piloto-staging-01`: [CI run #23 / merge `e5a0f0d`](https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25946809629) — API, Web, npm audit, Gitleaks **success** (evidência visual validada pelo PO). Histórico: [run branch feature](https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25944290957). |
| 10 | Sem secrets no Git | OK |
| 11 | Sem dependência Evolution/n8n | OK |
| 12 | Documentação `docs/evidencias/piloto_staging_02/` | OK (alinhada ao estado real da entrega) |
| 13 | PR para `piloto-staging-01` + merge autorizado PO | OK — [PR #3](https://github.com/rvbbarreto-bot/barbearia-saas/pull/3) **merged** em `piloto-staging-01` (merge commit `e5a0f0d282251faed2cd6597d3aceddf011dce4f`). **Não** usar PR #2 (base `main`; deve permanecer fechado sem merge). |
| 14 | Cancelamento: `assertAppointmentMutationScope` antes do retorno idempotente + rota repassa `professional_id` | OK (código + testes) |
| 15 | Create/walk-in: profissional não agenda para outro `professional_id` (`assertProfessionalBookingBodyScope`) | OK (código + testes) |
