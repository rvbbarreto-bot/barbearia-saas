# QA local — agenda (sem Evolution)

## Pré-requisitos

```powershell
docker compose up -d
npm run db:migrate
```

Credenciais demo: `admin@demo.local` / `admin12345` — tenant `00000000-0000-0000-0000-000000000001`.

## Cenários manuais

1. **Conflito** — criar dois agendamentos no mesmo horário/profissional → segundo retorna erro de horário indisponível.
2. **Bloqueio** — `POST /api/v1/calendar-blocks` (manager) e tentar agendar no intervalo → 409.
3. **Remarcação passado** — `PATCH …/reschedule` com `starts_at` no passado → 422.
4. **Profissional** — login `fred.barbeiro@demo.local` e tentar cancelar agendamento de outro profissional → 403.
5. **Portal** — `http://localhost:3001/agenda` — criar, confirmar, cancelar; verificar mensagens de erro.

## Automatizado

```powershell
cd apps/api
npm run test:unit
# Com DB de teste configurado:
npm run test -- src/modules/appointments/appointments.lifecycle.integration.test.ts
```

Scripts existentes: `scripts/qa-api-p2-operational-battery.ps1`, `scripts/qa-p2-2-web-outbox-whatsapp-battery.ps1`.
