## Summary

PILOTO-05 **Bloco 2** — auditoria operacional read-only com `correlation_id`, sanitização de metadata e RBAC manager+.

- API: `x-correlation-id` em mutações de agenda; fallback por entidade; filtro `actor_user_id`; listagem sanitizada; `operationalAudit.read` → manager+
- Web: `/operacao/auditoria` com filtros (ação, entidade, utilizador, correlation, período) e deep-link para Mensagens
- Testes unitários + integração cross-tenant + RTL
- Evidências: `docs/evidencias/piloto_staging_05/` (roteiro QA, prints P11–P18)

**Base:** `piloto-staging-01` @ `156cdab` (pós-merge PR #7 Bloco 1 Outbox)  
**Commit Bloco 2:** `8cb5f29` (+ docs/prints nesta branch)

## Test plan

- [ ] CI 8/8 verde no PR
- [ ] `04_roteiro_qa_bloco2_auditoria.md` — casos B2-01 a B2-15
- [ ] Prints P11–P19 em `docs/evidencias/piloto_staging_05/prints/`
- [ ] **P18:** `/operacao/auditoria` com API indisponível → banner erro (sem «Sem resultados»)
- [ ] API unit: `npm run test:unit -- src/shared/request-correlation.test.ts src/modules/audit/`
- [ ] Web: `npm test -- src/features/auditoria/`
- [ ] Integração: `operational-audit.isolation.integration.test.ts` (CI)
- [ ] Atendente: sem menu; `/operacao/auditoria` → forbidden
- [ ] Sem merge em `main`
