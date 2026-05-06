# ADR — Enforcement de `plan_limits` (tenants.plan_limits)

**Estado (DEV/QA-05):** não implementado na Core API. A coluna `plan_limits` (jsonb) existe desde `006_phase2_schema_enhancements.sql` e é exposta na gestão de tenants, mas **não** há middleware nem serviço que devolva `402 PLAN_LIMIT_EXCEEDED` ao exceder profissionais, serviços ou utilizadores.

## Onde aplicar (planeado)

1. **Camada de escrita** nos serviços que criam recursos contáveis:
   - `professionals` (create),
   - `services` (create),
   - `users` (create convite / signup tenant-scoped).
2. **Alternativa complementar:** middleware Fastify após resolução de `tenantId`, antes do handler, lendo limites cacheados por tenant (Redis ou memo in-process com TTL curto).

## Middleware / helper planejado

- `assertPlanLimit(tenantId, resource, currentCount)` — consulta `tenants.plan_limits` e contagens em transação curta com `SET LOCAL app.tenant_id` ou `withTenant`.
- Resposta HTTP: **402** com corpo `{ error: 'PLAN_LIMIT_EXCEEDED', message: '...', resource }`.

## Endpoints impactados (futuro)

- `POST /api/v1/professionals`
- `POST /api/v1/services`
- `POST /api/v1/users` (ou fluxo equivalente de convite)

## Riscos comerciais de não implementar

- Tenant em plano trial pode ultrapassar limites anunciados sem bloqueio técnico.
- Receita e suporte podem assumir controlos que ainda são só contratuais / manuais.

## Próximo passo recomendado

- Definir schema JSON canónico de `plan_limits` (ex.: `{ max_professionals, max_services, max_users, features: { ... } }`).
- Testes de integração por recurso + 402 documentado no OpenAPI.

**Entrega DEV/QA.** Não representa produção, piloto comercial ou GA.
