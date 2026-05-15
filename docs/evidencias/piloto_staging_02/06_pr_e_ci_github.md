# PR e evidência CI — PILOTO-STAGING-02

## Merge em `piloto-staging-01` (2026-05-15) — PO aprovado

- **Pull Request:** [#3](https://github.com/rvbbarreto-bot/barbearia-saas/pull/3) — base **`piloto-staging-01`**, head **`feature/piloto-staging-02-agenda-operacional`**.  
- **Estado:** **merged** (decisão PO; não usar PR contra `main`).  
- **Merge commit em `piloto-staging-01`:** `e5a0f0d282251faed2cd6597d3aceddf011dce4f`  
- **Último commit da feature no merge:** `d4d6936625440a8a25fdec1f9a3a24f2b43a5d9a`

### CI pós-merge (push em `piloto-staging-01`)

- **GitHub Actions run #23:** https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25946809629  
- **Conclusion:** `success`  
- **Jobs:** API (typecheck, lint, test, build); Web (idem); Security npm audit; Gitleaks.

### PR #2 (base incorreta)

- [PR #2](https://github.com/rvbbarreto-bot/barbearia-saas/pull/2) apontava para **`main`** — **não mergear**; manter **fechado sem merge** (ação PO/fábrica).

---

## Histórico — CI na branch de entrega (pré-merge)

- **Commit principal com correções de agenda (`fix(agenda): …`):** `2d964122ddd661124091637e50ee1c2a3c1c2c7e`.  
- **CI (push na feature, run #18):** https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25944290957 — **success**.

---

## Compare (referência / novas entregas)

https://github.com/rvbbarreto-bot/barbearia-saas/compare/piloto-staging-01...feature/piloto-staging-02-agenda-operacional?expand=1

- **Linha oficial pós-merge:** desenvolver a partir de **`piloto-staging-01`** atualizado (`e5a0f0d` ou posterior).

---

## Gatilhos CI (`.github/workflows/ci.yml`)

- `push` em `feature/piloto-staging-02-agenda-operacional` (entregas futuras na mesma convenção)  
- `push` em `piloto-staging-01` (inclui **CI pós-merge**, run #23)  
- `pull_request` com base em `piloto-staging-01`, `main` ou `develop`

---

## Hash de referência (auditoria PO)

- Entrega original citada na validação: **`4222ba9b7d941e41714bfb3ffecc35158186d941`**.  
- Corretivos e docs na feature: ver histórico até **`d4d6936`**; merge em **`e5a0f0d`**.

---

## Como colar evidência CI verde (PO)

1. Actions: https://github.com/rvbbarreto-bot/barbearia-saas/actions  
2. Filtrar branch **`piloto-staging-01`** ou run **#23** (merge).  
3. Confirmar jobs API, Web, Security, Gitleaks em sucesso (screenshot opcional no pacote de aceite).
