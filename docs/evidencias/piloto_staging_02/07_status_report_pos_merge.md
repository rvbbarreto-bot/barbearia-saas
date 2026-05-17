# Status report — PILOTO-STAGING-02 (pós-merge PO)

**Data:** 2026-05-15  
**Decisão PO:** merge autorizado **apenas** [PR #3](https://github.com/rvbbarreto-bot/barbearia-saas/pull/3) → `piloto-staging-01`.

## Estado atual do código

| Campo | Valor |
|--------|--------|
| Branch destino | `piloto-staging-01` |
| Branch origem (histórico PR) | `feature/piloto-staging-02-agenda-operacional` |
| HEAD em `piloto-staging-01` após merge | `e5a0f0d282251faed2cd6597d3aceddf011dce4f` |
| Último commit da feature integrada | `d4d6936625440a8a25fdec1f9a3a24f2b43a5d9a` |
| PR integrado | [#3](https://github.com/rvbbarreto-bot/barbearia-saas/pull/3) (**merged**, base correta) |
| PR a **não** integrar | [#2](https://github.com/rvbbarreto-bot/barbearia-saas/pull/2) (base `main` — fechar sem merge se ainda aberto) |

## CI pós-merge (push `piloto-staging-01`)

| Campo | Valor |
|--------|--------|
| Workflow | `CI` (`ci.yml`) |
| Evento | `push` |
| Run GitHub | **#23** — [Actions run 25946809629](https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25946809629) |
| Commit disparador | `e5a0f0d` |
| Conclusão | **success** |
| Jobs | API (typecheck, lint, test, build); Web (idem); Security npm audit; Security Gitleaks — todos verdes |

## Escopo entregue (resumo)

- Regras de agendamento (datas no passado), escopo profissional em mutações e em **create/walk-in** (`assertProfessionalBookingBodyScope`), cancel com `assertAppointmentMutationScope` antes do idempotente, rotas com `professional_id`, testes (lifecycle, autorização, unitários), evidências `piloto_staging_02/`, gatilhos CI para a branch de entrega e PR contra `piloto-staging-01`.

## O que **não** fecha com este merge

- **Proposta 012** (`docs/PROPOSTA_TECNICA_012_OPERACAO_AGENDA.md`): histórico rico em `appointment_status_history`, novos PATCH check-in/start, matriz 012 completa — **fora** deste pacote; ver nota no próprio documento 012.
- **Piloto externo / Evolution E2E produto** — continua condicionado a evidências e gate em `piloto_staging_01` / roadmap PO.

## Próximo passo sugerido (fábrica)

1. Confirmar no GitHub que **PR #2** está **closed** (sem merge).  
2. Trabalhar a partir de **`piloto-staging-01`** como linha oficial até nova branch de entrega.  
3. Atualizar qualquer script interno que ainda aponte só à feature sem sincronizar com `piloto-staging-01`.
