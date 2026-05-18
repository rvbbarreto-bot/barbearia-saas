# Governança PR #11 — ação PO/DevOps obrigatória

## Diagnóstico (API GitHub, 2026-05-18)

| Campo | Valor atual | Correto |
|-------|-------------|---------|
| PR | [#11](https://github.com/rvbbarreto-bot/barbearia-saas/pull/11) | — |
| Head | `feature/piloto-staging-06-expansao-operacional-gestao` | OK |
| **Base** | **`main`** | **`piloto-staging-01`** |
| SHA head | `aa1550d` (atualizar após novos commits) | — |

O PR contra `main` viola a governança do piloto. **Não fazer merge.**

## Opção A — Alterar base (recomendado)

1. Abrir https://github.com/rvbbarreto-bot/barbearia-saas/pull/11  
2. Clicar em **Edit** (ao lado do título)  
3. Em **base**, trocar `main` → `piloto-staging-01`  
4. Confirmar — o CI do PR será reexecutado contra a base correta  

Requer permissão de maintainer no repositório (`gh pr edit 11 --base piloto-staging-01` com token).

## Opção B — Fechar e recriar

1. Fechar PR #11 **sem merge**  
2. Abrir PR novo:  
   https://github.com/rvbbarreto-bot/barbearia-saas/compare/piloto-staging-01...feature/piloto-staging-06-expansao-operacional-gestao  
3. Base: `piloto-staging-01` | Compare: `feature/piloto-staging-06-expansao-operacional-gestao`  

## Evidência de conformidade

Após correção, o cabeçalho do PR deve exibir:

```text
rvbbarreto-bot wants to merge N commits into piloto-staging-01 from feature/piloto-staging-06-expansao-operacional-gestao
```

## CI após correção de base

Jobs esperados (`.github/workflows/ci.yml` → `pull_request` → `piloto-staging-01`):

- API — typecheck · lint · test · build  
- Web — lint · typecheck · test · build  
- Security — npm audit  
- Security — Gitleaks  

## Fábrica (sem `GH_TOKEN` local)

Não foi possível alterar a base via `gh` neste ambiente. Commits de correção de testes seguem na branch `feature/piloto-staging-06-expansao-operacional-gestao`.
