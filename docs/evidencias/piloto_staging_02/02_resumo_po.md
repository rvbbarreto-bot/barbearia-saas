# Resumo PO — PILOTO-STAGING-02

## O que foi entregue

1. **Conflito de horário** — mantido e coberto por testes existentes + lifecycle (cancel libera slot).
2. **Datas passadas** — create e **remarcação** rejeitam com `APPOINTMENT_IN_PAST`.
3. **Profissional** — não pode cancelar/confirmar/remarcar agendamento de outro barbeiro (403); cancelamento usa o mesmo controlo de escopo antes de qualquer resposta idempotente. Não pode **criar** nem **walk-in** para agenda de outro `professional_id` (403).
4. **Cross-tenant** — cancel em tenant errado retorna 404 (agendamento não encontrado).
5. **RBAC rota** — confirm: viewer 403, atendente 200 (teste de rota).
6. **Portal** — mensagens amigáveis para conflito, passado e permissão.

## Independência

Esta entrega **não exige** Evolution, n8n, WhatsApp real nem staging cloud.

## Próximo passo sugerido

Juntar com `piloto-staging-01` (Evolution E2E) após credenciais e smoke n8n validados.
