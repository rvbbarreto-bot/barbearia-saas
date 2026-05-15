# P2 — Outbox operacional

## Estados (semântica)

- **pending** — aguardando envio ou retry após falha transitória; `last_error` quando aplicável.
- **sent** — envio concluído com sucesso pelo provider (nunca marcar sem envio real).
- **dead** — falha final após esgotar política de retry.

## API mínima (P2)

- **`GET /api/v1/outbox/messages`** — listagem paginada por tenant (`withTenant` + RLS). RBAC: `outbox.read` (mínimo **`attendant`**). Resposta **sanitizada**: sem `metadata`/`payload` completos, sem `provider_response`; `destination` com telefone mascarado; `payload_summary` com pré-visualização truncada; `idempotency_key`; `appointment_id` derivado de `correlation_id` quando for UUID de agendamento. Filtros: `status`, `provider`, `from`, `to` (ISO-8601), `correlation_id`, `appointment_id`, `destination` (substring em `metadata->>'phone'`). Portal **Operação → Mensagens** (`/operacao/mensagens`).

- **`GET /api/v1/outbox/messages/:id`** — detalhe sanitizado (mesmo formato da linha da listagem).

- **`POST /api/v1/outbox/messages/:id/retry`** — retry manual seguro: apenas `failed` ou `dead` → `pending`; RBAC `outbox.retry` (mínimo **`manager`**); registo em `operational_audit_events` (`OUTBOX_MANUAL_RETRY`). Não duplica envio nem marca `sent` sem o worker/provider.

## Segurança

- Isolamento por tenant; 403 sem permissão; testes cross-tenant obrigatórios.

*(Campos exactos e exemplos de resposta: OpenAPI `/api/v1/outbox/messages`.)*
