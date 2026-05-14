# Roteiro Minimo QA - Ordem Correta

## 1) Preparacao ambiente

1. Subir API, banco, redis, web, n8n.
2. Validar `GET /health` e `GET /health/ready`.
3. Abrir portal web e n8n UI.

## 2) API tooling

1. Importar `barbearia-api.postman_collection.json`.
2. Importar `barbearia-api.environment.json`.
3. Executar login e salvar `access_token`.
4. Popular `service_id`, `professional_id`, `customer_id`.

## 3) Importacao n8n

1. Importar workflow 01.
2. Importar workflow 02.
3. Importar workflow 03.
4. Configurar variaveis/credenciais (sem segredos reais).

## 4) Sequencia de testes funcionais

1. Portal:
   - login admin, atendente, profissional
   - navegacao basica de agenda
2. API appointments:
   - criar agendamento
   - consultar agendamento
   - confirmar
   - cancelar
   - remarcar
3. Casos negativos:
   - payload invalido
   - conflito de horario
   - idempotencia repetida
4. n8n:
   - teste webhook inbound (workflow 01)
   - teste agendamento assistido (workflow 02)
   - teste recall controlado (workflow 03)

## 5) Regras de ativacao

- Nao deixar `02` e `03` ativos apos os testes.
- Encerrar QA com evidencias de request/response e logs.
