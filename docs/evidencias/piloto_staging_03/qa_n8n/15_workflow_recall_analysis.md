# Workflow recall — `03_recall_30_days_multitenant`

## Papéis e risco

Este fluxo chama apenas a **Core API** (`GET /recall/candidates`, `POST /recall/send`). Não há envio Evolution directo pelo n8n — o envio efectivo sai da outbox já existente na plataforma. Mesmo assim, erro de parametrição ou RBAC permissivo poderia aumentar mensagens não desejadas.

## Controles implementados nesta revisão

1. **`active=false`** no JSON exportado (obrigatório manter assim até QA & PO).
2. **Gate `PO gate agenda`**: bloqueia *Schedule Trigger* até `N8N_RECALL_ALLOW_SCHEDULE=true` no container; execuções manuais passam sempre (ideal para QA controlado sem abrir cron).
3. **`RECALL_ENABLED` IF** já existente alinha com mesma env na API antes de expansão de candidatos.
4. **Limite expansão**: Code `Expandir candidatos` faz `Math.min(length, max)` onde `max=30`.
5. **Opt-out/consentimento** tratado na cadência Core / motor de mensagens — fora deste fluxo mas dependente das rotas já existentes (`recall/send`).

## Teste manual seguro sugerido

1. Confirmar recall continua **`inactive`** na UI (`active=false`).
2. `RECALL_ENABLED=false` no `.env` da API até PO.
3. `N8N_RECALL_ALLOW_SCHEDULE=false`.
4. *Execute workflow manually* apenas com Bearer + `x-tenant-id` válidos sandbox e validar lista vazia / candidatos esperados antes de disparar POST send.

## Disparo em massa QA

Com os defaults acima, **não** deve ocorrer campanha em massa; candidatos ficam truncados mesmo em execuções parciais.

## Evolução Evolution

Este workflow **não** usa payload Evolution `number/text` porque não comunica WhatsApp por HTTP directo ao broker.

## Screenshot esperado `16_workflow_recall_inactive.png`

Capturar após import com toggle *Inactive* visível para o QA.
