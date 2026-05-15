# P2 — Decisões de produto (guia de implementação)

Fonte: kickoff Fase P2 — MVP operacional para piloto controlado. Alterações só com registo explícito neste ficheiro ou no relatório P2.

## 1. Confirmação explícita vs criação administrativa

1. Appointment criado manualmente por `tenant_owner` / `tenant_admin` pode ser **confirmado operacionalmente** no portal, mas **`explicit_confirmation=false`** não representa confirmação explícita do cliente (criação administrativa).

2. **`professional`** não pode criar appointment com `explicit_confirmation=false`.

3. **`attendant`** pode criar walk-in ou agendamento manual conforme regras actuais, com trilha de auditoria.

## 2. Operações manuais

4. **No-show** é marcado manualmente no portal.

5. **Cancelamento** é manual no portal; no WhatsApp pode iniciar-se como solicitação ou fluxo assistido (sem automação insegura).

6. **Remarcação** valida disponibilidade como uma nova criação.

## 3. Outbox e lembretes

7. Lembrete pré-atendimento é **idempotente** (não duplicar envio).

8. Estado **pending** com `last_error` = falha recuperável, elegível para retry automático conforme política.

9. Estado **dead** = falha final.

## 4. Fora de escopo da P2 (backlog)

10. Pix antecipado, cobrança dinâmica, webhook de pagamento, remarketing, lembrete pós-serviço, relatórios financeiros avançados, multi-unidade avançada, app mobile, IA conversacional aberta, marketplace, integrações comerciais extra — **não iniciar** sem autorização expressa do PO.

## 5. Bloqueios de agenda (P2.1)

11. A persistência canónica continua a ser a tabela **`calendar_blocks`** (campos incl. `created_by` após migration `104_calendar_blocks_created_by.sql`).

12. Os endpoints **`GET|POST /api/v1/professionals/{id}/time-blocks`** e **`DELETE …/time-blocks/{block_id}`** são o **contrato PO-facing**: fixam `professional_id` no path, aplicam RBAC `agendaTimeBlocks`, e geram auditoria operacional `time_block_created` / `time_block_deleted` (entidade `time_block`). O legado **`/calendar-blocks`** mantém-se para compatibilidade; o OpenAPI descreve ambos de forma coerente com a mesma origem de dados.
