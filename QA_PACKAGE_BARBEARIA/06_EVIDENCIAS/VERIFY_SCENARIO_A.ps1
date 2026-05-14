# Verificacao reproduzivel — Cenario A (GET /api/v1/tenants sem x-tenant-id para platform_admin)
# Executar na raiz do repo com API no ar (ex.: docker compose up).
# Exige: utilizador platform.admin@demo.local no seed (migration 100).

param(
  [string] $ApiBase = 'http://localhost:3000',
  [string] $TenantId = '00000000-0000-0000-0000-000000000001'
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

Write-Step "1) Login tenant_owner (admin@demo.local)"
$loginOwner = @{ email = 'admin@demo.local'; password = 'admin12345' } | ConvertTo-Json
$rOwner = Invoke-RestMethod -Uri "$ApiBase/auth/login" -Method Post -Body $loginOwner -ContentType 'application/json'
Write-Host "OK access_token length:" $rOwner.access_token.Length

Write-Step "2) GET /api/v1/tenants com owner + x-tenant-id -> esperado 403"
try {
  Invoke-WebRequest -Uri "$ApiBase/api/v1/tenants" -Headers @{
    Authorization = "Bearer $($rOwner.access_token)"
    'x-tenant-id' = $TenantId
  } -UseBasicParsing | Out-Null
  Write-Host 'ERRO: esperado 403' -ForegroundColor Red
  exit 1
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  if ($code -ne 403) { throw "Esperado 403, obtido $code" }
  Write-Host "OK HTTP $code"
}

Write-Step "3) GET /api/v1/tenants/current com owner -> esperado 200"
$rCur = Invoke-WebRequest -Uri "$ApiBase/api/v1/tenants/current" -Headers @{
  Authorization = "Bearer $($rOwner.access_token)"
  'x-tenant-id' = $TenantId
} -UseBasicParsing
Write-Host "OK HTTP $($rCur.StatusCode)"

Write-Step "4) Login platform_admin"
$loginPlat = @{ email = 'platform.admin@demo.local'; password = 'admin12345' } | ConvertTo-Json
$rPlat = Invoke-RestMethod -Uri "$ApiBase/auth/login" -Method Post -Body $loginPlat -ContentType 'application/json'
Write-Host "OK role no payload user:" $rPlat.user.role

Write-Step "5) GET /api/v1/tenants SEM x-tenant-id (teste oficial PO) -> esperado 200"
$rList = Invoke-WebRequest -Uri "$ApiBase/api/v1/tenants" -Headers @{
  Authorization = "Bearer $($rPlat.access_token)"
} -UseBasicParsing
Write-Host "OK HTTP $($rList.StatusCode) bodyLen=$($rList.Content.Length)"

Write-Step "6) GET /api/v1/tenants COM x-tenant-id (opcional) -> esperado 200"
$rList2 = Invoke-WebRequest -Uri "$ApiBase/api/v1/tenants" -Headers @{
  Authorization = "Bearer $($rPlat.access_token)"
  'x-tenant-id' = $TenantId
} -UseBasicParsing
Write-Host "OK HTTP $($rList2.StatusCode)"

Write-Step "7) GET /api/v1/services com owner + x-tenant-id -> esperado 200"
$rSvc = Invoke-WebRequest -Uri "$ApiBase/api/v1/services?page=1&limit=5" -Headers @{
  Authorization = "Bearer $($rOwner.access_token)"
  'x-tenant-id' = $TenantId
} -UseBasicParsing
Write-Host "OK HTTP $($rSvc.StatusCode)"

Write-Host "`nCenario A: verificacao concluida com sucesso." -ForegroundColor Green
