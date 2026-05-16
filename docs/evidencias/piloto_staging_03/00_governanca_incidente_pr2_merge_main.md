# Incidente de governança — PR #2 e branch `main`

**Data de registo:** 2026-05-16  
**Contexto:** PILOTO-STAGING-02 exige base **`piloto-staging-01`**. Foi identificado **merge indevido** do **[PR #2](https://github.com/rvbbarreto-bot/barbearia-saas/pull/2)** na branch **`main`** (base incorreta para a entrega piloto).

## Decisão PO / Gestão

- **Não** executar `git reset`, `git revert` em massa nem **force push** em `main` (ou outras branches) **sem autorização formal** explícita por escrito.
- A linha oficial de entrega **PILOTO-STAGING-03** parte **exclusivamente** de **`piloto-staging-01`**, não de `main` até nova decisão de reconciliação.
- Manter este registo como rastreabilidade; qualquer saneamento de `main` é decisão de release/governança à parte.

## Ações corretivas já aplicadas (histórico)

- Entrega agenda operacional integrada via **[PR #3](https://github.com/rvbbarreto-bot/barbearia-saas/pull/3)** → `piloto-staging-01` (base correta).
- PR #2 deve permanecer **fechado sem merge** se ainda existir em estado aberto; **não** reutilizar como veículo de entrega piloto.

## Correção documental — pacote de preparação QA (PILOTO-STAGING-03)

- Este ficheiro foi **revisto** no âmbito do commit de preparação QA (`chore(piloto-03): prepare n8n QA test pack for PO approval`) para reforçar a **linha oficial** (`piloto-staging-01`), proibição de merge/revert/force em `main` sem PO, e referência ao **PR #3** como entrega correta de agenda.
- O **PR #2** continua classificado como **incidente de base incorreta** (`main`); qualquer trabalho de reconciliação da branch `main` com o piloto é **fora do escopo** deste pacote e exige decisão explícita de gestão.
- O guia operacional para QA n8n encontra-se em **`10_guia_inicio_testes_qa_n8n.md`**.

## Impacto para PILOTO-STAGING-03

- Branch de trabalho: `feature/piloto-staging-03-qa-operacional-n8n-ready` criada a partir de **`piloto-staging-01`** no momento do kickoff.
- PRs desta entrega: **somente** contra **`piloto-staging-01`**.
- CI: ver `.github/workflows/ci.yml` (push na feature + `pull_request` → `piloto-staging-01`).
