# PILOTO-STAGING-02 — Núcleo operacional de agenda

**Branch:** `feature/piloto-staging-02-agenda-operacional`  
**Base:** `piloto-staging-01`

**Aceite formal:** exige PR aberto para `piloto-staging-01`, CI GitHub verde na branch/PR (API, Web, auditoria npm, Gitleaks) e matriz `03_matriz_aceite.md` atualizada.

**Estado rápido (pós-push corretivo):** CI push no commit `2d964122ddd661124091637e50ee1c2a3c1c2c7e` — [run verde](https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25944290957). Falta apenas **PR formal** (compare → “Create pull request”) para fechar aceite antes de decisão de merge (`06_pr_e_ci_github.md`).

## Conteúdo

| Arquivo | Descrição |
|---------|-----------|
| `01_relatorio_tecnico.md` | Implementação, testes, riscos |
| `02_resumo_po.md` | Resumo funcional para PO |
| `03_matriz_aceite.md` | Critérios de aceite |
| `04_testes_locais.txt` | Saída dos comandos locais |
| `05_qa_local.md` | Como QA valida sem Evolution/n8n |
| `06_pr_e_ci_github.md` | Link compare PR + CI |

## Fora de escopo desta entrega

- WhatsApp / Evolution / n8n smoke real
- Staging cloud
- Piloto externo
