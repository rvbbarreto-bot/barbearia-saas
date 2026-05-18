# Matriz de aceite — PILOTO-STAGING-06

| ID | Item | Status | Evidência |
|----|------|--------|-----------|
| L01-L14 | Lava Rápido MVP | PEND | Prints requerem stack local + tenant `car_wash` |
| D01 | Dashboard gerencial API/UI | OK | `GET /management/dashboard`, `/gestao/dashboard` |
| D02 | Export CSV dashboard | OK | `GET /management/dashboard/export.csv` |
| C01 | Cliente 360 | OK | `GET /customers/:id/overview`, `/clientes/:id/360` |
| F01 | Financeiro CSV | OK | `GET /finance/appointments/export.csv` |
| F02 | Financeiro filtros período | OK | Já existente + reforço export |
| K01 | Comissão automática conclusão | OK | Já em `appointments/service` |
| K02 | Marcar comissão pago | OK | `PATCH /commission/entries/:id/status` |
| W01 | Waitlist duplicidade | OK | `WAITLIST_DUPLICATE` 409 |
| W02 | Sugerir slot | OK | `GET /waitlist/:id/suggest-slot` |
| P01 | Portal tokenizado | OK | Migration 107 + rotas públicas `/portal/:token` |
| N01 | n8n workflows | OK | `npm run n8n:validate-workflows` |
| RBAC | Negativo manager+ | OK | Testes `management.rbac.test.ts` |
| CI | PR verde | OK | PR [#12](https://github.com/rvbbarreto-bot/barbearia-saas/pull/12) — SHA `8983fa5` |
| Portal gate | confirm/cancel oficial | OK | `portal.integration.test.ts` + `10_correcoes_pr12_merge.md` |
| Idempotência | vehicle_id car_wash | OK | Testes car-wash + appointments |
| Placa | Obrigatória MVP | OK | `vehicles` schema + integração |
| Prints | UI reais | PEND | Pasta `prints/` — captura manual QA |

**Legenda:** OK = implementado com teste; PEND = depende ambiente/QA; BLOCKED = WhatsApp E2E externo.
