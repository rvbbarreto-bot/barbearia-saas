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
