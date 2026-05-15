# P2 — Outbox operacional

## Estados (semântica)

- **pending** — aguardando envio ou retry após falha transitória; `last_error` quando aplicável.
- **sent** — envio concluído com sucesso pelo provider (nunca marcar sem envio real).
- **dead** — falha final após esgotar política de retry.

## API mínima (P2)

- **`GET /api/v1/outbox/messages`** — listagem paginada por tenant (`withTenant` + RLS). RBAC: `outbox.read` (mínimo **`attendant`**). Resposta **sanitizada**: sem `metadata`/`payload` completos, sem `provider_response`; `destination` com telefone mascarado; `payload_summary` com pré-visualização truncada; `idempotency_key`; `appointment_id` derivado de `correlation_id` quando for UUID de agendamento. Filtros: `status`, `provider`, `from`, `to` (ISO-8601), `correlation_id`, `appointment_id`, `destination` (substring em `metadata->>'phone'`). Portal **Operação → Mensagens** (`/operacao/mensagens`).

- **`GET /api/v1/outbox/messages/:id`** — detalhe sanitizado (mesmo formato da linha da listagem).

- **`POST /api/v1/outbox/messages/:id/retry`** — retry manual seguro: apenas `failed` ou `dead` → `pending`; RBAC `outbox.retry` (mínimo **`manager`**); registo em `operational_audit_events` (`OUTBOX_MANUAL_RETRY`). Não duplica envio nem marca `sent` sem o worker/provider.

## Lembretes (P2.3)

- **`reminder_24h`** — ao confirmar agendamento com início a mais de 24h, o worker agenda job com `run_at ≈ starts_at − 24h` (UTC). Ao processar, gera corpo em PT-BR e enfileira WhatsApp com **`idempotency_key = reminder_24h:<appointment_id>`** para idempotência; auditoria `reminder_enqueued` ou `reminder_skipped_duplicate` se já existia envio para a mesma chave.

## Auditoria operacional (lista de eventos)

- **`GET /api/v1/operational-audit-events`** e alias **`GET /api/v1/operational-audit/events`** — lista paginada `operational_audit_events` do tenant (RLS). RBAC: **`operationalAudit.read`** (mín. **`attendant`**). Filtros: `event_type`, `entity_type`, `entity_id`, `from` / `to` ou `date_from` / `date_to` (ISO), `correlation_id`, `request_id`, `page`, `limit`. Metadata é escrita **sem segredos** à origem (`writeOperationalAuditEvent`); `audit_logs` administrativos continuam restritos a `tenant_admin` em `/api/v1/audit-logs`.

## Segurança

- Isolamento por tenant; 403 sem permissão; testes cross-tenant obrigatórios.

*(Campos exactos e exemplos de resposta: OpenAPI `/api/v1/outbox/messages`.)*
