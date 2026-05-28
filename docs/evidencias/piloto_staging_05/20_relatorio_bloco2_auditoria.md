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

## Prints (P11–P18)

Capturas reais Docker `:3001` (rebuild API/Web com Bloco 2). Ver `prints/P11_*.png` … `P18_*.png` e `04_roteiro_qa_bloco2_auditoria.md`.

| Print | Evidência |
|-------|-----------|
| P11 | Listagem manager (310 eventos, colunas + paginação) |
| P12 | Filtro `event_type` = `reminder_enqueued` |
| P13 | Filtro `correlation_id` |
| P14 | Deep-link → `/operacao/mensagens?correlation_id=…` |
| P15 | Tabela com metadata truncada |
| P16 | Empty state «Sem registos» |
| P17 | Atendente → `/forbidden` (sem item no menu) |
| P18 | **Corrigido:** API parada → banner «Sem ligação ao servidor…» em `/operacao/auditoria`; **sem** tabela «Sem resultados» nem empty state |

### Correção P18 (ressalva PO)

- **Problema:** com API indisponível, a UI mostrava «Sem resultados» (DataTable) em vez de erro.
- **Correção:** `OperationalAuditPage` não renderiza tabela nem empty quando `isError`; mensagem via `getApiErrorMessage` (igual Mensagens).
- **Testes:** `OperationalAuditPage.test.tsx` — falha de rede + refetch após sucesso (sem dados obsoletos na UI).

## PR

Abrir contra `piloto-staging-01` apenas — ver `21_pr_body.md` e `04_saida_pr_bloco2_abrir.txt`.

## Merge

**PR #9** mergeado em `piloto-staging-01` @ **`a0f47db`** — ver `22_merge_pr9_piloto_staging_01.md`, CI `04_saida_ci_pos_merge_a0f47db.txt`.

## Parecer fábrica

Bloco 2 **fechado** (merge PO/GP). Blocos 3–10 não iniciados.
