# P2 — Ciclo de vida do appointment

## Status mínimos (alvo)

| Status | Descrição resumida |
| ------ | ------------------- |
| `pending` | Criado; aguarda confirmação operacional ou cliente conforme fluxo |
| `confirmed` | Confirmado para execução |
| `cancelled` | Cancelado (motivo opcional) |
| `completed` | Serviço realizado |
| `no_show` | Cliente não compareceu (marcação manual no portal) |

## Transições (regras de produto)

- **completed** e **no_show** não devem ser remarcados sem fluxo administrativo explícito.
- **cancelled**, **completed**, **no_show** não regressam a **pending** sem regra explícita.
- Cancelamento em estado final indevido deve ser rejeitado com erro de negócio (não 500).

## Status alvo (produto) vs modelo actual (DB)

| Produto (P2) | Valor típico na base (`appointment_status`) |
|--------------|-----------------------------------------------|
| pending (aguarda confirmação) | `awaiting_confirmation`, `awaiting_payment`, `offered`, `hold` |
| confirmed | `confirmed` |
| cancelled | `cancelled` |
| completed | `completed` |
| no_show | `no_show` |

*(Estados intermédios operacionais, ex.: `checked_in`, `in_service`, mantêm-se para fluxo de cadeira.)*

## Endpoints alvo (API)

Ver especificação P2: `GET/POST /api/v1/appointments`, `PATCH …/cancel|reschedule|complete|no-show`. Listagem: `GET /api/v1/appointments` com `from`/`to` (ISO) e/ou `on_date=YYYY-MM-DD` (dia civil no fuso do tenant).

## Quem pode fazer o quê (RBAC actual — `permissionPolicy`)

| Recurso | Acção | Papel mínimo |
| ------- | ----- | ------------ |
| `appointments` | read | `viewer` |
| `appointments` | create, confirm, cancel, reschedule, checkIn, start, walkIn | `attendant` |
| `appointments` | noShow | `attendant`+ **exceto** `professional` |
| `appointments` | complete | `professional` |
| `appointments` | manualOverride | `manager` |
| `agendaTimeBlocks` | read | `viewer` |
| `agendaTimeBlocks` | manage | `attendant` |
| `availability` | read | `viewer` |

`tenant_owner` / `tenant_admin` herdam níveis ≥ `attendant` e podem operar conforme a matriz acima. **`professional`**: pode `complete` na cadeira; **não** pode `noShow` nem `create` genérico com `explicit_confirmation=false` (ver política CT-073).
