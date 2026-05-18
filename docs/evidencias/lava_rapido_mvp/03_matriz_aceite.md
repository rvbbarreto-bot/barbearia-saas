# Matriz de aceite — Lava Rápido MVP

| ID | Requisito | Status | Evidência |
|----|-----------|--------|-----------|
| E1 | Vertical car_wash por tenant | OK | `vertical/settings.ts`, GET `/tenant-settings/vertical` |
| E2 | CRUD veículos + RLS | PARCIAL | Código + teste integração (requer DB local) |
| E3 | Agendamento com veículo | OK | `appointments/service.ts` |
| E4 | Board pátio | OK | `CarWashBoardPage.tsx` |
| E5 | FSM stages 422 | OK | `carWash/stages.ts` + testes |
| E6 | Checklist Zod | OK | `schemas.ts` + testes |
| E7 | Outbox carro pronto | PARCIAL | `enqueueCarWashReadyNotification` (envio real BLOCKED) |
| E8 | Auditoria eventos | OK | `writeOperationalAuditEvent` |
| E9 | Entrega → completed + financeiro | OK | `syncAppointmentForStage` deliver |
| E10 | Barbearia sem regressão | OK | `vehicle_id` rejeitado; steps sem veículo |
| E11 | Testes unitários | OK | vitest módulos novos |
| E12 | Prints L01–L14 | PEND | Pasta `prints/` vazia — homologação visual |
| E13 | CI PR verde | PEND | Após abertura PR |
| E14 | OpenAPI | PEND | Endpoints documentados no relatório; spec OpenAPI não atualizado neste slice |
