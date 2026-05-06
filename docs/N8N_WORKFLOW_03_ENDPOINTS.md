# Workflow 03 — Recall (export JSON remediado)

**Estado:** `active=false`. **Não ativar** no n8n até QA, `RECALL_ENABLED=true` na API e templates aprovados.

## Autenticação

- `Authorization: Bearer <JWT>`
- `x-tenant-id` alinhado ao JWT

## Fluxo versionado

1. **Schedule** (6 h) — apenas quando o workflow for ativado manualmente no futuro.
2. **GET** `/api/v1/recall/candidates?limit=50&offset=0&only_sendable=true`
3. **IF** `RECALL_ENABLED` (variável de ambiente n8n) === `true` (deve espelhar a Core API).
4. **Code** — expande até 30 candidatos em itens.
5. **IF** “Tem candidatos” — compatível com IF v2 do n8n: operador **`notEquals`**, `value1` = `trim({{ $json.source_appointment_id }})`, `value2` vazio (evita `isNotEmpty`, que pode não existir conforme a versão). Semântica: só avança quando existe `source_appointment_id`.
6. **POST** `/api/v1/recall/send` com corpo:

```json
{
  "source_appointment_id": "uuid",
  "customer_id": "uuid",
  "service_id": "uuid",
  "template_key": "opcional"
}
```

## Removido

- Node Postgres / `executeQuery` / `SELECT * FROM`.
- Evolution `message/sendText`.
- URL inexistente `/api/v1/audit/recall-sent`.

## Core API — recall

| Método | Rota | Uso |
|--------|------|-----|
| GET | `/api/v1/recall/candidates` | Candidatos + paginação (`limit`, `offset`, `only_sendable`). |
| POST | `/api/v1/recall/send` | Enfileira recall (403 se `RECALL_ENABLED=false`). |

---

**Entrega DEV/QA. Não representa produção, piloto comercial ou GA.**
