<#
.SYNOPSIS
  E2E multi-turn: saudacao -> coleta -> confirmacao -> POST appointments (WF02 criar).

.EXAMPLE
  .\scripts\qa-wf02-booking-multiturn.ps1
#>
param(
  [string] $Phone = '5511998886666',
  [string] $PushName = 'Ricardo QA',
  [string] $InstanceName = 'Barbearia',
  [string] $N8nUrl = 'http://localhost:5679',
  [int] $PauseSeconds = 10,
  [int] $FinalWaitSeconds = 60
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-EnvVal([string] $Key) {
  $line = Get-Content (Join-Path $root '.env') | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -replace "^\s*$Key\s*=\s*", '').Trim().Trim('"').Trim("'")
}

$messages = @(
  'Boa noite',
  'Quero agendar um horario',
  'Corte masculino por favor',
  'Com o Fred',
  'Amanha as 10:30',
  'Sim, pode confirmar'
)

$prefix = "WAMID_BOOK_$(Get-Random)"
Write-Host "==> E2E booking multi-turn ($($messages.Count) msgs) phone=$Phone prefix=$prefix"

foreach ($i in 0..($messages.Count - 1)) {
  $text = $messages[$i]
  $msgId = "${prefix}_$i"
  $payload = @{
    event = 'messages.upsert'
    instance = $InstanceName
    data = @{
      key = @{ remoteJid = "${Phone}@s.whatsapp.net"; fromMe = $false; id = $msgId }
      pushName = $PushName
      message = @{ conversation = $text }
      messageTimestamp = [int][double]::Parse((Get-Date -UFormat %s))
    }
  } | ConvertTo-Json -Depth 8 -Compress

  $r = Invoke-WebRequest -Uri "$N8nUrl/webhook/whatsapp/inbound" -Method POST -Body $payload -ContentType 'application/json' -UseBasicParsing
  Write-Host "  [$($i+1)/$($messages.Count)] HTTP $($r.StatusCode) - $text"
  Start-Sleep -Seconds $PauseSeconds
}

Write-Host "==> Aguardar WF02 final ($FinalWaitSeconds s)..."
Start-Sleep -Seconds $FinalWaitSeconds

$pgUser = Get-EnvVal 'POSTGRES_USER'
if (-not $pgUser) { $pgUser = 'barbearia_test' }
$pgDb = Get-EnvVal 'POSTGRES_DB'
if (-not $pgDb) { $pgDb = 'barbearia_saas' }

$msgCount = docker exec barbearia-postgres psql -U $pgUser -d $pgDb -t -A -c "SELECT count(*) FROM messages WHERE external_message_id LIKE '${prefix}_%';"
Write-Host "  messages persistidas: $($msgCount.Trim()) (esperado $($messages.Count))"

$wf02 = Get-EnvVal 'N8N_WORKFLOW_02_ID'
if (-not $wf02) { $wf02 = 'l0zOd4CUKvdFA6HD' }

$execSql = "SELECT id, status FROM execution_entity WHERE `"workflowId`"='$wf02' ORDER BY `"startedAt`" DESC LIMIT 1;"
$exec = (echo $execSql | docker exec -i barbearia-postgres psql -U $pgUser -d $pgDb -t -A 2>$null)
Write-Host "  WF02 ultima exec: $($exec.Trim())"

$apptSql = "SELECT a.id::text, a.status, a.starts_at::text, s.name, p.name FROM appointments a JOIN customers c ON c.id = a.customer_id AND c.tenant_id = a.tenant_id LEFT JOIN services s ON s.id = a.service_id LEFT JOIN professionals p ON p.id = a.professional_id WHERE c.phone = '$Phone' ORDER BY a.created_at DESC LIMIT 1;"
$appt = (echo $apptSql | docker exec -i barbearia-postgres psql -U $pgUser -d $pgDb -t -A 2>$null)
Write-Host "  ultimo agendamento: $($appt.Trim())"

$outSql = 'SELECT status, left(payload::text, 120) FROM message_outbox ORDER BY created_at DESC LIMIT 1;'
$outbox = (echo $outSql | docker exec -i barbearia-postgres psql -U $pgUser -d $pgDb -t -A 2>$null)
Write-Host "  outbox: $($outbox.Trim())"

if ([int]$msgCount.Trim() -lt $messages.Count) { throw 'FAIL - mensagens incompletas no DB' }
if (-not $appt -or $appt.Trim().Length -lt 5) { throw 'FAIL - nenhum agendamento criado para o telefone' }
if ($exec -notmatch 'success') { Write-Host 'WARN - WF02 ultima exec nao success (verificar n8n)' }

Write-Host 'PASS - fluxo multi-turn concluido com agendamento no DB.'
