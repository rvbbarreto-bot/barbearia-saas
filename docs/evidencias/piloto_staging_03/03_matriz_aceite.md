# Matriz de aceite — PILOTO-STAGING-03

**Legenda:** OK | PEND | N/A

| # | Critério | Status |
|---|----------|--------|
| 1 | Branch criada a partir de `piloto-staging-01` apenas | OK (kickoff `f1955e0…`); PR a abrir só para `piloto-staging-01` |
| 2 | PR aberto **só** para `piloto-staging-01` (nunca `main` para esta entrega) | PEND |
| 3 | CI verde no PR (API, Web, Security npm audit, Gitleaks) | PEND |
| 4 | Workflows n8n obrigatórios importáveis, testados, `active:false` nos exports | PEND |
| 5 | Sem secret no Git; sem `.env` real; JSONs sem API keys hardcoded | PEND |
| 6 | Painel operacional Web real (status + filtros + fluxo + estados UI) | PEND |
| 7 | Agenda avançada sem regressão (lista PO completa) | PEND |
| 8 | Outbox: filtros, detalhe sanitizado, retry manager+, attendant 403, erros classificados | PEND |
| 9 | Payload Evolution `{ number, text }` mantido | PEND |
| 10 | Cross-tenant e professional scope comprovados (testes + evidência) | PEND |
| 11 | Auditoria: correlation_id, request_id, consulta, não vazamento | PEND |
| 12 | `node scripts/n8n-validate-workflow-import.mjs` + audit PS1 + evidências smoke/erros | PEND |
| 13 | Evidências `piloto_staging_03/` completas (prints/logs/CI) | PEND |
| 14 | Incidente PR #2/main documentado (`00_…`) | OK |
| 15 | Nenhum merge em `main` desta entrega | PEND |
