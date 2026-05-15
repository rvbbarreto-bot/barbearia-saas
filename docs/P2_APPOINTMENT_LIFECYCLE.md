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

## Endpoints alvo (API)

Ver especificação P2: `GET/POST /api/v1/appointments`, `PATCH .../cancel|reschedule|complete|no-show`.

## Quem pode fazer o quê

Detalhar por papel (`tenant_owner`, `tenant_admin`, `attendant`, `professional`) no fecho da P2, alinhado com RBAC e auditoria.

*(Mapeamento exacto para o schema actual da base será documentado após análise das migrations existentes.)*
