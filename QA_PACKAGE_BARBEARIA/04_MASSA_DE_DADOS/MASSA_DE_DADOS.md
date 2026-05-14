# Massa de Dados QA

Fonte dos dados demo:

- Scripts SQL em `database/seeds/` (referência manual / reaplicação).
- **`database/migrations/099_demo_seed_qa.sql`** — aplicado automaticamente no **primeiro boot** do Postgres no Docker (volume vazio), junto às demais migrations em `database/migrations/`.
- **`database/migrations/100_platform_admin_qa_seed.sql`** — utilizador `platform_admin` para QA; corre no primeiro boot **e** em bases já existentes quando se executa **`./migrate.sh`** (ou `docker exec … psql < 100_…sql`).

## Tenant de teste

- `tenant_id` (UUID): `00000000-0000-0000-0000-000000000001`
- Nome fantasia (`trade_name`): `Barão da Navalha`
- Razão social (`legal_name`): `Demo Barbearia Ltda`

### Consulta SQL (schema real — não existe coluna `name` em `tenants`)

```sql
SELECT id, legal_name, trade_name, status, webhook_token
FROM tenants
ORDER BY created_at
LIMIT 10;
```

## Usuarios de teste

- Admin: `admin@demo.local` (role `tenant_owner`)
- **Plataforma (cenário A — lista `GET /api/v1/tenants` / `POST /api/v1/tenants`):** `platform.admin@demo.local` (role `platform_admin`), senha **`admin12345`**. `tenant_id` na base: **NULL**.  
  - **`GET /api/v1/tenants` e `POST /api/v1/tenants` não exigem `x-tenant-id`** (rotas platform-scoped).  
  - **Rotas tenant-scoped** (`/api/v1/services`, `/appointments`, `/tenants/current`, etc.): continuar a enviar **`x-tenant-id`** alinhado ao JWT quando o utilizador tiver `tenant_id` no token; com JWT sem tenant, o header é obrigatório para essas rotas (**401** `TENANT_REQUIRED` se faltar).
- Profissionais:
  - `fred.barbeiro@demo.local`
  - `joao.barbeiro@demo.local`
  - `robson.barbeiro@demo.local`
- Atendente: criar se nao existir (`atendente@demo.local`, role `attendant`)

## Servicos seed

- `Corte masculino` (30 min)
- `Barba` (30 min)
- `Corte + Barba` (60 min)

## Profissionais seed

- `Fred` (`slug=fred`) — UUID fixo `00000000-0000-4000-8000-000000004011`
- `João` (`slug=joao`) — `...4012`
- `Robson` (`slug=robson`) — `...4013`

## Servicos seed (UUID fixo)

- `Corte masculino` (30 min) — `00000000-0000-4000-8000-000000004021`
- `Barba` (30 min) — `...4022`
- `Corte + Barba` (60 min) — `...4023`

## Vinculo profissional-servico

O seed **`099_demo_seed_qa.sql`** cria **todos** os vínculos em `professional_services` (cruzamento profissionais × serviços ativos).  
Bases antigas sem vínculo: aplicar **`101_qa_bookable_mass_backfill.sql`** (`migrate.sh` ou `docker exec … psql`).

`GET /api/v1/professionals` retorna `service_ids` (array JSON) por profissional.

## Clientes de teste (seed)

| Cliente | UUID | Telefone |
|---------|------|----------|
| Cliente QA A | `00000000-0000-4000-8000-000000004031` | `5511999990001` |
| Cliente QA B | `00000000-0000-4000-8000-000000004032` | `5511999990002` |

## Payload QA — POST /api/v1/appointments

```json
{
  "customer_id": "00000000-0000-4000-8000-000000004031",
  "professional_id": "00000000-0000-4000-8000-000000004011",
  "service_id": "00000000-0000-4000-8000-000000004021",
  "starts_at": "2026-05-14T13:00:00.000Z",
  "ends_at": "2026-05-14T13:30:00.000Z",
  "idempotency_key": "qa-appointment-001",
  "explicit_confirmation": true,
  "source": "manual",
  "notes": "QA create"
}
```

**Erro `SERVICE_NOT_BOOKABLE`:** combinação `professional_id` + `service_id` sem linha em `professional_services` — não é bug da API; corrigir seed ou usar IDs do environment Postman (`qa_*`).

## Horarios sugeridos para QA

- Slot base: D+1 13:00-13:30 (UTC convertido para fuso local)
- Slot conflito: repetir mesmo profissional no mesmo intervalo
- Slot remarcacao: D+1 14:00-14:30

## Observacao

Use IDs reais retornados pelos endpoints de listagem para preencher o environment do Postman/Insomnia.
