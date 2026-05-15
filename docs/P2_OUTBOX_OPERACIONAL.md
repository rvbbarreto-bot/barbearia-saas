# P2 — Outbox operacional

## Estados (semântica)

- **pending** — aguardando envio ou retry após falha transitória; `last_error` quando aplicável.
- **sent** — envio concluído com sucesso pelo provider (nunca marcar sem envio real).
- **dead** — falha final após esgotar política de retry.

## API mínima (P2)

- `GET /api/v1/outbox/messages` — listagem por tenant, filtros por estado, sem expor segredos no payload.

## Opcional

- `POST /api/v1/outbox/messages/:id/retry` — retry manual; se não implementado, documentar política automática apenas.

## Segurança

- Isolamento por tenant; 403 sem permissão; testes cross-tenant obrigatórios.

*(Campos exactos e exemplos de resposta alinhar com OpenAPI na entrega.)*
