# Relatório técnico — PILOTO-STAGING-02

## Objetivo

Endurecer o núcleo operacional de agenda (disponibilidade, conflitos, bloqueios, RBAC profissional, cross-tenant) com testes automatizados, sem dependência de Evolution/n8n.

## Implementação

### Regras de agendamento

- `appointment-scheduling-rules.ts` — `assertAppointmentStartsNotInPast` (tolerância 60s), usado em **create** e **reschedule**.

### Escopo de mutação (profissional)

- `assert-appointment-mutation-scope.ts` — profissional só altera agendamentos do próprio `professional_id`.
- Aplicado em: confirm, cancel, reschedule, check-in, start, complete, no-show.
- Rotas passam `professional_id` do JWT para o serviço.

### Testes novos (API)

| Arquivo | Cobertura |
|---------|-----------|
| `appointment-scheduling-rules.test.ts` | Datas passadas |
| `assert-appointment-mutation-scope.test.ts` | 403 cross-prof |
| `appointments.lifecycle.integration.test.ts` | Confirm, cancel libera slot, reschedule passado, cross-prof, cross-tenant 404 |
| `authorization-routes.integration.test.ts` | Confirm viewer 403 / attendant 200 |

### Web

- `apiErrorMessage.test.ts` — mapeamento `APPOINTMENT_IN_PAST` e `FORBIDDEN`.

## Comandos executados (local)

Ver `04_testes_locais.txt`.

## Riscos residuais

- Integração DB lifecycle depende de `DATABASE_URL` + Redis no CI (já existente).
- UI agenda: bloqueio via `/calendar-blocks` (manager); atendente usa API `/time-blocks` sem tela dedicada.
- Workflow n8n 01 ainda exige substituir `SUBSTITUIR_PELO_ID_DO_WORKFLOW_02` em QA integrado.

## Migrations

Nenhuma migration nesta entrega (sem alteração de schema).
