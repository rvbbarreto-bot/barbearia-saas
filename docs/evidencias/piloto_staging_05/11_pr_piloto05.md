# PR PILOTO-STAGING-05

**Base:** `piloto-staging-01`  
**Head:** `feature/piloto-staging-05-operacao-gestao-automacao`  
**Nunca** target `main`.

## Criar PR

```bash
gh pr create --base piloto-staging-01 --head feature/piloto-staging-05-operacao-gestao-automacao \
  --title "feat(piloto-05): bloco 1 outbox operacional completo" \
  --body "## Summary
- Outbox: error_class, filtro customer_id e error_class, OpenAPI, testes API/Web
- Evidências Bloco 1 em docs/evidencias/piloto_staging_05/
- Blocos 2-10 fora deste PR (épico incremental)

## Test plan
- [ ] CI verde
- [ ] QA prints P01-P09 em prints/
- [ ] Rebase após merge PR #6 se painel /operacao/status necessário na base
"
```

Compare: https://github.com/rvbbarreto-bot/barbearia-saas/compare/piloto-staging-01...feature/piloto-staging-05-operacao-gestao-automacao

## Rebase pós PR #6

Se `piloto-staging-01` ainda não incluir PILOTO-04 (#6):

```bash
git fetch origin
git rebase origin/piloto-staging-01
git push --force-with-lease
```
