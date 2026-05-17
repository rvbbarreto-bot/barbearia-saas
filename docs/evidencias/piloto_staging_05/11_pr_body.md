## Summary
- Bloco 1 Outbox: `error_class`, filtro `customer_id`, OpenAPI, UI filtros, detalhe sanitizado, retry RBAC
- Testes API unit (13) + Web (14); integração cross-tenant no CI
- Evidências: `docs/evidencias/piloto_staging_05/` (prints P01–P10)
- Blocos 2–10 **fora** deste PR

## Base / governança
- Base: `piloto-staging-01` (não `main`)
- PR #6 (P04) ainda aberto — rebase P05 após merge #6 se base avançar

## Test plan
- [x] CI verde branch (run 25994652688 @ 9ce9519)
- [x] Prints P01–P10
- [x] Relatório testes `04_testes_locais_bloco1.txt`
- [ ] Confirmar checks verdes na página deste PR após abertura
