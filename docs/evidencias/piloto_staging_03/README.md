# PILOTO-STAGING-03 — Pacote operacional avançado para QA via n8n, agenda, outbox, auditoria e painel de homologação

**Branch oficial de integração:** `piloto-staging-01`  
**Branch de entrega:** `feature/piloto-staging-03-qa-operacional-n8n-ready`

**Governança:** incidente PR #2 → `main` — ver `00_governanca_incidente_pr2_merge_main.md`. **Proibido** merge desta entrega em `main` sem decisão PO.

## Índice de evidências

| Ficheiro | Conteúdo |
|----------|----------|
| `00_governanca_incidente_pr2_merge_main.md` | Incidente merge indevido; sem reset/revert/force sem autorização |
| `01_relatorio_tecnico.md` | Relatório técnico (evolução ao longo da entrega) |
| `02_resumo_po.md` | Resumo para PO |
| `03_matriz_aceite.md` | Critérios de aceite |
| `04_roteiro_qa_n8n.md` | Roteiro QA n8n (import, smoke, erros controlados) |
| `05_roteiro_qa_web_api.md` | Roteiro QA Web/API + painel homologação |
| `10_guia_inicio_testes_qa_n8n.md` | **Guia formal início QA n8n** (pré-requisitos, variáveis, BDD, matriz, import) |
| `qa_n8n/README.md` | Placeholders de evidências + `VALIDATION_SCRIPT_OUTPUT.txt` |
| `../n8n/README.md` | Espelho de workflows em `docs/n8n/` |

## Abrir PR (base obrigatória)

**Compare (head → base `piloto-staging-01`):**  
https://github.com/rvbbarreto-bot/barbearia-saas/compare/piloto-staging-01...feature/piloto-staging-03-qa-operacional-n8n-ready?expand=1

Não abrir PR com base `main`.

**Início dos testes QA (n8n):** ver `10_guia_inicio_testes_qa_n8n.md`.

## Workflows n8n obrigatórios (repo)

- **Cópia para QA (import guiado):** `docs/n8n/01_*.json` … (espelho; ver `docs/n8n/README.md`)
- **Fonte histórica:** `n8n/workflows/*.json` (mesmo conteúdo após sincronização)

Validação: `node scripts/n8n-validate-workflow-import.mjs`
