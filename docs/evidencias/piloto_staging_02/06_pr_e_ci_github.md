# PR e evidência CI — PILOTO-STAGING-02

## Abrir Pull Request

**Compare (base → head):**

https://github.com/rvbbarreto-bot/barbearia-saas/compare/piloto-staging-01...feature/piloto-staging-02-agenda-operacional?expand=1

- Base: **`piloto-staging-01`**
- Cabeça: **`feature/piloto-staging-02-agenda-operacional`**
- **Não** mesclar em `main` sem decisão PO.

Na máquina de desenvolvimento sem `gh` CLI, abrir o PR pela URL acima.

## Gatilhos CI após este pacote de evidências

O workflow `.github/workflows/ci.yml` inclui:

- `push` na branch `feature/piloto-staging-02-agenda-operacional`
- `pull_request` com base em `piloto-staging-01` (além de `main` / `develop`)

Assim o critério “CI verde” aplica ao PR contra `piloto-staging-01`.

## Como colar evidência CI verde (PO)

1. Abrir Actions no repositório: https://github.com/rvbbarreto-bot/barbearia-saas/actions
2. Selecionar run da branch ou do PR PILOTO-STAGING-02 com jobs **API**, **Web**, **Security**, **Gitleaks** em sucesso.
3. Anexar link do run ao pacote de aceite (opcionalmente screenshot da lista verde).
