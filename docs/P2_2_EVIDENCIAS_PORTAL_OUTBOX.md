# P2.2.1 — Evidências portal / outbox

## O que registar (PO)

- Branch e `git rev-parse HEAD` após merge.
- `docker compose ps` (serviços healthy).
- `curl.exe` em `/health` e `/database/health`.
- `npm run db:migrate:dry-run` (nota: volume initdb sem `_migrations` → listar pendentes; não migrar às cegas).
- `npm run test:unit` na API; `npm run typecheck` e `npm run test` no Web.
- Execução de `.\scripts\qa-p2-2-web-outbox-whatsapp-battery.ps1` (exit 0) e CSV `docs/QA_API_P2_2_OPERATIONAL_RESULTS.csv`.
- Capturas: **Agenda operacional** (vista dia/semana, bloqueio), **Mensagens / Outbox** (lista + detalhe + retry gestor), toast de erro amigável (`getApiErrorMessage`).

## Funcional entregue (resumo)

- API: `GET /api/v1/outbox/messages`, `GET /api/v1/outbox/messages/:id`, `POST .../retry` (failed/dead apenas).
- RBAC: leitura `attendant+`; retry `manager+`.
- Portal: `/operacao/mensagens`, agenda com vista semanal e bloqueios para `attendant+` alinhado à API.

*(Preencher datas e anexos de captura na revisão final PO/QA.)*
