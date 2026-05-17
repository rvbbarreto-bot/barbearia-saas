# Roteiro QA — Web / API + painel de homologação (PILOTO-STAGING-03)

## Painel operacional (a implementar/evidenciar)

- Estado **API** (health ou endpoint dedicado QA).
- Estado **database** (ping ou rota segura só para roles elevados).
- Estado **outbox** (fila/resumo).
- Estado **Evolution** (HTTP opcional ao URL configurado, read-only).
- Estado **n8n** (HTTP opcional, read-only).
- Últimos **eventos operacionais** + **erros** com filtros: tenant, `appointment_id`, `correlation_id`, status.
- Vista **Agenda → Outbox → Worker → Evolution/n8n** (diagrama ou secções).
- Estados UI: loading, erro, vazio, sucesso.

## API / agenda

- Fluxos: criar → confirmar → outbox/notificação → cancelar / remarcar / bloqueio / conflito.
- Mensagens: `APPOINTMENT_IN_PAST`, `SLOT_UNAVAILABLE`, `FORBIDDEN`, erros de tenant.

## Outbox

- Listagem filtrada; detalhe sanitizado; retry **manager+** OK; **attendant** 403.

## Evidência

- Capturas do painel + links para runs CI no fecho da entrega.
