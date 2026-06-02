<#
.SYNOPSIS
  E2E booking multi-turn via Evolution + celular fisico (mensagem real inbound).

  Envia instrucoes pelo WhatsApp Barbearia e monitora 6 respostas reais do cliente
  ate criar agendamento no Core (mesmo fluxo do qa-wf02-booking-multiturn.ps1).

.EXAMPLE
  .\scripts\qa-evolution-booking-multiturn-e2e.ps1
  .\scripts\qa-evolution-booking-multiturn-e2e.ps1 -SkipPromptSend -PollSeconds 600
#>
param(
  [int] $PollSeconds = 480,
  [int] $PollInterval = 8,
  [switch] $SkipPromptSend,
  [string] $EvolutionUrl = 'http://localhost:8081',
  [string] $InstanceName = 'Barbearia',
  [string[]] $ExpectedReplies = @(
    'Boa noite',
    'Quero agendar um horario',
    'Corte masculino por favor',
    'Com o Fred',
    'Amanha as 10:30',
    'Sim, pode confirmar'
  )
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-EnvVal([string] $Key) {
  $line = Get-Content (Join-Path $root '.env') | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -replace "^\s*$Key\s*=\s*", '').Trim().Trim('"').Trim("'")
}

function Invoke-Psql([string] $Sql) {
  return (echo $Sql | docker exec -i barbearia-postgres psql -U $script:pgUser -d $script:pgDb -t -A 2>$null).Trim()
}

function Add-Check([string] $Name, [bool] $Ok, [string] $Detail) {
  $mark = if ($Ok) { 'OK' } else { 'FAIL' }
  Write-Host ('  [{0}] {1} - {2}' -f $mark, $Name, $Detail)
}

function Normalize-Phone([string] $Raw) {
  return ($Raw -replace '\D', '')
}

$script:pgUser = Get-EnvVal 'POSTGRES_USER'
if (-not $script:pgUser) { $script:pgUser = 'barbearia_test' }
$script:pgDb = Get-EnvVal 'POSTGRES_DB'
if (-not $script:pgDb) { $script:pgDb = 'barbearia_saas' }

$evoKey = Get-EnvVal 'EVOLUTION_API_KEY'
$instance = Get-EnvVal 'EVOLUTION_INSTANCE'
if (-not $instance) { $instance = $InstanceName }
$wf02Id = Get-EnvVal 'N8N_WORKFLOW_02_ID'
if (-not $wf02Id) { $wf02Id = 'l0zOd4CUKvdFA6HD' }

if (-not $evoKey) { throw 'EVOLUTION_API_KEY ausente no .env' }

$evoHeaders = @{ apikey = $evoKey; 'Content-Type' = 'application/json' }

Write-Host '==> E2E Evolution booking multi-turn (mensagem real)'
Write-Host ''

Write-Host '==> Pre-flight'
try {
  $state = Invoke-RestMethod -Uri "$EvolutionUrl/instance/connectionState/$instance" -Headers @{ apikey = $evoKey } -TimeoutSec 20
  $open = ($state.instance.state -eq 'open')
  $ownerJid = [string]$state.instance.ownerJid
  Add-Check 'Evolution open' $open ('state=' + $state.instance.state)
} catch {
  Add-Check 'Evolution open' $false $_.Exception.Message
  exit 1
}

if (-not $ownerJid) {
  try {
    $instances = Invoke-RestMethod -Uri "$EvolutionUrl/instance/fetchInstances" -Headers @{ apikey = $evoKey } -TimeoutSec 20
    $match = @($instances) | Where-Object { $_.name -eq $instance } | Select-Object -First 1
    if ($match -and $match.ownerJid) { $ownerJid = [string]$match.ownerJid }
  } catch {
    Write-Host '  WARN - nao foi possivel obter ownerJid via fetchInstances'
  }
}

$ownerPhone = Normalize-Phone(($ownerJid -replace '@.*$', ''))
$qaPhone = Normalize-Phone (Get-EnvVal 'QA_WHATSAPP_NUMBER')
if (-not $qaPhone) {
  $qaPhone = Normalize-Phone (Invoke-Psql "SELECT phone FROM customers WHERE id='00000000-0000-4000-8000-000000004031' LIMIT 1;")
}

if (-not $SkipPromptSend -and $qaPhone -and $ownerPhone -and ($qaPhone -eq $ownerPhone)) {
  Write-Host ''
  Write-Host 'BLOCKED - QA_WHATSAPP_NUMBER e o mesmo numero da instancia Barbearia (owner).'
  Write-Host 'Use OUTRO celular fisico para enviar as 6 mensagens ao WhatsApp Business.'
  Write-Host 'Depois: .\scripts\qa-evolution-booking-multiturn-e2e.ps1 -SkipPromptSend -PollSeconds 600'
  exit 2
}

if ($SkipPromptSend -and $qaPhone -and $ownerPhone -and ($qaPhone -eq $ownerPhone)) {
  Write-Host '  [INFO] SkipPromptSend: monitorando inbound de qualquer celular (owner=QA no .env).'
}

if (-not $qaPhone) {
  Write-Host 'WARN - QA_WHATSAPP_NUMBER nao definido; monitora qualquer inbound novo.'
}

$msgBefore = [int](Invoke-Psql 'SELECT count(*) FROM messages WHERE direction=''in'';')
$apptBefore = [int](Invoke-Psql 'SELECT count(*) FROM appointments;')
$maxExecBefore = [int](Invoke-Psql 'SELECT COALESCE(max(id),0) FROM execution_entity;')

Write-Host ''
Write-Host ('Baseline: inbound=' + $msgBefore + ' appointments=' + $apptBefore)

if (-not $SkipPromptSend -and $qaPhone) {
  $steps = ($ExpectedReplies | ForEach-Object { '- ' + $_ }) -join "`n"
  $prompt = @"
[E2E Booking Real] Ola! Teste de agendamento multi-turn.

Responda ESTE chat (Barbearia), uma mensagem por vez, nesta ordem:

$steps

Aguardamos suas respostas para validar o fluxo completo.
"@

  Write-Host ''
  Write-Host ('==> Enviando instrucoes Evolution -> celular QA (***' + $qaPhone.Substring([Math]::Max(0, $qaPhone.Length - 4)) + ')')
  $body = @{ number = $qaPhone; text = $prompt } | ConvertTo-Json -Compress
  try {
    $send = Invoke-RestMethod -Method Post -Uri "$EvolutionUrl/message/sendText/$instance" -Headers $evoHeaders -Body $body -TimeoutSec 45
    Add-Check 'Evolution SendText instrucoes' $true ('status=' + $send.status)
  } catch {
    Add-Check 'Evolution SendText instrucoes' $false $_.Exception.Message
    exit 1
  }
}

Write-Host ''
Write-Host ('==> Monitorando ' + $ExpectedReplies.Count + ' respostas reais por ' + $PollSeconds + 's...')
$deadline = (Get-Date).AddSeconds($PollSeconds)
$targetInbound = $msgBefore + $ExpectedReplies.Count
$bookingDone = $false

while ((Get-Date) -lt $deadline) {
  $msgNow = [int](Invoke-Psql 'SELECT count(*) FROM messages WHERE direction=''in'';')
  $apptNow = [int](Invoke-Psql 'SELECT count(*) FROM appointments;')

  if ($apptNow -gt $apptBefore) {
    $bookingDone = $true
    Write-Host ('    [+] Novo agendamento detectado (total=' + $apptNow + ')')
    break
  }

  if ($msgNow -ge $targetInbound) {
    Write-Host ('    [+] ' + $ExpectedReplies.Count + ' inbound(s) novos detectados')
    break
  }

  $remaining = [math]::Max(0, [int]($deadline - (Get-Date)).TotalSeconds)
  Write-Host ('    ... aguardando (' + $remaining + 's) inbound=' + $msgNow + '/' + $targetInbound)
  Start-Sleep -Seconds $PollInterval
}

Write-Host ''
Write-Host '==> Aguardar WF02 processar ultima mensagem (90s)...'
Start-Sleep -Seconds 90

Write-Host '==> Validacao pos-fluxo'

$msgAfter = [int](Invoke-Psql 'SELECT count(*) FROM messages WHERE direction=''in'';')
$newInbound = ($msgAfter -gt $msgBefore)
Add-Check 'Inbound real recebido' $newInbound ('before=' + $msgBefore + ' after=' + $msgAfter)

$lastBodies = Invoke-Psql 'SELECT left(body,80) FROM messages WHERE direction=''in'' ORDER BY created_at DESC LIMIT 6;'
if ($lastBodies) {
  Write-Host '  Ultimas mensagens inbound:'
  $lastBodies -split "`n" | ForEach-Object { if ($_.Trim()) { Write-Host ('    > ' + $_.Trim()) } }
}

$execSql = 'SELECT id, status FROM execution_entity WHERE "workflowId"=''' + $wf02Id + ''' ORDER BY "startedAt" DESC LIMIT 1;'
$exec = Invoke-Psql $execSql
Add-Check 'WF02 ultima exec' ($exec -match 'success') $exec

$apptSql = 'SELECT a.id::text, a.status, a.starts_at::text, s.name, p.name, c.phone FROM appointments a JOIN customers c ON c.id=a.customer_id AND c.tenant_id=a.tenant_id LEFT JOIN services s ON s.id=a.service_id LEFT JOIN professionals p ON p.id=a.professional_id ORDER BY a.created_at DESC LIMIT 1;'
$appt = Invoke-Psql $apptSql
Write-Host ('  ultimo agendamento: ' + $appt)

$outbox = Invoke-Psql 'SELECT status, left(payload::text,140) FROM message_outbox ORDER BY created_at DESC LIMIT 1;'
Write-Host ('  outbox: ' + $outbox)

$apptAfter = [int](Invoke-Psql 'SELECT count(*) FROM appointments;')
$created = ($apptAfter -gt $apptBefore) -or $bookingDone
Add-Check 'Agendamento criado' $created ('before=' + $apptBefore + ' after=' + $apptAfter)

if ($newInbound -and $created -and ($exec -match 'success')) {
  Write-Host ''
  Write-Host 'PASS - E2E Evolution booking multi-turn (mensagem real) validado.'
  exit 0
}

if (-not $newInbound) {
  Write-Host ''
  Write-Host 'BLOCKED - Nenhuma mensagem real recebida no prazo.'
  Write-Host 'De OUTRO celular (nao o WhatsApp Business), envie as 6 mensagens para Barbearia.'
  Write-Host 'Reexecute: .\scripts\qa-evolution-booking-multiturn-e2e.ps1 -SkipPromptSend -PollSeconds 600'
  exit 2
}

Write-Host ''
Write-Host 'PARTIAL - Inbound OK; conferir agendamento e outbox no n8n/Core.'
exit 1
