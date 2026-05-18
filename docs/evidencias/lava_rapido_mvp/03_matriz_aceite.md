# Matriz de aceite — Lava Rápido MVP

**PR:** [#10](https://github.com/rvbbarreto-bot/barbearia-saas/pull/10)  
**Branch:** `feature/lava-rapido-mvp` → `piloto-staging-01`  
**SHA referência:** `b3da14c` (+ commits pendentes de push com correções PO)  
**Merge:** **NÃO autorizado** até aceite formal PO/GP

Legenda: **OK** | **PARCIAL** | **PEND** | **BLOCKED** | **N/A**

| ID | Requisito | Status | Evidência |
|----|-----------|--------|-----------|
| G1 | PR contra `piloto-staging-01` (não `main`) | **OK** | PR #10 |
| G2 | CI verde (API + Web + Security) | **OK** | Checks PR #10 em `b3da14c` |
| G3 | Sem conflitos com base | **OK** | GitHub mergeable |
| E1 | Vertical `car_wash` por tenant | **OK** | `vertical/settings.ts`, GET `/tenant-settings/vertical` |
| E2 | CRUD veículos + RLS | **OK** | migration 105, `vehicles/*`, `vehicles.integration.test.ts` |
| E3 | Agendamento com `vehicle_id` + job transação | **OK** | `appointments/service.ts`, `car-wash.integration.test.ts` |
| E4 | Board pátio `/operacao/lava-rapido` | **PARCIAL** | `CarWashBoardPage.tsx` — falta print L07 |
| E5 | FSM stages (422 inválido) | **OK** | `stages.ts`, `stages.test.ts`, integração |
| E6 | Checklist campos mínimos obrigatórios | **OK** | `checklistItemsSchema` + UI `ChecklistModal` |
| E7 | Chegada bloqueada se `awaiting_confirmation` | **OK** | `APPOINTMENT_NOT_CONFIRMED`, teste integração |
| E8 | Cancel job cancela appointment | **OK** | `cancelAppointmentInDb` + teste integração |
| E9 | Outbox carro pronto (idempotente) | **PARCIAL** | código `enqueueCarWashReadyNotification` — envio real **BLOCKED** |
| E10 | Auditoria eventos lava-rápido | **OK** | `writeOperationalAuditEvent` nos fluxos |
| E11 | Entrega → completed + financeiro/comissão | **PARCIAL** | `syncAppointmentForStage` deliver — E2E financeiro **PEND** em CI |
| E12 | Barbearia sem regressão | **OK** | `VEHICLE_NOT_ALLOWED`, modal 4 passos, testes steps |
| E13 | OpenAPI rotas novas | **OK** | `apps/api/src/openapi/spec.ts` |
| E14 | Testes integração fluxos críticos | **OK** | `car-wash.integration.test.ts` (CI com DATABASE_URL) |
| E15 | Prints L01–L13 | **PEND** | Homologação visual — ver `prints/README.txt` |
| E16 | Print L14 CI verde | **OK** | Screenshot PR checks / link Actions |
| E17 | WhatsApp/Evolution E2E real | **BLOCKED** | Ambiente Evolution/n8n não disponível neste pipeline |
| E18 | BDD `04_roteiro_qa_bdd.md` | **OK** | Arquivo atualizado |
| E19 | Bloco 3 Dashboard | **N/A** | Fora de escopo |
| E20 | Oficina mecânica | **N/A** | Fora de escopo |

## Resumo

| Status | Qtd |
|--------|-----|
| OK | 15 |
| PARCIAL | 3 |
| PEND | 1 |
| BLOCKED | 1 |
| N/A | 2 |

## Bloqueios por ambiente externo

1. **WhatsApp real (E17):** requer Evolution API + n8n ativos e opt-in do cliente piloto.
2. **Prints L01–L13 (E15):** requer stack local com tenant `car_wash` configurado e credenciais manager.
