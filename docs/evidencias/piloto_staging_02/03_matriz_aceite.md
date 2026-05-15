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
| 9 | CI verde | Gatilhos em `ci.yml`; verificar run após próximo push (`06_pr_e_ci_github.md`) |
| 10 | Sem secrets no Git | OK |
| 11 | Sem dependência Evolution/n8n | OK |
| 12 | Documentação `docs/evidencias/piloto_staging_02/` | OK |
| 13 | PR aberto para `piloto-staging-01` sem merge | Abrir via `06_pr_e_ci_github.md` |
