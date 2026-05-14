# Decisão de produto — `explicit_confirmation: false` (CT-073)

## Contexto

No `POST /api/v1/appointments`, o campo booleano `explicit_confirmation` controla se o agendamento permanece em fluxo de confirmação explícita (`awaiting_confirmation`) ou se pode ser confirmado na mesma transação quando a operação é **administrativa** (sem confirmação explícita do cliente pelo canal).

A bateria negativa **CT-073** observou **HTTP 201** com `explicit_confirmation: false` e token de `tenant_owner`.

## Decisão registada (P1 — 2026-05-14)

- **Opção A (com refinamento P1):** `explicit_confirmation: false` representa **criação administrativa** ou **walk-in** operado por balcão; **não** equivale à confirmação explícita do cliente (WhatsApp, link, etc.).
- **RBAC:** `false` permitido para `tenant_admin` ou superior em qualquer `source` válido exceto regra de `professional`; `walk_in` com `attendant` ou superior (exceto `professional`). **Attendant** ou **manager** com `source: manual` e `false` → **403** (CT-073-B).
- **Rastreabilidade:** evento `CREATED` inclui `administrative_skip_client_explicit_confirm: true` quando `false`.

**Decisão registada:** **A + refinamento RBAC (P1)**

**Data / assinatura PO:** _registo técnico fábrica; validação PO pendente se aplicável_

## Referências

- OpenAPI: `POST /api/v1/appointments` em `apps/api/src/openapi/spec.ts`
- Código: `createAppointment` em `apps/api/src/modules/appointments/service.ts`
