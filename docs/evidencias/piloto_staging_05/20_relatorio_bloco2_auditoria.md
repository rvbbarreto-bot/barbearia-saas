# Relatório Bloco 2 — Auditoria e correlation_id (PILOTO-05)

**Branch:** `feature/piloto-staging-05-operacao-gestao-automacao`  
**Base:** `piloto-staging-01` @ `156cdab` (pós-merge PR #7 + evidência merge)  
**Escopo:** fatia dedicada — sem alterações retroativas ao Bloco 1 mergeado.

## Entregas

| Área | Entrega |
|------|---------|
| API | `x-correlation-id` propagado em mutações de agenda; fallback `appointment_id` / `message_outbox.id` em auditoria |
| API | Filtro `actor_user_id` em `GET /operational-audit-events` |
| API | Metadata sanitizada na listagem (`sanitize-operational-audit-metadata.ts`) |
| API | RBAC `operationalAudit.read` → **manager+** |
| API | Testes unitários + integração cross-tenant `operational-audit.isolation.integration.test.ts` |
| Web | Rota read-only `/operacao/auditoria` (manager+) com filtros ação, entidade, utilizador, correlation_id, período |
| Web | Deep-link outbox ↔ auditoria via `correlation_id` query param |
| OpenAPI | Parâmetro `actor_user_id`; descrição RBAC manager+ |

## Testes (comandos)

Ver `04_testes_locais_bloco2.txt`.

## Parecer fábrica

Bloco 2 **pronto para QA/PR** contra `piloto-staging-01` após CI verde. Blocos 3–10 não iniciados.
