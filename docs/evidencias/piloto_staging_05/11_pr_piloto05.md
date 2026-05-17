# PR PILOTO-STAGING-05

**Base:** `piloto-staging-01`  
**Head:** `feature/piloto-staging-05-operacao-gestao-automacao`  
**Nunca** target `main`.

## Criar PR (obrigatório — ainda não existe PR P05)

**Base:** `piloto-staging-01` @ `e6527e6`  
**Head:** `feature/piloto-staging-05-operacao-gestao-automacao` @ `782d321` (ou HEAD atual)  
**Nunca** target `main`.

PR #6 aberto é **PILOTO-04** (outra branch) — não confundir.

```bash
gh auth login   # se necessário
gh pr create --base piloto-staging-01 --head feature/piloto-staging-05-operacao-gestao-automacao \
  --title "feat(piloto-05): bloco 1 outbox operacional completo" \
  --body-file docs/evidencias/piloto_staging_05/11_pr_body.md
```

Compare (UI): https://github.com/rvbbarreto-bot/barbearia-saas/compare/piloto-staging-01...feature/piloto-staging-05-operacao-gestao-automacao

**CI branch verde (referência):** https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25994652688 (commit `9ce9519`). Após abrir PR, confirmar checks verdes na página do PR e atualizar print `P10` se necessário.

## Rebase pós PR #6

Se `piloto-staging-01` ainda não incluir PILOTO-04 (#6):

```bash
git fetch origin
git rebase origin/piloto-staging-01
git push --force-with-lease
```
