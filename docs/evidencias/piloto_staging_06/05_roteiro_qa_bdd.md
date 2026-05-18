# Roteiro QA BDD — PILOTO-STAGING-06

## 1. Dashboard com KPIs por período

**Dado** um gestor autenticado com perfil `manager`  
**E** existem agendamentos concluídos no período selecionado  
**Quando** acessa `/gestao/dashboard` com filtro de datas  
**Então** visualiza KPIs de faturamento, conclusão, cancelamentos e no-show  

## 2. Exportação CSV

**Dado** o dashboard carregado com sucesso  
**Quando** clica em Exportar CSV  
**Então** o ficheiro contém métricas e rankings do período  

## 3. Cliente 360 com histórico

**Dado** um cliente com agendamentos anteriores  
**Quando** abre `/clientes/{id}/360`  
**Então** vê cadastro, histórico, financeiro e opt-in WhatsApp  

## 4. Financeiro sem duplicidade

**Dado** um agendamento já com linha em `appointment_financials`  
**Quando** tenta duplicar liquidação ou snapshot  
**Então** a API mantém idempotência via `ON CONFLICT` / erros 409  

## 5. Comissão gerada na conclusão

**Dado** regra percentual ativa para o profissional  
**Quando** o agendamento transita para `completed`  
**Então** existe lançamento de comissão `pending`  

## 6. Waitlist convertida em agendamento

**Dado** entrada ativa na fila  
**E** agendamento criado para o mesmo cliente  
**Quando** converte via `POST /waitlist/:id/convert`  
**Então** a entrada fica `converted` e auditoria registada  

## 7. Lava Rápido com veículo e checklist

**Dado** tenant `car_wash` com `require_vehicle=true`  
**Quando** cria agendamento com `vehicle_id`  
**Então** nasce `car_wash_jobs` e checklist pode ser preenchido no board  

## 8. n8n SendText ou erro classificado

**Dado** workflow 03 importado sem pinData  
**Quando** executa smoke SendText  
**Então** sucesso ou erro classificado se Evolution bloquear  

## 9. Portal tokenizado válido

**Dado** token gerado para agendamento `pending_confirmation`  
**Quando** cliente abre `/portal/{token}`  
**Então** vê dados e pode confirmar  

## 10. Portal tokenizado expirado

**Dado** token com `expires_at` no passado  
**Quando** abre o link  
**Então** mensagem amigável `PORTAL_TOKEN_EXPIRED`  

## 11. RBAC negativo

**Dado** utilizador `viewer`  
**Quando** chama `GET /management/dashboard`  
**Então** recebe 403  

## 12. Cross-tenant

**Dado** token de tenant A  
**Quando** tenta aceder recurso de tenant B  
**Então** RLS/tenant middleware bloqueia  
