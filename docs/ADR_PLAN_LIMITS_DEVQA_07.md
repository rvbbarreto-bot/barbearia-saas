# ADR — `plan_limits` (DEV/QA-07)

## Decisão

**Não implementar** middleware HTTP `402 PLAN_LIMIT_EXCEEDED` nem enforcement transacional de limites neste pacote.

## Contexto

- A coluna `tenants.plan_limits` (jsonb) já existe (migrações iniciais).
- O desenho de enforcement está descrito em `docs/ADR_PLAN_LIMITS_ENFORCEMENT.md`.

## Motivo

- Prioridade DEV/QA-07 foi **RLS/auth/audit (desenho)**, **OpenAPI**, **financeiro/comissão (API+UI+testes)** e **dashboard**.
- Enforcement de plano exige contrato JSON canónico (`max_professionals`, `max_services`, `max_users`, `features`), cache/TTL e testes de integração por cada `POST` afetado — fora do tempo útil deste incremento sem comprometer qualidade.

## Endpoints futuros impactados (quando implementado)

- `POST /api/v1/professionals`
- `POST /api/v1/services`
- `POST /api/v1/users` (ou fluxo de convite equivalente)

## Risco comercial

- Tenant em trial pode criar recursos além do anunciado até existir enforcement técnico — mitigação atual: **contrato / operações manuais**.

## Próximo passo

1. Fechar schema JSON de `plan_limits` com PO.
2. Implementar `assertPlanLimit` + 402 + OpenAPI + testes conforme `ADR_PLAN_LIMITS_ENFORCEMENT.md`.

---

**Entrega DEV/QA.** Não representa produção, piloto comercial ou GA.
