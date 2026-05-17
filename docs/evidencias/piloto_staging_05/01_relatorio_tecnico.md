# PILOTO-STAGING-05 — Operação, gestão e automação

**Branch:** `feature/piloto-staging-05-operacao-gestao-automacao`  
**Base:** `piloto-staging-01` @ `e6527e6` (pós-merge PR #4)  
**PR:** contra `piloto-staging-01` apenas — **nunca `main`**

## Dependências de base

| Item | Nota |
|------|------|
| PR #6 (PILOTO-04) | Painel `/operacao/status` — **recomendado merge em `piloto-staging-01` antes ou rebase P05 após #6** |
| Smoke n8n/Evolution | Não alterar payload/classificador aprovado sem evidência |

## Escopo (10 blocos)

Ver `03_matriz_aceite.md` — entrega incremental por bloco com testes e evidências.

## Progresso atual (kickoff)

| Bloco | Tema | Status |
|-------|------|--------|
| 1 | Outbox operacional completo | **OK** — mergeado PR #7 em `piloto-staging-01` |
| 2 | Auditoria + correlation | **OK** — ver `20_relatorio_bloco2_auditoria.md` |
| 3 | Dashboard gerencial | PEND |
| 4 | Histórico 360 cliente | PEND |
| 5 | Waitlist operacional | PEND |
| 6 | Financeiro mínimo | PEND |
| 7 | Comissão básica | PEND |
| 8 | n8n workflows 01/02 | PEND (revalidação) |
| 9 | Recall seguro | PEND |
| 10 | Portal tokenizado | PEND |

## Migrations

Nenhuma no kickoff Bloco 1 (usa `message_outbox` existente).
