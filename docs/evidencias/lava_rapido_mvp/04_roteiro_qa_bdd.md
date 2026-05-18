# Roteiro QA BDD — Lava Rápido MVP

## Cadastrar veículo

**Cenário:** Cadastrar veículo para cliente do tenant  
**Dado** que estou autenticado como atendente no tenant lava-rápido  
**E** existe um cliente ativo  
**Quando** envio POST `/api/v1/vehicles` com placa, marca e modelo válidos  
**Então** o veículo é persistido com `normalized_plate`  
**E** é registrado evento `vehicle_created` na auditoria operacional  

## Normalizar placa

**Cenário:** Normalizar placa com hífen e espaços  
**Dado** a placa informada `abc-1d23`  
**Quando** o backend normaliza  
**Então** `normalized_plate` é `ABC1D23`  

## Impedir placa duplicada no tenant

**Cenário:** Placa duplicada no mesmo tenant  
**Dado** que já existe veículo com placa `ABC1D23` no tenant  
**Quando** tento cadastrar outro veículo com a mesma placa  
**Então** a API retorna `409 VEHICLE_PLATE_ALREADY_EXISTS`  

## Impedir veículo cross-tenant

**Cenário:** Leitura de veículo de outro tenant  
**Dado** veículo do tenant B  
**Quando** usuário do tenant A consulta por id  
**Então** recebe `404 VEHICLE_NOT_FOUND`  

## Impedir agendamento car_wash sem veículo

**Cenário:** Agendamento sem vehicle_id  
**Dado** tenant com `vertical=car_wash` e `require_vehicle=true`  
**Quando** POST `/api/v1/appointments` sem `vehicle_id`  
**Então** retorna `422 VEHICLE_REQUIRED`  

## Rejeitar vehicle_id em tenant barbershop

**Cenário:** Barbearia rejeita vehicle_id  
**Dado** tenant `barbershop`  
**Quando** POST `/api/v1/appointments` com `vehicle_id`  
**Então** retorna `400 VEHICLE_NOT_ALLOWED`  

## Criar agendamento com veículo

**Cenário:** Agendamento lava-rápido completo  
**Dado** cliente, veículo, serviço e box disponíveis  
**Quando** crio agendamento com `vehicle_id` e confirmação  
**Então** o appointment é criado  
**E** o slot fica bloqueado  

## Criar job em transação

**Cenário:** Job criado junto com appointment  
**Dado** tenant car_wash  
**Quando** o appointment é inserido com sucesso  
**Então** existe `car_wash_jobs` com `stage=scheduled` na mesma transação  
**E** falha no job reverte o appointment  

## Impedir transição inválida

**Cenário:** scheduled → ready direto  
**Dado** job em `scheduled`  
**Quando** PATCH `/ready`  
**Então** retorna `422 INVALID_CAR_WASH_STAGE_TRANSITION`  

## Marcar chegada

**Cenário:** Chegada após checklist  
**Dado** job `scheduled` e checklist `arrival` registrado  
**Quando** PATCH `/arrive`  
**Então** stage vira `arrived`  
**E** appointment reflete check-in quando aplicável  

## Preencher checklist

**Cenário:** Checklist de entrada  
**Quando** POST checklist com campos MVP  
**Então** persiste JSON validado  
**E** auditoria `car_wash_checklist_created`  

## Iniciar lavagem

**Cenário:** Início da lavagem  
**Dado** job `arrived`  
**Quando** PATCH `/start`  
**Então** stage `washing`  

## Marcar pronto e gerar outbox

**Cenário:** Pronto com WhatsApp  
**Dado** job em `quality_check` e cliente com opt-in  
**Quando** PATCH `/ready`  
**Então** stage `ready`  
**E** mensagem idempotente enfileirada no outbox  

## Entregar e gerar financeiro/comissão

**Cenário:** Entrega conclui serviço  
**Dado** job `ready`  
**Quando** PATCH `/deliver`  
**Então** stage `delivered`  
**E** appointment `completed`  
**E** financeiro/comissão conforme fluxo existente  

## Bloquear viewer

**Cenário:** Viewer não altera pátio  
**Dado** role `viewer`  
**Quando** PATCH transição de job  
**Então** retorna `403`  

## Erro amigável quando API falhar

**Cenário:** UI exibe erro de API  
**Dado** falha 422 no board  
**Quando** usuário aciona ação inválida  
**Então** a interface exibe mensagem amigável via `getApiErrorMessage`  
