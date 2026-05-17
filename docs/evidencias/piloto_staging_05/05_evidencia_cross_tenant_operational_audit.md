# Evidência cross-tenant — Auditoria operacional (Bloco 2)

**Teste automatizado:** `apps/api/src/modules/audit/operational-audit.isolation.integration.test.ts`

**Comportamento verificado:**

- `listOperationalAuditEvents(tenantA)` não inclui `PILOTO05_OP_AUDIT_B` do tenant B.
- Filtro `correlation_id` de tenant B em tenant A → **0 linhas**.

**Execução local (com `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`):**

```bash
cd apps/api
npm test -- src/modules/audit/operational-audit.isolation.integration.test.ts
```

**Execução CI:** job API integration na branch do PR Bloco 2.

**Status PO:** OK (automação) · complementar com evidência manual se exigido.
