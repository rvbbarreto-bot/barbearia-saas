# Resumo PO — PILOTO-STAGING-03

## O que se pretende

Uma **grande entrega** que deixe o produto **pronto para QA real** via **n8n**: workflows **importados, configurados e testados** (não aceites versões “só documentadas”), mais **painel de homologação** no Web, **agenda** reforçada sem regressão, **outbox** com RBAC e erros claros, e **auditoria** rastreável.

## Regras de ouro (reprovação automática se falharem)

- Workflow sem execução local/controlada evidenciada.
- Secret ou `.env` real no Git.
- PR com base `main` para esta entrega.
- Merge em `main` sem decisão explícita.
- Feature listada sem evidência (considerada **não entregue**).

## Governança

- Incidente **PR #2 → `main`**: ver `00_governanca_incidente_pr2_merge_main.md`. Sem reset/revert/force sem autorização formal.
- Linha oficial: **`piloto-staging-01`**; PR apenas para esta base.

## Estado ao kickoff

Entrega **iniciada**; matriz de aceite em `03_matriz_aceite.md` começa em **PEND** até fechamento com CI verde e evidências completas.
