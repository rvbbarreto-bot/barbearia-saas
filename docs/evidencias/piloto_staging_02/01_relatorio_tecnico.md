# Relatório técnico — PILOTO-STAGING-02

## Objetivo

Endurecer o núcleo operacional de agenda (disponibilidade, conflitos, bloqueios, RBAC profissional, cross-tenant) com testes automatizados, sem dependência de Evolution/n8n.

## Implementação

### Regras de agendamento

- `appointment-scheduling-rules.ts` — `assertAppointmentStartsNotInPast` (tolerância 60s), usado em **create** e **reschedule**.

### Escopo de mutação (profissional)

- `assert-appointment-mutation-scope.ts` — `assertAppointmentMutationScope`: profissional só altera agendamentos do próprio `professional_id`. Em **cancel**, a asserção corre **após** carregar o agendamento e **antes** do retorno idempotente quando já está `cancelled`.
- `assertProfessionalBookingBodyScope` — profissional autenticado só pode `professional_id` no body igual ao da própria agenda (create e walk-in, que reutilizam `createAppointment`).
- Aplicado em mutação: confirm, cancel, reschedule, check-in, start, complete, no-show.
- Rotas relevantes passam `professional_id` e `requestId` do pedido para o serviço (incluindo `PATCH …/cancel`).

### Testes novos (API)

| Arquivo | Cobertura |
|---------|-----------|
| `appointment-scheduling-rules.test.ts` | Datas passadas |
| `assert-appointment-mutation-scope.test.ts` | Mutação cross-prof + body booking cross-prof (`assertProfessionalBookingBodyScope`) |
| `appointments.lifecycle.integration.test.ts` | Confirm, cancel libera slot, reschedule passado, cancel cross-prof negativo, create cross-prof negativo, cross-tenant 404; skip seguro sem env (`import()` em `beforeAll`) |
| `authorization-routes.integration.test.ts` | Confirm viewer 403 / attendant 200; cancel como professional repassa `professional_id` ao mock |

### Web

- `apiErrorMessage.test.ts` — mapeamento `APPOINTMENT_IN_PAST` e `FORBIDDEN`.

## Integração em `piloto-staging-01` (merge PO)

- **PR [#3](https://github.com/rvbbarreto-bot/barbearia-saas/pull/3)** — merge em `piloto-staging-01` com commit **`e5a0f0d282251faed2cd6597d3aceddf011dce4f`**.  
- **CI pós-merge** (push `piloto-staging-01`, workflow run **#23**): https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25946809629 — **success** (API, Web, npm audit, Gitleaks).  
- PR #2 (base `main`) não integrar — ver `06_pr_e_ci_github.md` e `07_status_report_pos_merge.md`.

## Commit corretivo publicado (histórico na feature)

- SHA **`2d964122ddd661124091637e50ee1c2a3c1c2c7e`** — `fix(agenda): enforce professional scope on booking and cancel` (push em `feature/piloto-staging-02-agenda-operacional`).
- CI associado a esse push: https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25944290957 — **success** (API, Web, auditoria npm, Gitleaks).

## Comandos executados (local)

Ver `04_testes_locais.txt`.

## Riscos residuais

- Integração DB lifecycle depende de `DATABASE_URL` + Redis no CI (já existente).
- UI agenda: bloqueio via `/calendar-blocks` (manager); atendente usa API `/time-blocks` sem tela dedicada.
- Workflow n8n 01 ainda exige substituir `SUBSTITUIR_PELO_ID_DO_WORKFLOW_02` em QA integrado.

## Migrations

Nenhuma migration nesta entrega (sem alteração de schema).
