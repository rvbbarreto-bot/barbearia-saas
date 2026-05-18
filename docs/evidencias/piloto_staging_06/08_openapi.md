# OpenAPI — rotas novas/alteradas PS-06

## Management (manager+)

- `GET /api/v1/management/dashboard`
- `GET /api/v1/management/dashboard/export.csv`

## Cliente 360 (attendant+)

- `GET /api/v1/customers/{customerId}/overview`

## Portal tokenizado

- `POST /api/v1/appointments/{appointmentId}/portal-token` (manager+)
- `GET /api/v1/public/portal/appointments/{token}` (público)
- `POST /api/v1/public/portal/appointments/{token}/confirm` (público)
- `POST /api/v1/public/portal/appointments/{token}/cancel` (público)

## Financeiro

- `GET /api/v1/finance/appointments/export.csv`

## Waitlist

- `GET /api/v1/waitlist/{entryId}/suggest-slot`

## Lava Rápido (ver também PR #10 / OpenAPI spec)

- Vehicles CRUD, car-wash jobs, vertical settings, `vehicle_id` em appointments.

Documentação interativa: `/docs` (ambiente com API a correr).
