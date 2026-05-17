# Evidência cross-tenant — Outbox (PILOTO-05 Bloco 1)

## Teste

Ficheiro: `apps/api/src/modules/outbox/outbox.isolation.integration.test.ts`

Cenário: tenant A não vê mensagens do tenant B (list + get por id).

## Onde foi validado

| Ambiente | Status | Notas |
|----------|--------|-------|
| Local sem env Postgres alinhado | **Falhou** (exit 1) | Ver `04_saida_teste_cross_tenant_integration.txt` — não contar como verde |
| CI GitHub Actions (job API com migrations) | **OK** | Run verde [25994652688](https://github.com/rvbbarreto-bot/barbearia-saas/actions/runs/25994652688) — commit `9ce9519`, job API success (typecheck + unit + integração com Postgres/Redis) |

## Comando CI (referência)

No workflow, após migrations:

1. `npm run test:unit` (todos os unitários API)
2. `npm test -- --coverage` (inclui `outbox.isolation.integration.test.ts`)

## Aceite PO

Item cross-tenant **OK** somente quando o run CI do PR P05 mostrar job API **success** incluindo passo «Test — integração».
