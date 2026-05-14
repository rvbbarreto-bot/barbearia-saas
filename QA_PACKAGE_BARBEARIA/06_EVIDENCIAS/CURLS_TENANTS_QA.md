# Evidência — Tenants (curl / PowerShell)

PowerShell (exemplo):

```powershell
$API = 'http://localhost:3000'
$TENANT = '00000000-0000-0000-0000-000000000001'
```

## 0) Aplicar seed do `platform_admin` (bases já criadas antes da migration `100`)

```powershell
Get-Content .\database\migrations\100_platform_admin_qa_seed.sql -Raw | docker exec -i barbearia-postgres psql -U <POSTGRES_USER> -d <POSTGRES_DB>
```

(Substitua `<POSTGRES_USER>` / `<POSTGRES_DB>` pelos valores do seu `.env`, ex. `barbearia_test` / `barbearia_saas`.)

## 1) Login `tenant_owner` (admin demo)

```powershell
curl.exe -s -i -X POST "$API/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"admin@demo.local\",\"password\":\"admin12345\",\"tenant_id\":\"$TENANT\"}"
```

Guarde o `access_token` da resposta (ex.: variável `$OWNER`).

## 2) `GET /api/v1/tenants` com token do owner → **403** esperado

```powershell
curl.exe -s -i "$API/api/v1/tenants" -H "Authorization: Bearer $OWNER" -H "x-tenant-id: $TENANT"
```

## 3) `GET /api/v1/tenants/current` com token do owner → **200** esperado

```powershell
curl.exe -s -i "$API/api/v1/tenants/current" -H "Authorization: Bearer $OWNER" -H "x-tenant-id: $TENANT"
```

## 4) `GET /api/v1/tenants/{uuid-terceiro}` com token do owner → **403** esperado

```powershell
curl.exe -s -i "$API/api/v1/tenants/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" -H "Authorization: Bearer $OWNER" -H "x-tenant-id: $TENANT"
```

## 5) Login `platform_admin` (seed QA)

```powershell
curl.exe -s -i -X POST "$API/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"platform.admin@demo.local\",\"password\":\"admin12345\"}"
```

Guarde `access_token` (ex.: `$PLAT`).

## 6) `GET /api/v1/tenants` com token da plataforma **sem** `x-tenant-id` → **200** (Cenário A)

```powershell
curl.exe -s -i "$API/api/v1/tenants" -H "Authorization: Bearer $PLAT"
```

## 6b) Opcional: mesmo pedido **com** `x-tenant-id` (continua **200**)

```powershell
curl.exe -s -i "$API/api/v1/tenants" -H "Authorization: Bearer $PLAT" -H "x-tenant-id: $TENANT"
```

---

## Anexo — cola de saída (preencher após execução no ambiente limpo)

Execute os comandos acima após `docker compose up -d --build` e cole abaixo **status HTTP** e corpo resumido (sem tokens completos).

| Passo | HTTP | Notas |
|-------|------|--------|
| 2 GET /tenants (owner) | | |
| 3 GET /tenants/current | | |
| 4 GET /tenants/outro | | |
| 6 GET /tenants (platform, sem header) | | |
| 6b GET /tenants (platform, com header) | | |
