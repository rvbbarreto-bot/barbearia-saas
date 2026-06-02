<#
.SYNOPSIS
  Integração ponta-a-ponta simulada: webhook WF01 (WhatsApp mock) -> WF02 -> outbox.

.EXAMPLE
  .\scripts\qa-wf02-whatsapp-chain.ps1
  .\scripts\qa-wf02-whatsapp-chain.ps1 -RefreshCredentials
#>
param(
  [switch] $RefreshCredentials,
  [string] $Message = 'Quais horarios tem para corte masculino amanha?',
  [string] $Phone = '5511999990001',
  [string] $InstanceName = 'Barbearia',
  [int] $WaitSeconds = 45
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ($RefreshCredentials) {
  node scripts/patch-n8n-workflow-02-flow.mjs --refresh-credentials
} else {
  node scripts/patch-n8n-workflow-02-flow.mjs
}

Write-Host '==> Smoke WF01 inbound (simula WhatsApp)'
& (Join-Path $PSScriptRoot 'qa-n8n-inbound-smoke.ps1') -Scenario valid -Phone $Phone -InstanceName $InstanceName

$msgId = "WAMID_WF02_CHAIN_$(Get-Random)"
$webhookToken = (Get-Content .env | Where-Object { $_ -match '^\s*N8N_WEBHOOK_TOKEN\s*=' } | Select-Object -First 1) -replace '^\s*N8N_WEBHOOK_TOKEN\s*=\s*', ''
if (-not $webhookToken) { $webhookToken = 'demo_webhook_token_change_me' }

$payload = @{
  event = 'messages.upsert'
  instance = $InstanceName
  data = @{
    key = @{ remoteJid = "${Phone}@s.whatsapp.net"; fromMe = $false; id = $msgId }
    pushName = 'QA Chain'
    message = @{ conversation = $Message }
    messageTimestamp = [int][double]::Parse((Get-Date -UFormat %s))
  }
} | ConvertTo-Json -Depth 8 -Compress

$r = Invoke-WebRequest -Uri 'http://localhost:5679/webhook/whatsapp/inbound' -Method POST -Body $payload -ContentType 'application/json' -UseBasicParsing
Write-Host "    webhook HTTP $($r.StatusCode) msgId=$msgId"

Write-Host "==> Aguardar WF01+WF02 (${WaitSeconds}s)..."
Start-Sleep -Seconds $WaitSeconds

$pgUser = (Get-Content .env | Where-Object { $_ -match '^\s*POSTGRES_USER\s*=' } | Select-Object -First 1) -replace '^\s*POSTGRES_USER\s*=\s*', ''
if (-not $pgUser) { $pgUser = 'barbearia_test' }
$pgDb = (Get-Content .env | Where-Object { $_ -match '^\s*POSTGRES_DB\s*=' } | Select-Object -First 1) -replace '^\s*POSTGRES_DB\s*=\s*', ''
if (-not $pgDb) { $pgDb = 'barbearia_saas' }

$wf02 = (Get-Content .env | Where-Object { $_ -match '^\s*N8N_WORKFLOW_02_ID\s*=' } | Select-Object -First 1) -replace '^\s*N8N_WORKFLOW_02_ID\s*=\s*', ''
if (-not $wf02) { $wf02 = 'l0zOd4CUKvdFA6HD' }

$sqlWf02 = @"
SELECT id, status FROM execution_entity WHERE "workflowId"='$wf02' ORDER BY "startedAt" DESC LIMIT 1;
"@
$exec = (echo $sqlWf02 | docker exec -i barbearia-postgres psql -U $pgUser -d $pgDb -t -A 2>$null)
if ($exec) { Write-Host "    WF02 ultima exec: $($exec.Trim())" } else { Write-Host '    WF02 ultima exec: (sem registro)' }

$sqlOut = 'SELECT status, left(payload::text, 60) FROM message_outbox ORDER BY created_at DESC LIMIT 1;'
$outbox = (echo $sqlOut | docker exec -i barbearia-postgres psql -U $pgUser -d $pgDb -t -A 2>$null)
if ($outbox) { Write-Host "    outbox: $($outbox.Trim())" }

Write-Host ''
Write-Host 'Validar no n8n: Montar contexto agente, Normalizar, Enfileirar outbox (sem 401).'
Write-Host 'API: node scripts/qa-wf02-integration.mjs --refresh'
