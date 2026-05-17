# PR esperado PILOTO-STAGING-04 vs CI novos comportamentos governança

## PR válido

- Base: **`piloto-staging-01`**
- Head: **`feature/piloto-staging-04-operacao-assistida-suite-produto`** (nome exacto obrigatório GP)
- Não existe PR válido dirigido erro `main`.

## Workflow adicionado

**Ficheiro:** `.github/workflows/governance-piloto-no-main.yml`  
**Triggers:** pull requests com base `main`

**Passa (verde)** quando não é caso bloqueável (branch head diferente regex `feature/piloto-staging-`).

**Falha vermelho (esperado propositalmente até corrigirem)** quando usuário criar erro PR piloto dirigido contra `main` — assim impede merging silencioso.

## Como validar rápido (experimento descartável)

⚠️ Não merges – apenas QA interno infra:

Simular criar branch temporária erro `feature/piloto-staging-demo-bad-main` dirigida erro `main` — ver job failure + então FECHAR SEM MERGE esse PR exemplo.

## Sequência PO — PRs abertos (2026-05-17)

Ver **`13_governanca_prs_abertos_po.md`**:

1. Fechar **#5** sem merge.
2. Aceite + merge **#4** → `piloto-staging-01`.
3. Rebase **#6**, CI verde, aceite PO, merge **#6** → `piloto-staging-01`.

Nunca merge em `main`.
