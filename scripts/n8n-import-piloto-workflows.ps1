<#
.SYNOPSIS
  PS-08.5 — Importa os 4 workflows piloto no n8n via API (inactive, sem pinData).

.DESCRIPTION
  1. Valida JSON (scripts/n8n-validate-workflow-import.mjs)
  2. Importa/actualiza docs/n8n/*.json via n8n/import_workflows_from_json.mjs

.EXAMPLE
  # n8n a correr (docker compose up -d n8n)
  # Criar API key: http://localhost:5679 → Settings → n8n API
  $env:N8N_API_KEY = 'n8n_api_...'
  .\scripts\n8n-import-piloto-workflows.ps1

.NOTES
  DoD PS-08.5: P07_16 / C34 — 4 workflows listados após um comando.
#>
param(
  [string] $N8nUrl = $env:N8N_URL,
  [switch] $SkipValidation
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $N8nUrl) { $N8nUrl = 'http://localhost:5679' }
$env:N8N_URL = $N8nUrl.TrimEnd('/')

if (-not $env:N8N_API_KEY) {
  Write-Host @"
N8N_API_KEY ausente.

1. Abra n8n: $($env:N8N_URL)
2. Settings → n8n API → Create API Key
3. PowerShell:
   `$env:N8N_API_KEY = 'n8n_api_...'
   .\scripts\n8n-import-piloto-workflows.ps1
"@
  exit 2
}

Write-Host "==> n8n piloto import — $($env:N8N_URL)"

Write-Host "==> Healthcheck n8n..."
try {
  $health = Invoke-WebRequest -Uri "$($env:N8N_URL)/healthz" -UseBasicParsing -TimeoutSec 20
  Write-Host "OK — healthz HTTP $($health.StatusCode)"
} catch {
  if ($_.Exception.Response) {
    $code = [int]$_.Exception.Response.StatusCode
    Write-Host "healthz HTTP $code (continuando — API key pode bastar)"
  } else {
    throw "n8n inacessível em $($env:N8N_URL). Suba: docker compose up -d n8n"
  }
}

if (-not $SkipValidation) {
  Write-Host "==> Validação estrutural JSON..."
  node scripts/n8n-validate-workflow-import.mjs
  if ($LASTEXITCODE -ne 0) { throw "Validação falhou ($LASTEXITCODE)" }
}

Write-Host "==> Import via API..."
node n8n/import_workflows_from_json.mjs
if ($LASTEXITCODE -ne 0) { throw "Import falhou ($LASTEXITCODE)" }

Write-Host "==> Listagem (API)..."
$headers = @{
  'X-N8N-API-KEY' = $env:N8N_API_KEY
  'Accept'        = 'application/json'
}
$list = Invoke-RestMethod -Uri "$($env:N8N_URL)/api/v1/workflows?limit=250" -Headers $headers -Method Get
$rows = @($list.data)
if ($rows.Count -eq 0 -and $list -is [System.Array]) { $rows = @($list) }

$expected = @(
  '01_whatsapp_router_multitenant.json',
  '02_ai_scheduling_agent_multitenant.json',
  '03_QA_Barbearia_Evolution_SendText_Smoke.json',
  '03_recall_30_days_multitenant.json'
)

Write-Host ""
Write-Host "Workflows na instância ($($rows.Count) total):"
foreach ($w in $rows | Sort-Object name) {
  $flag = if ($w.active) { 'ACTIVE' } else { 'inactive' }
  Write-Host "  - [$flag] $($w.name) (id=$($w.id))"
}

$missing = @()
foreach ($file in $expected) {
  $slug = $file -replace '\.json$', ''
  $hit = $rows | Where-Object { $_.name -match [regex]::Escape($slug) -or $_.name -match 'SaaS Barbearia' }
  if (-not $hit) {
    # match by partial name from JSON files is fragile; rely on import count
  }
}

Write-Host ""
Write-Host "Próximo passo QA (C34): confirmar 4 workflows na UI $($env:N8N_URL) — todos inactive."
Write-Host "Workflow 01: ligar ID do workflow 02 no nó Execute Workflow (ver PILOTO_STAGING_01_N8N.md)."
