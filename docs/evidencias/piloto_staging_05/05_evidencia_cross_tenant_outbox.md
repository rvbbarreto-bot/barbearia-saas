# Evidência cross-tenant — Outbox (Bloco 1)

**Teste automatizado:** `apps/api/src/modules/outbox/outbox.isolation.integration.test.ts`

**Comportamento verificado:**

- `listOutboxMessages(tenantA)` não inclui `message_outbox` de `tenantB`.
- `getOutboxMessageById(tenantA, idDeB)` → **404 NOT_FOUND**.

**Execução local (com `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`):**

```bash
cd apps/api
npm test -- src/modules/outbox/outbox.isolation.integration.test.ts
```

**Resultado esperado:** suite **PASS** (2 testes).

**Status PO:** OK (automação) · complementar com teste manual API se CI exigir log anexado.
