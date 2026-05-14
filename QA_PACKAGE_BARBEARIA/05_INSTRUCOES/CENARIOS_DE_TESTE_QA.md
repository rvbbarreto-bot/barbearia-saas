# Cenarios de Teste QA - Portal + API + n8n

## A. Autenticacao e sessao

1. Login valido (admin) -> esperado 200 + token.
2. Login invalido (senha errada) -> esperado 401/erro controlado.
3. `/api/v1/me` com token valido -> esperado 200.
4. `/api/v1/me` sem token -> esperado 401.
5. `/api/v1/me` com token invalido -> esperado 401.
6. `/api/v1/me` com `x-tenant-id` divergente -> esperado 403.

## B. Fluxo principal de agendamento

1. Listar catalogo (services, professionals, customers).
2. Criar agendamento valido.
3. Consultar agendamento criado na listagem.
4. Confirmar agendamento.
5. Remarcar agendamento.
6. Cancelar agendamento.

## C. Casos negativos de appointments

1. Payload invalido -> esperado 400 `VALIDATION_ERROR`.
2. Conflito de horario mesmo profissional -> esperado 409.
3. Repeticao com mesma `idempotency_key` -> esperado 409 ou retorno idempotente documentado.
4. IDs inexistentes (customer/professional/service) -> esperado erro controlado 4xx (registrar se houver 500).

## D. RBAC no portal

1. Admin acessa telas administrativas.
2. Atendente nao acessa telas manager-only (ex.: comissao).
3. Profissional com escopo restrito.

## E. n8n integrado

### Workflow 01 (inbound)
- Receber webhook.
- Encaminhar para API.
- Validar tratamento de erro/log.

### Workflow 02 (agendamento assistido)
- Entrada de intencao.
- Chamada de disponibilidade.
- Criacao de appointment via API.
- Enfileiramento de outbound.

### Workflow 03 (recall)
- Trigger agendado/manual.
- Busca candidatos.
- Disparo de recall via API.
- Validar comportamento com opt-out.

## F. Criterios de saida

- Sem erro 500 em cenarios de negocio esperados.
- Sem duplicacao indevida de agendamento.
- Sem segredo real exposto em requests/workflows.
- Evidencias salvas (prints, logs, requests/responses).
