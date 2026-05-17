## Summary

PILOTO-05 **Bloco 2** — auditoria operacional read-only com `correlation_id`, sanitização de metadata e RBAC manager+.

- API: `x-correlation-id` em mutações de agenda; fallback por entidade; filtro `actor_user_id`; listagem sanitizada; `operationalAudit.read` → manager+
- Web: `/operacao/auditoria` com filtros (ação, entidade, utilizador, correlation, período) e deep-link para Mensagens
- **P18:** erro real com API indisponível — sem tabela obsoleta nem «Sem resultados» (`734fa62`)
- Testes unitários + integração cross-tenant + RTL
- Evidências: `docs/evidencias/piloto_staging_05/` (roteiro QA, prints P11–P19)

**Base:** `piloto-staging-01` @ `156cdab` (pós-merge PR #7 Bloco 1 Outbox)  
**HEAD final da branch:** `8331de5` (referência PO pré-abertura: `c2e4843`)  
**Commit funcional Bloco 2:** `8cb5f29`  
**Commit correção P18:** `734fa62`

## Test plan

- [ ] CI verde no PR
- [ ] `04_roteiro_qa_bloco2_auditoria.md` — casos B2-01 a B2-15
- [ ] Prints P11–P19 em `docs/evidencias/piloto_staging_05/prints/`
- [ ] **P18:** `/operacao/auditoria` com API indisponível → banner erro (sem «Sem resultados») — print `P18_estado_erro_auditoria.png`
- [ ] API unit: `npm run test:unit -- src/shared/request-correlation.test.ts src/modules/audit/`
- [ ] Web: `npm test -- src/features/auditoria/`
- [ ] Integração: `operational-audit.isolation.integration.test.ts` (CI)
- [ ] Atendente: sem menu; `/operacao/auditoria` → forbidden
- [ ] Sem merge em `main`; merge só após aceite formal PO/GP em `piloto-staging-01`
