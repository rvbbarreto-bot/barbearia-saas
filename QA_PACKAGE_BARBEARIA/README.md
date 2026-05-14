# QA Package Barbearia

Pacote consolidado para habilitar o time de QA na validacao integrada de portal, API e n8n.

Estrutura:

- `01_PORTAL_WEB/`
- `02_API_ENDPOINTS/`
- `03_N8N_WORKFLOWS/`
- `04_MASSA_DE_DADOS/`
- `05_INSTRUCOES/`
- `06_EVIDENCIAS/`

Observacoes:

- Este pacote nao inclui segredos reais.
- Para homologacao/staging, substituir os placeholders de URL/credenciais conforme ambiente oficial.
- **`GET /api/v1/tenants`** (lista global): esperado **403** para `admin@demo.local` (`tenant_owner`). Para dados do tenant demo use **`GET /api/v1/tenants/current`** ou **`GET /api/v1/tenants/{{tenant_id}}`** (ver Postman e `OPENAPI_REFERENCE.md`).
- **Plataforma QA:** utilizador `platform.admin@demo.local` / `admin12345` (migration **`100_platform_admin_qa_seed.sql`**). Em bases antigas, correr `migrate.sh` ou aplicar o SQL manualmente (ver `06_EVIDENCIAS/CURLS_TENANTS_QA.md`).
- **Após atualizar o código da API:** é **obrigatório** reconstruir a imagem Docker da API (`docker compose build api`) e subir de novo; caso contrário o contentor pode continuar a servir `dist/` antigo e `GET /api/v1/tenants` sem `x-tenant-id` devolve `TENANT_REQUIRED` por bundle desatualizado.
- Verificação automatizada PO: `06_EVIDENCIAS/VERIFY_SCENARIO_A.ps1` (API no ar, seed aplicado).
