# Relatório técnico — Lava Rápido MVP

**PR:** [#10](https://github.com/rvbbarreto-bot/barbearia-saas/pull/10)  
**Branch:** `feature/lava-rapido-mvp`  
**Base:** `piloto-staging-01`  
**HEAD inicial:** `e421970c04d274da0780c16c2955d56bf3b86b57`  
**HEAD CI validado PO:** `b3da14c`  
**Merge:** bloqueado até aceite PO/GP

## Correções pós-validação PO (esta entrega)

1. **OpenAPI** — rotas `/vehicles`, `/car-wash/*`, `/tenant-settings/vertical`; `vehicle_id` em POST appointments.
2. **Chegada** — `PATCH …/arrive` retorna `422 APPOINTMENT_NOT_CONFIRMED` se appointment em `awaiting_confirmation` (ou outro status não confirmado).
3. **Cancelamento** — `PATCH …/cancel` chama `cancelAppointmentInDb` (cancela appointment, libera slot via waitlist quando aplicável).
4. **Checklist** — Zod exige `body_scratches`, `fuel_level`, `wheel_damage`, `interior_objects`.
5. **Testes** — `car-wash.integration.test.ts` (job+appointment, arrive bloqueado, cancel, FSM inválida).

## Arquitetura (inalterada)

- Vertical aditiva; `appointments.status` preservado; `car_wash_jobs.stage` para pátio.
- Migration `105_car_wash_mvp.sql` com RLS FORCE.
- Transação appointment + job; outbox idempotente; `correlation_id` em auditoria.

## Endpoints

Ver OpenAPI `apps/api/src/openapi/spec.ts` e PR #10.

## Pendências residuais

- Prints L01–L13 (homologação visual local).
- Smoke WhatsApp real (Evolution).
- E2E financeiro/comissão em ambiente com migration 021 ativa.
