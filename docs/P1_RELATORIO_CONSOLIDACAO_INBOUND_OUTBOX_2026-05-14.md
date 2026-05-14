# Relatório P1 — Consolidação inbound / outbox / tenant / appointments (2026-05-14)

## 1. Resumo executivo

Fase de consolidação pós-QA negativo: formalização de **resolução de tenant (CT-020)**, regra **administrativa** para `explicit_confirmation: false` **(CT-073 / CT-073-B)**, deduplicação **inbound (CT-093)**, idempotência de **enqueue outbound (CT-100)**, simulação de **falha de provider (CT-101)** via `OUTBOX_FORCE_SEND_FAILURE`, testes automatizados e atualização do script QA / OpenAPI / README.

## 2. Branch e commit

- **Branch:** `feature/p1-inbound-outbox-hardening`
- **Commit testado:** `860e1d3` (`feat(p1): hardening tenant resolution, appointment implicit confirm RBAC, outbox idempotency API, inbound QA integration, QA script and docs`)

## 3. Escopo implementado

| Bloco | Entrega |
|--------|---------|
| A.1 Tenant | Middleware: prioridade `x-tenant-id` (trim) → JWT `tenant_id` → `TENANT_REQUIRED`; divergência → `TENANT_MISMATCH`. Testes em `tenant.test.ts`. |
| A.2 CT-073 | `validateImplicitAppointmentConfirmation`: `tenant_admin`+ ou `walk_in`+`attendant`+; `professional` bloqueado com `false`; evento com `administrative_skip_client_explicit_confirm`. Testes `explicit-confirmation-policy.test.ts`. |
| B.1 CT-093 | Já existente: `webhook_events` + `ON CONFLICT`; seed `tenant_integrations` com `instance_name` `demo-qa-inbound` + script QA. |
| C.1 CT-100 | `enqueueOutboundMessage` → `{ inserted }`; API `202` / `200` + `{ ok, duplicate }`; integração HTTP + serviço. |
| D.1 CT-101 | `isOutboxForceSendFailureRuntime()` + teste `outbox.integration` (pending, `last_error`, não `sent`). |
| E | Vitest: tenant, explicit policy, outbox, integrations outbound. |
| F | `scripts/qa-api-negative-battery.ps1` — CT-020, CT-073, CT-073-B, CT-093, CT-100, CT-101; collection complementar em `QA_PACKAGE_BARBEARIA/02_API_ENDPOINTS/QA_NEGATIVOS_RESSALVAS.postman_collection.json`. |
| G | Este relatório + atualizações README, OpenAPI, `DECISAO_PRODUTO_CT073`. |

## 4. Escopo não implementado / débitos

- **Estados outbox:** o schema continua `pending` / `processing` / `sent` / `dead` (não renomeado para `retry_pending` / `failed`); semântica documentada como equivalente operacional (`pending` + `next_retry_at` = retry agendado; `dead` = falha permanente após max tentativas).
- **Reprocessamento manual** de linha outbox via endpoint dedicado: não adicionado; idempotência por `idempotency_key` na API de enqueue cobre CT-100 para o caso de reenvio controlado.

## 5. Política de retry (resumo)

- Ver comentários em `apps/api/src/infra/queues/outbox-worker.ts` (`RETRY_DELAYS_MS`, `max_attempts`, recovery `processing` stuck).
- Falha Evolution HTTP → `pending` com `attempts++` e `next_retry_at`; após max → `dead`.

## 6. Como validar

- **Script QA:** `.\scripts\qa-api-negative-battery.ps1 -BaseUrl http://localhost:3000` (requer stack demo com seed `099` aplicada, incluindo integração WhatsApp demo).
- **Testes API:** na pasta `apps/api`: `npm exec vitest run src/middlewares/tenant.test.ts src/modules/appointments/explicit-confirmation-policy.test.ts`
- **Integração DB:** `DATABASE_URL=... npm exec vitest run src/infra/queues/outbox.integration.test.ts src/modules/integrations/integrations-outbound.integration.test.ts`

## 7. Recomendação da fábrica

**Aprovado com ressalvas** — ressalvas: nomenclatura `dead` vs “failed” desejado por negócio; endpoint explícito de reprocessamento outbox opcional para operações.

## 8. Próximos passos

- Homologar com PO a nomenclatura de status outbox.
- Opcional: endpoint `POST /integrations/outbound/retry` com RBAC `manager`+ e idempotência estrita.
