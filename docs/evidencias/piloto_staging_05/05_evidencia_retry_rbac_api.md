# Evidência retry RBAC — Outbox (Bloco 1)

**Teste automatizado:** `apps/api/src/modules/outbox/outbox.routes.integration.test.ts`

| Cenário | Papel | Endpoint | HTTP |
|---------|-------|----------|------|
| Listar | attendant | `GET /api/v1/outbox/messages` | **200** |
| Listar | viewer | `GET /api/v1/outbox/messages` | **403** |
| Retry | attendant | `POST .../retry` | **403** |
| Retry | manager | `POST .../retry` | **200** |

**Web:**

- `outboxPageModel.test.ts` — `canShowOutboxRetryButton`
- `OutboxMessagesPage.test.tsx` — atendente sem botão retry na listagem
- `nav.test.ts` — `/operacao/mensagens` attendant+, não viewer

**Auditoria:** `retry-message.service.ts` grava `OUTBOX_MANUAL_RETRY` em `operational_audit_events`.

**Status PO:** OK (automação + prints Web P06/P07).
