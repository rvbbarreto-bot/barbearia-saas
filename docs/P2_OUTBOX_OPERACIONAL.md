# P2 — Outbox operacional

## Estados (semântica)

- **pending** — aguardando envio ou retry após falha transitória; `last_error` quando aplicável.
- **sent** — envio concluído com sucesso pelo provider (nunca marcar sem envio real).
- **dead** — falha final após esgotar política de retry.

## API mínima (P2)

- **`GET /api/v1/outbox/messages`** — listagem paginada por tenant (`withTenant` + RLS). RBAC: recurso `outbox`, acção `read` (mínimo **`manager`**). Resposta **sanitizada**: sem `metadata`/`payload` completos, sem `provider_response`; `destination` com telefone mascarado; `payload_summary` com pré-visualização truncada. Filtros: `status`, `provider`, `from`, `to` (ISO-8601), `correlation_id`, `appointment_id` (equivale a filtro por `correlation_id`), `destination` (substring em `metadata->>'phone'`). Ver OpenAPI tag `outbox` e portal **Operação → Mensagens** (`/operacao/mensagens`).

## Opcional

- `POST /api/v1/outbox/messages/:id/retry` — retry manual; se não implementado, documentar política automática apenas.

## Segurança

- Isolamento por tenant; 403 sem permissão; testes cross-tenant obrigatórios.

*(Campos exactos e exemplos de resposta: OpenAPI `/api/v1/outbox/messages`.)*
