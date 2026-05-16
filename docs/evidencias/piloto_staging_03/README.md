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
| `06_riscos_e_fora_escopo.md` | Riscos residuais e fora de escopo |

## Abrir PR (base obrigatória)

**Compare (head → base `piloto-staging-01`):**  
https://github.com/rvbbarreto-bot/barbearia-saas/compare/piloto-staging-01...feature/piloto-staging-03-qa-operacional-n8n-ready?expand=1

Não abrir PR com base `main`.

## Workflows n8n obrigatórios (repo)

- `n8n/workflows/01_whatsapp_router_multitenant.json`
- `n8n/workflows/02_ai_scheduling_agent_multitenant.json`
- `n8n/workflows/03_QA_Barbearia_Evolution_SendText_Smoke.json`
- `n8n/workflows/03_recall_30_days_multitenant.json` (recall 30 dias)

Validação em CI de ficheiros: `node scripts/n8n-validate-workflow-import.mjs` (quando integrado no pipeline desta entrega).
