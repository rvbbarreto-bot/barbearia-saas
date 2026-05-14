# Passo a Passo - Como usar os arquivos do pacote QA

## 0) Preparacao

1. Extrair `QA_PACKAGE_BARBEARIA.zip`.
2. Garantir stack local/hml ativo (API, DB, Web, n8n).
3. Validar:
   - Portal: `http://localhost:3001`
   - API: `http://localhost:3000/health`
   - n8n: `http://localhost:5678` (ou `5679`)

## 1) Portal web

1. Abrir `01_PORTAL_WEB/PORTAL_WEB.md`.
2. Testar login com perfis:
   - admin
   - atendente
   - profissional
3. Confirmar RBAC visual (menus e telas por perfil).

## 2) API (Postman)

1. Importar `02_API_ENDPOINTS/barbearia-api.postman_collection.json`.
2. Importar `02_API_ENDPOINTS/barbearia-api.environment.json`.
3. Executar na ordem:
   - `POST /auth/login` (grava `access_token` no environment)
   - `POST /auth/login (platform_admin)` (grava `platform_access_token`)
   - Tenants: `GET /api/v1/tenants` com **access_token** → 403; com **platform_access_token** **sem** `x-tenant-id` → 200; opcional com `x-tenant-id` → 200; `GET /tenants/current` com owner → 200
   - `GET /api/v1/services`, `professionals`, `customers`
4. Copiar os IDs retornados e preencher:
   - `service_id`
   - `professional_id`
   - `customer_id`
5. Executar fluxo appointments:
   - create
   - list
   - confirm
   - cancel
   - reschedule

## 3) OpenAPI

1. Ler `02_API_ENDPOINTS/OPENAPI_REFERENCE.md`.
2. Se docs estiverem habilitadas, acessar `/docs` ou `/documentation`.

## 4) n8n

1. Ler `03_N8N_WORKFLOWS/N8N_WORKFLOWS.md`.
2. Importar os JSONs na ordem 01 -> 02 -> 03.
3. Configurar variaveis/credenciais:
   - `API_BASE_URL`
   - `N8N_WEBHOOK_TOKEN`
   - credencial HTTP Bearer
   - `x-tenant-id`
4. Executar testes controlados.
5. Finalizar com workflows 02/03 inativos.

## 5) Massa de dados

1. Ler `04_MASSA_DE_DADOS/MASSA_DE_DADOS.md`.
2. Confirmar tenant demo e usuarios.
3. Criar cliente(s) de QA se necessario.
4. Usar janelas de horario recomendadas para evitar colisao com dados antigos.

## 6) Evidencias

1. Salvar print/request/response dos cenarios executados.
2. Anexar logs de erro quando houver.
3. Validar checklist de segredos em `06_EVIDENCIAS/SEGURANCA_E_SECRETS.md`.
