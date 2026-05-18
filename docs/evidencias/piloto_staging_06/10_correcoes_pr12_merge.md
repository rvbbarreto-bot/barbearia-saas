# PILOTO-STAGING-06 — Correções obrigatórias PR #12 (merge)

## Resumo executivo

| Item | Status |
|------|--------|
| 1.1 Portal tokenizado → serviços oficiais | Corrigido |
| 1.2 Idempotência `vehicle_id` (car_wash) | Corrigido |
| 1.3 Placa obrigatória MVP | Corrigido |
| CI verde | Aguardar run pós-push deste pacote |
| Base PR | `piloto-staging-01` |
| Merge em `main` | Não (governança piloto) |

## SHA final

`a9a4e65921b87cab04cc55268b8f323fed2ce037`

## Link PR

https://github.com/rvbbarreto-bot/barbearia-saas/pull/12

---

## 1.1 Portal tokenizado

### Causa raiz

`mutateByToken` fazia `UPDATE appointments` direto, sem `confirmAppointmentInDb` / `cancelAppointmentInDb`. Efeitos colaterais ausentes: `appointment_events`, `appointment_status_history` (trigger), `notification_jobs`, waitlist no cancel, auditoria operacional.

Status de UI usavam `pending_confirmation` (inexistente no domínio); o correto é `awaiting_confirmation` / `awaiting_payment`.

Lookup de token via pool da app sem `app.tenant_id` falhava sob RLS em `appointment_portal_tokens`.

### Correção

- `confirmPortalAppointmentByToken` / `cancelPortalAppointmentByToken` chamam `confirmAppointmentInDb` e `cancelAppointmentInDb` na mesma transação.
- Auditoria complementar `PORTAL_APPOINTMENT_*` após o fluxo oficial.
- `resolveTokenRow` usa `getIntegrationLookupPool()` (CI: `DATABASE_URL_ADMIN`).
- `getPortalAppointmentByToken` usa `withTenant` para leitura.

### Arquivos

- `apps/api/src/modules/portal/service.ts`
- `apps/api/src/modules/portal/portal.integration.test.ts` (novo)

### Testes

- Token válido confirma → `CONFIRMED`, `APPOINTMENT_CONFIRMED`, `PORTAL_APPOINTMENT_CONFIRMED`, status history, `appointment_confirmed` job.
- Token válido cancela → `CANCELLED`, auditoria.
- Token expirado / revogado / inválido.

---

## 1.2 Idempotência `vehicle_id`

### Causa raiz

`samePayload` em `createAppointment` não comparava `vehicle_id`. Em `car_wash`, mesma `idempotency_key` com outro veículo devolvia o agendamento antigo.

### Correção

Após match de payload base, se vertical `car_wash`, compara `vehicle_id` do `car_wash_jobs` com o solicitado; divergência → `DUPLICATE_IDEMPOTENCY_KEY` (409).

### Arquivos

- `apps/api/src/modules/appointments/service.ts`
- `apps/api/src/modules/appointments/appointments.integration.test.ts`
- `apps/api/src/modules/carWash/car-wash.integration.test.ts`

### Testes

- Barbershop: mesma key + mesmo payload → idempotente.
- Car wash: mesma key + mesmo `vehicle_id` → idempotente.
- Car wash: mesma key + `vehicle_id` diferente → 409.

---

## 1.3 Placa obrigatória

### Causa raiz

`plate` opcional no Zod e no INSERT; MVP opera por placa (pátio, busca, deduplicação).

### Correção (preferência PO)

- `createVehicleSchema`: `plate` obrigatório + validação Mercosul/antiga.
- `createVehicle`: `VEHICLE_PLATE_REQUIRED` se normalização falhar.

### Arquivos

- `apps/api/src/modules/vehicles/schemas.ts`
- `apps/api/src/modules/vehicles/service.ts`
- `apps/api/src/modules/vehicles/schemas.test.ts`
- `apps/api/src/modules/vehicles/vehicles.integration.test.ts`

### Testes

- Sem placa / placa inválida → rejeição.
- Placa válida / duplicada no tenant / permitida em outro tenant.

---

## Parecer fábrica (pré-aceite PO/GP)

**Tecnicamente pronto para revalidação de merge** após CI verde no commit deste pacote. **Merge formal** permanece com PO/GP (prints L01–L14 e matriz de aceite podem seguir em paralelo pós-correção crítica).

**Não aprovado para merge em `main`** — fora de escopo.
