<#
.SYNOPSIS
  Simula conversa multi-turn no WhatsApp (3 mensagens) e valida session_text no Core.

.EXAMPLE
  .\scripts\qa-wf02-multiturn-smoke.ps1
#>
param(
  [string] $Phone = '5511998887777',
  [string] $InstanceName = 'Barbearia',
  [string] $N8nUrl = 'http://localhost:5679',
  [string] $ApiUrl = 'http://localhost:3000'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-EnvVal([string] $Key) {
  $line = Get-Content (Join-Path $root '.env') | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -replace "^\s*$Key\s*=\s*", '').Trim().Trim('"').Trim("'")
}

$webhookToken = Get-EnvVal 'N8N_WEBHOOK_TOKEN'
if (-not $webhookToken) { $webhookToken = 'demo_webhook_token_change_me' }

$messages = @(
  'Boa tarde',
  'Quero agendar um horario',
  'Para amanha as 10:30 com corte masculino'
)

Write-Host '==> Multi-turn WhatsApp smoke (3 mensagens sequenciais)'
$lastMsgId = $null

foreach ($i in 0..($messages.Count - 1)) {
  $text = $messages[$i]
  $msgId = "WAMID_MULTI_$i`_$(Get-Random)"
  $lastMsgId = $msgId
  $payload = @{
    event = 'messages.upsert'
    instance = $InstanceName
    data = @{
      key = @{ remoteJid = "${Phone}@s.whatsapp.net"; fromMe = $false; id = $msgId }
      pushName = 'QA Multi'
      message = @{ conversation = $text }
      messageTimestamp = [int][double]::Parse((Get-Date -UFormat %s))
    }
  } | ConvertTo-Json -Depth 8 -Compress

  $r = Invoke-WebRequest -Uri "$N8nUrl/webhook/whatsapp/inbound" -Method POST -Body $payload -ContentType 'application/json' -UseBasicParsing
  Write-Host "  [$($i+1)/3] HTTP $($r.StatusCode) - $text"
  Start-Sleep -Seconds 8
}

Write-Host '==> Aguardar WF02 (45s)...'
Start-Sleep -Seconds 45

$pgUser = Get-EnvVal 'POSTGRES_USER'
if (-not $pgUser) { $pgUser = 'barbearia_test' }
$pgDb = Get-EnvVal 'POSTGRES_DB'
if (-not $pgDb) { $pgDb = 'barbearia_saas' }

$count = docker exec barbearia-postgres psql -U $pgUser -d $pgDb -t -A -c "SELECT count(*) FROM messages WHERE external_message_id LIKE 'WAMID_MULTI_%';"
Write-Host "  messages MULTI no DB: $($count.Trim()) (esperado >= 3)"

$wf02 = Get-EnvVal 'N8N_WORKFLOW_02_ID'
if (-not $wf02) { $wf02 = 'l0zOd4CUKvdFA6HD' }
$sql = "SELECT status FROM execution_entity WHERE `"workflowId`"='$wf02' ORDER BY `"startedAt`" DESC LIMIT 1;"
$exec = (echo $sql | docker exec -i barbearia-postgres psql -U $pgUser -d $pgDb -t -A 2>$null)
Write-Host "  WF02 ultima exec: $($exec.Trim())"

if ([int]$count.Trim() -lt 3) { throw 'FAIL - nem todas as mensagens foram persistidas' }
Write-Host 'PASS - multi-turn disparado. Validar no n8n: session_text com 3 linhas no agente.'
