# Prints L01–L13 — PEND homologação visual

Status: PEND (não capturados nesta sessão — requer stack local + tenant car_wash).

## Pré-requisitos

1. docker compose up (postgres, redis, api, web)
2. Aplicar migration 105
3. Configurar tenant:
   UPDATE tenant_settings SET settings = settings || '{"vertical":"car_wash","car_wash":{"require_vehicle":true}}'::jsonb WHERE tenant_id = '<uuid>';
4. Login manager no portal

## Arquivos esperados

L01 — tenant vertical car_wash (configurações ou API)
L02 — menu labels lava-rápido
L03 — cadastro veículo (/veiculos)
L04 — cliente com aba veículos
L05 — novo agendamento passo veículo
L06 — disponibilidade box/equipe
L07 — board pátio (/operacao/lava-rapido)
L08 — checklist entrada
L09 — job em lavagem
L10 — job pronto
L11 — outbox mensagem veículo pronto
L12 — auditoria correlation_id
L13 — usuário sem permissão (viewer)
L14 — CI verde (screenshot PR #10 checks)

Salvar PNG nesta pasta com os nomes acima.
