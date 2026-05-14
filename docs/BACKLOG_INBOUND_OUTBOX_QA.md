# Backlog QA — Inbound / Outbox (pós bateria negativa core)

Cenários **CT-093**, **CT-100** e **CT-101** ficaram **Pendentes** na execução automatizada (`scripts/qa-api-negative-battery.ps1`) por dependerem de credenciais de instância Evolution e de mecanismo observável de outbox/worker.

---

## Card 1 — CT-093: Webhook `message_id` duplicado

**Objetivo:** validar que o mesmo `external_message_id` (ou campo equivalente) não duplica processamento nem gera outbox duplicado.

**Pré-requisitos:**

- Instância WhatsApp válida em QA (`x-webhook-instance` + `x-webhook-token` ou HMAC conforme `apps/api/src/modules/whatsapp/inbound.service.ts`).
- Acesso de leitura a tabela(s) de outbox / jobs ou logs correlacionáveis.

**Critérios de aceitação:**

1. Duas requisições idênticas com o mesmo identificador de mensagem: segunda resposta **200/202** sem segundo evento de negócio.
2. Sem **500** em validação esperada.
3. Evidência: duas responses + query ou log de outbox.

---

## Card 2 — CT-100: Reprocessamento de evento já tratado

**Objetivo:** reprocessar o mesmo evento inbound/outbox e garantir idempotência ao nível de mensagem/estado.

**Pré-requisitos:** worker ou endpoint de reprocessamento controlado em QA; massa mínima com evento conhecido.

**Critérios de aceitação:**

1. Não duplicar mensagem enviada nem estado terminal indevido.
2. Sem **500** no reprocessamento.
3. Evidência: antes/depois (SQL ou painel).

---

## Card 3 — CT-101: Falha simulada de provider

**Objetivo:** simular PSP/Evolution indisponível e validar `failed` / `retry_pending`, erro registado, mensagem preservada.

**Pré-requisitos:** modo mock ou feature flag documentada; telemetria de fila.

**Critérios de aceitação:**

1. Não marcar como enviado sem envio real.
2. Mensagem preservada para retry.
3. Evidência: payload de erro + estado na fila/outbox.
