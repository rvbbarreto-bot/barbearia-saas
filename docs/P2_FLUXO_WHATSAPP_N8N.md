# P2 — Fluxo WhatsApp / n8n

## Objectivo

Cliente no WhatsApp → inbound dedup → roteamento (n8n) → disponibilidade (API) → escolha de horário → criação de appointment → confirmação via outbox → visível no portal → eventos de auditoria.

## Entregáveis

- Workflow n8n versionado em `n8n/workflows/` (import/export JSON).
- Payloads de exemplo inbound/outbound e variáveis de ambiente documentadas.
- Procedimento de smoke reprodutível com massa demo/QA.

## Intenções mínimas

Agendar, consultar horários, confirmar, cancelar, remarcar, falar com atendente, fora de contexto, fallback humano.

*(Detalhe técnico e diagramas serão preenchidos na implementação do bloco E.)*
