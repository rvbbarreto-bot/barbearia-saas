# API de catálogo operacional (`/api/v1`)

Todos os endpoints exigem JWT + tenant coerentes com o token.

## Serviços

### `GET /services`

Lista o catálogo. Por padrão **somente serviços com `active = true`** (WhatsApp/painel operacional).

- Query: paginação padrão do projeto (`limit`, `offset`, `page`).
- **`active=false`**: permitido apenas para perfis **`manager` ou superiores** (`tenant_admin`, `tenant_owner`, `platform_admin`). Demais papéis recebem `400 OPERATIONAL_CATALOG_ONLY`.

Campos típicos de cada item: `id`, `name`, `duration_minutes`, `price_cents`, `active`, `category_id`, `category_name`, `buffer_before_minutes`, `buffer_after_minutes`.

### `GET /services/:serviceId`

Detalhe. Perfil **`viewer`/operador não vê serviços inativos** (resposta `404 SERVICE_NOT_FOUND`); gestores conseguem.

### `POST /services` *(manager+)*

```json
{
  "name": "Corte + barba",
  "duration_minutes": 45,
  "price_cents": 5000,
  "active": true,
  "category_id": "<uuid opcional|null>",
  "buffer_before_minutes": 10,
  "buffer_after_minutes": 15
}
```

### `PATCH /services/:id` *(manager+)*

Mesmos campos do POST, todos opcionais (parcial).

## Profissionais

### `GET /professionals` / `GET /professionals/:id`

Já incluem agregação `service_ids[]` dos vínculos.

### `POST /professionals` / `PATCH /professionals/:id` *(manager+)*

Body pode incluir `service_ids`; **somente serviços ativos** no tenant são aceitos (`422 INVALID_SERVICE_IDS` se houver inativo/inexistente).

### `PATCH /professionals/:professionalId/services` *(manager+)*

Substitui o conjunto inteiro:

```json
{ "service_ids": ["uuid", "uuid"] }
```

### `POST /professionals/:professionalId/services` *(manager+)*

Adiciona vínculos (ON CONFLICT nada faz). Body:

```json
{ "service_ids": ["uuid", "uuid"] }
```

Rejeita IDs inexistentes ou inativos.

## Agendamentos e disponibilidade

- `POST /appointments`: **`service_id` obrigatório**; `starts_at` + `ends_at` devem fechar uma janela de exatamente `duration_minutes` do cadastro (**tolerância ±1 min**).
- `price_cents` opcional — se enviado, deve ser **igual** a `services.price_cents`.
- **`GET /availability`**: apenas serviço **ativo** + vínculo `professional_services`; caso contrário `SERVICE_NOT_BOOKABLE` (404). Duração e **buffers** entram na geração de slots e nos bloqueios por agendamentos existentes.

## Códigos de erro relevantes

| Código | HTTP | Situação |
|--------|------|----------|
| `OPERATIONAL_CATALOG_ONLY` | 400 | `active=false` sem perfil gerencial |
| `SERVICE_NOT_FOUND` | 404 | ID inexistente ou inativo ocultado para viewer |
| `SERVICE_NOT_BOOKABLE` | 404 | Sem vínculo ou serviço inexistente neste vínculo profissional/serviço |
| `SERVICE_NOT_BOOKABLE` | 422 | Serviço inativo não pode ser agendado neste vínculo |
| `INVALID_SERVICE_IDS` | 422 | Novo vínculo com serviço inexistente/inativo |
| `SCHEDULE_DURATION_MISMATCH` | 422 | Intervalo diferente da duração cadastrada |
| `SERVICE_PRICE_MISMATCH` | 422 | Preço declarado diferente do catálogo |
| `SERVICE_REQUIRED` | 422 | Remarcação sem `service_id` no agendamento legado |

Migration de buffers: `database/migrations/010_service_buffers.sql`.
