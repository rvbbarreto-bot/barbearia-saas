# Matriz de testes automatizados — Barbearia SaaS API

Baseline oficial continua o PDF V4 em `docs/` do monorepo; esta matriz descreve cobertura **no repositório atual** e lacunas.

**Legenda:** ✅ implementado (Vitest) · ⚠️ parcial · 🔲 planejado / manual · **Int** = requer `DATABASE_URL` (+ env completo)

---

## 1. Unitários — disponibilidade, conflito, duração, buffer, sinal, no-show

| Caso | Status | Onde |
|------|--------|------|
| Sobreposição intervalos (`hasOverlap`) | ✅ | `src/modules/availability/slots.test.ts` |
| Buffer expande pegada e remove slots | ✅ | `src/modules/availability/slots.test.ts` |
| Disponibilidade TZ + janelas + folgas (mock DB) | ✅ | `src/modules/availability/service.test.ts` |
| Duração nominal vs `ends_at` | ✅ | `src/modules/catalog/booking-rules.test.ts` |
| Preço declarado vs catálogo | ✅ | `src/modules/catalog/booking-rules.test.ts` |
| Serviço não agendável / buffers carregados | ✅ | `src/modules/catalog/booking-rules.test.ts` |
| Política sinal / só humano (`customer_restrictions`) | ✅ | `src/modules/appointments/customer-restrictions.assert.test.ts` |
| Recálculo restrições pós no-show | 🔲 | Exige mock `tenant_settings` + queries — integração preferível |
| Lateness / `no_show_pending` operacional | ⚠️ | Política em `lateness.service.ts`; testes pontuais indiretos |

---

## 2. Integração API / DB

| Caso | Status | Onde |
|------|--------|------|
| Schema fase 4 / enum / histórico | **Int** | `src/infra/db/phase4.integration.test.ts` |
| Auth / JWT / refresh | **Int** | `src/modules/auth/*.integration.test.ts` |
| Rate limit login | **Int** | `src/modules/auth/auth-rate-limit.integration.test.ts` |
| Outbox fila | ✅ unit | `src/infra/queues/outbox.service.test.ts` |
| Outbox + DB | **Int** | `src/infra/queues/outbox.integration.test.ts` |
| WhatsApp inbound segurança + persistência | **Int** | `src/modules/whatsapp/inbound.integration.test.ts` |
| Business hours / profissional time-off rotas | **Int** | `src/modules/businessHours/`, `professionalTimeOff/` |
| Financeiro piloto | **Int** | `src/modules/finance/finance.service.integration.test.ts` |
| Comissão / fechamento | **Int** | `src/modules/commission/commission.service.integration.test.ts` |
| Holds schema | ✅ | `src/modules/appointments/appointment-holds.schema.test.ts` |
| Lock concorrência agendamento | ✅ | `src/modules/appointments/lock.test.ts` |
| Notification jobs (keywords, consent, schedule) | ✅ | `src/modules/notificationJobs/*.test.ts` |

---

## 3. n8n / orquestração externa

| Caso | Status | Nota |
|------|--------|------|
| Payload válido/in válido (contrato JSON) | ⚠️ | API não acopla n8n no repo; validar contratos nos schemas dos webhooks expostos |
| Assinatura inválida | ✅ | `shared/webhook-hmac.test.ts`; WhatsApp **Int** `inbound.integration.test.ts` |
| Erro da API | 🔲 | Testes E2E contra instância ou mocks HTTP |
| Erro Evolution | 🔲 | Simular resposta 5xx Evolution — fora do escopo atual |

**Mitigação:** schemas extraídos (`inbound.schemas.ts`, `pix-webhook.schemas.ts`) para validação de payload sem subir servidor.

---

## 4. IA (interpretação de mensagem)

| Caso | Status | Nota |
|------|--------|------|
| JSON válido da ferramenta | 🔲 | Depende do provedor/prompt — não há motor IA neste pacote |
| Intenção errada | 🔲 | Testes de classificação fora do repo |
| Alucinação horário | 🔲 | Requer fixtures + modelo ou stub |
| Mensagem ambígua | 🔲 | Idem |
| Opt-out inbound | ⚠️ | Lógica em `notificationJobs/inboundOptOut`; parcialmente coberta por fluxo inbound **Int** |
| Handoff humano | 🔲 | `conversation_states` — assertion E2E |

---

## 5. E2E — WhatsApp → IA → disponibilidade → agenda → outbox → confirmação

| Caso | Status | Nota |
|------|--------|------|
| Pipeline completo | 🔲 | Requer Playwright/curl encadeado + Evolution sandbox + worker outbox |

---

## 6. Concorrência

| Caso | Status | Onde |
|------|--------|------|
| Dois clientes mesmo slot | ⚠️ | `lock.test.ts` + GiST **Int** phase4; cenário HTTP duplo 🔲 |
| Hold expirado | 🔲 | Integração `appointment_holds` + worker |
| Pagamento Pix atrasado | 🔲 | Worker expiração Pix + webhook |

---

## 7. Segurança

| Caso | Status | Onde |
|------|--------|------|
| Token webhook mismatch | **Int** | `inbound.integration.test.ts` |
| Header instância ausente | **Int** | idem |
| HMAC inválido WhatsApp | ✅ unit + **Int** | `webhook-hmac.test.ts` + inbound integration |
| HMAC / schema Pix webhook | ✅ schema | `pix-webhook.schemas.test.ts`; fluxo completo **Int** 🔲 |
| Rate limit | **Int** | `auth-rate-limit.integration.test.ts` |
| Tenant isolation middleware | ✅ | `src/middlewares/tenant.test.ts` |
| RBAC | ✅ | `src/middlewares/rbac.test.ts` + módulos finance/comissão |

---

## 8. Operação (check-in, conclusão, no-show, remarcação, cancelamento, fechamento)

| Caso | Status | Nota |
|------|--------|------|
| Transições / RBAC por rota | ⚠️ | Parcial via RBAC; rotas appointments **Int** 🔲 |
| Fechamento diário comissão | **Int** | `commission.service.integration.test.ts` |

---

## Comandos

```bash
cd barbearia-saas/apps/api
npm run typecheck
npm run test:unit
npm run test
```

Integração (exige `.env` com `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL` e migrações aplicadas):

```bash
npm run test
```

Executar subconjunto:

```bash
npx vitest run src/shared/webhook-hmac.test.ts src/modules/whatsapp/inbound.schemas.test.ts
```

---

## Lacunas e riscos

1. **IA / n8n / E2E:** custo de manutenção e dependência de serviços externos — recomenda-se contratos estáveis (schemas) + pipeline CI com mocks.
2. **Integração Pix webhook até BD:** validação HMAC isolada não cobre `applyPixWebhookPaid`.
3. **Dois POST simultâneos no mesmo slot:** falta teste de corrida HTTP paralela.
4. **Workers (outbox, notificações, expiração holds/Pix):** poucos testes de integração end-to-end com fila real.

---

## Alterações recentes (schemas testáveis)

- `src/modules/whatsapp/inbound.schemas.ts` — payload inbound sem carregar `pool`.
- `src/modules/payments/pix-webhook.schemas.ts` — payload webhook Pix.
- Testes: `webhook-hmac.test.ts`, `inbound.schemas.test.ts`, `pix-webhook.schemas.test.ts`, extensão `slots.test.ts`, `customer-restrictions.assert.test.ts`.
