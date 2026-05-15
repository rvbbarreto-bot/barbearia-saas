# PR e evidência CI — PILOTO-STAGING-02

## Push corretivo (2026-05-15) — SHA e CI

- **Commit principal com correções de agenda (`fix(agenda): …`):** `2d964122ddd661124091637e50ee1c2a3c1c2c7e`.
- **CI (evento push, workflow CI run #18):** https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25944290957  
  **Conclusion:** `success`. **Jobs:** API (typecheck, lint, test, build); Web idem; Security npm audit; Gitleaks.
- **Pull Request formal:** até a criação no GitHub, a API lista vazio para `base=piloto-staging-01` + head desta branch — **substituir esta linha pelo URL do PR** após clicar “Create pull request” no compare abaixo (ex.: `https://github.com/rvbbarreto-bot/barbearia-saas/pull/<número>`).

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

## Hash de referência (auditoria PO)

O commit de entrega original citado na validação técnica mantém o SHA completo **`4222ba9b7d941e41714bfb3ffecc35158186d941`** (prefixo curto `4222ba9`). Commits corretivos posteriores ficam em cima desta linha; usar `git rev-parse HEAD` na branch após cada push para o pacote de evidências.

## Como colar evidência CI verde (PO)

1. Abrir Actions no repositório: https://github.com/rvbbarreto-bot/barbearia-saas/actions
2. Selecionar run da branch ou do PR PILOTO-STAGING-02 com jobs **API**, **Web**, **Security**, **Gitleaks** em sucesso.
3. Anexar link do run ao pacote de aceite (opcionalmente screenshot da lista verde).
