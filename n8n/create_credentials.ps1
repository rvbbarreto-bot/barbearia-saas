# ─────────────────────────────────────────────────────────────────────────────
#  create_credentials.ps1 — Cria credenciais no n8n via API
#
#  ATENÇÃO: NÃO coloque chaves reais neste arquivo.
#  Defina as variáveis de ambiente abaixo antes de executar:
#
#    $env:N8N_API_KEY        = "sua_chave_n8n_api"
#    $env:BARBEARIA_EMAIL    = "admin@demo.local"
#    $env:BARBEARIA_PASSWORD = "sua_senha_admin"
#    $env:BARBEARIA_TENANT   = "00000000-0000-0000-0000-000000000001"
#    $env:POSTGRES_HOST      = "barbearia-postgres"
#    $env:POSTGRES_DB        = "barbearia_saas"
#    $env:POSTGRES_USER      = "barbearia"
#    $env:POSTGRES_PASSWORD  = "sua_senha_postgres"
#    $env:N8N_URL            = "http://localhost:5678"
#    $env:API_URL            = "http://localhost:3000"
#
#  Uso: PowerShell -ExecutionPolicy Bypass -File create_credentials.ps1
# ─────────────────────────────────────────────────────────────────────────────

$N8N_KEY   = $env:N8N_API_KEY
$N8N_URL   = $env:N8N_URL ?? "http://localhost:5678"
$API_URL   = $env:API_URL ?? "http://localhost:3000"

if (-not $N8N_KEY) {
    Write-Error "Variável N8N_API_KEY não definida. Exporte antes de executar."
    exit 1
}

$headers = @{ "X-N8N-API-KEY" = $N8N_KEY; "Content-Type" = "application/json" }

# --- 1. Obter JWT barbearia ---
$loginBody = @{
    tenant_id = $env:BARBEARIA_TENANT ?? "00000000-0000-0000-0000-000000000001"
    email     = $env:BARBEARIA_EMAIL    ?? "admin@demo.local"
    password  = $env:BARBEARIA_PASSWORD
} | ConvertTo-Json

if (-not $env:BARBEARIA_PASSWORD) {
    Write-Error "Variável BARBEARIA_PASSWORD não definida. Exporte antes de executar."
    exit 1
}

$login = Invoke-RestMethod -Uri "$API_URL/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
$jwt = $login.access_token
Write-Output "JWT_OK=True"

# --- 2. Credencial HTTP Header Auth (Bearer JWT barbearia) ---
$httpHeaderCred = @{
    name = "Barbearia API - Bearer JWT"
    type = "httpHeaderAuth"
    data = @{
        name  = "Authorization"
        value = "Bearer $jwt"
    }
} | ConvertTo-Json -Depth 5

try {
    $r = Invoke-RestMethod -Uri "$N8N_URL/api/v1/credentials" -Method POST -Headers $headers -Body $httpHeaderCred
    Write-Output ("HTTP_HEADER_CRED_ID=" + $r.id)
    $httpCredId = $r.id
} catch {
    Write-Output ("HTTP_HEADER_CRED_ERROR=" + $_.ErrorDetails.Message)
    $httpCredId = $null
}

# --- 3. Credencial PostgreSQL barbearia ---
$pgCred = @{
    name = "Barbearia Postgres"
    type = "postgres"
    data = @{
        host        = $env:POSTGRES_HOST ?? "barbearia-postgres"
        port        = 5432
        database    = $env:POSTGRES_DB   ?? "barbearia_saas"
        user        = $env:POSTGRES_USER  ?? "barbearia"
        password    = $env:POSTGRES_PASSWORD
        ssl         = "disable"
        sshTunnel   = $false
    }
} | ConvertTo-Json -Depth 5

try {
    $r2 = Invoke-RestMethod -Uri "$N8N_URL/api/v1/credentials" -Method POST -Headers $headers -Body $pgCred
    Write-Output ("POSTGRES_CRED_ID=" + $r2.id)
    $pgCredId = $r2.id
} catch {
    Write-Output ("POSTGRES_CRED_ERROR=" + $_.ErrorDetails.Message)
    $pgCredId = $null
}

Write-Output "HTTP_CRED=$httpCredId"
Write-Output "PG_CRED=$pgCredId"
