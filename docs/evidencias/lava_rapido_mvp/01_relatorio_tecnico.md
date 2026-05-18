# Relatório técnico — Lava Rápido MVP

**Branch:** `feature/lava-rapido-mvp`  
**Base:** `piloto-staging-01`  
**HEAD inicial:** `e421970c04d274da0780c16c2955d56bf3b86b57`

## Arquitetura

- Vertical `car_wash` em `tenant_settings.settings` (Zod + helper).
- Tabelas aditivas: `customer_vehicles`, `car_wash_jobs`, `car_wash_checklists` (migration `105_car_wash_mvp.sql`).
- RLS + FORCE RLS + policy `tenant_id = app_tenant_id()`.
- `appointments.status` inalterado; operação física em `car_wash_jobs.stage`.
- Criação appointment + job na mesma transação `withTenant`.
- Outbox idempotente (`car_wash_ready:{jobId}`, confirmação/lembrete com veículo).
- `correlation_id` propagado em auditoria e outbox.

## Módulos API

| Módulo | Responsabilidade |
|--------|------------------|
| `vertical/` | Parse settings, labels |
| `vehicles/` | CRUD, placa, auditoria |
| `carWash/` | Board, FSM, checklist, entrega → financeiro |

## Web

- Hook `useTenantVertical`, menu condicional, labels Box/equipe.
- `/veiculos`, `/operacao/lava-rapido`, aba veículos no cliente.
- Modal agendamento com passo veículo (car_wash).

## Testes locais

- API: `plate.test`, `stages.test`, `schemas.test`, `vehicles.integration` (com `DATABASE_URL`).
- Web: `labels.test`, `newAppointmentSteps.test`.
- `npm run typecheck` e `npm run build` OK em API e Web.

## Pendências

- Prints L01–L14: **PEND** (ambiente local sem tenant car_wash configurado + sem sessão browser nesta entrega).
- CI PR: **PEND** até push e workflow GitHub.
- E2E WhatsApp real: **BLOCKED** sem Evolution/n8n ativos neste workspace.
