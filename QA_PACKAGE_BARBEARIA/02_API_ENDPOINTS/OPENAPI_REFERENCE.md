# OpenAPI / Swagger - Referencia

Fontes oficiais no repositorio:

- Especificacao registrada: `apps/api/src/openapi/spec.ts`
- Registro no servidor: `apps/api/src/openapi/register-openapi.ts`

Se a API estiver em execucao com docs habilitados, validar:

- `GET /docs`
- `GET /documentation`

Observacao: este pacote inclui collection Postman para QA rapido, independente do renderer de Swagger.

## Tenants e agendamentos (regra oficial QA)

- **`GET /api/v1/tenants`** (e **`POST /api/v1/tenants`**): apenas **`platform_admin`** → **200**; **`tenant_owner`** → **403**. **Não exigem** cabeçalho **`x-tenant-id`** (platform-scoped).
- **Utilizador de plataforma no seed QA:** `platform.admin@demo.local` / `admin12345` — login **sem** `tenant_id` no corpo; JWT com `tenant_id` null.
- **`GET /api/v1/tenants/current`**: tenant do contexto (**`tenant_admin`** ou acima, incl. **`tenant_owner`**).
- **`GET /api/v1/tenants/{tenantId}`** com UUID **diferente** do tenant do JWT: **`tenant_owner`** → **403**; **`platform_admin`** pode consultar qualquer UUID existente.
- **`GET /api/v1/appointments`**: query **`from`** e **`to`** em **date-time ISO** (ex.: `2026-05-09T00:00:00.000Z`).
- **`GET /api/v1/appointments/{id}`**, **`PATCH .../confirm|reschedule|cancel`**: ver paths em `spec.ts` e pasta Postman **Appointments**.
