# n8n Workflows - Importacao QA

## JSONs prontos para importacao

Usar os arquivos versionados:

- `n8n/workflows/01_whatsapp_router_multitenant.json`
- `n8n/workflows/02_ai_scheduling_agent_multitenant.json`
- `n8n/workflows/03_recall_30_days_multitenant.json`
- `n8n/workflows/03_QA_Barbearia_Evolution_SendText_Smoke.json` (smoke manual — ver `EVOLUTION_SENDTEXT_SMOKE.md`)

## Ordem de importacao recomendada

1. `01_whatsapp_router_multitenant.json`
2. `02_ai_scheduling_agent_multitenant.json`
3. `03_recall_30_days_multitenant.json`

## Regra de ativacao

- Importar todos com `active=false`.
- Validar credenciais e endpoints.
- Ativar apenas para teste controlado.
- Manter `02` e `03` inativos fora da janela de QA.

## URL da UI n8n no host

Com `docker-compose.yml` da raiz: **`http://localhost:5679`** (mapeamento de porta).

## Variaveis e credenciais necessarias no n8n

- `API_BASE_URL` (ex.: `http://api:3000` em docker interno)
- `N8N_WEBHOOK_TOKEN` (token de QA, sem segredo real de producao)
- Credencial HTTP para API (Bearer token de usuario de servico)
- Header `x-tenant-id` coerente com tenant de teste

## Checklist tecnico minimo

- Fluxo 01: recebe webhook inbound e roteia para API
- Fluxo 02: consulta disponibilidade + cria agendamento + enfileira outbound
- Fluxo 03: consulta candidatos recall + dispara envio via API
- Todos com tratamento de erro habilitado no workflow
