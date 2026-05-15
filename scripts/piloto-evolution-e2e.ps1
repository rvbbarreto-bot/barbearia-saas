#requires -Version 5.1
<#
.SYNOPSIS
  PILOTO-STAGING-01 — validação E2E Agenda → Outbox → Worker → Evolution.

.DESCRIPTION
  Pré-requisitos (máquina do operador, NÃO versionar segredos):
  - `docker compose up` (API, Postgres, Redis)
  - Evolution API acessível do container API (ex.: http://host.docker.internal:8081)
  - `.env` na raiz com EVOLUTION_API_URL, EVOLUTION_INSTANCE, EVOLUTION_API_KEY
  - Instância Evolution conectada (connectionStatus=open)
  - Telefone do cliente QA alinhado ao WhatsApp de teste (UPDATE customers.phone local)

  Saída: docs/evidencias/piloto_staging_01/28_evolution_e2e_log.txt (sem API keys)
#>
param(
  [string] $ApiBase = 'http://localhost:3000',
  [string] $TenantId = '00000000-0000-0000-0000-000000000001',
  [string] $CustomerId = '00000000-0000-4000-8000-000000004031',
  [string] $ProfessionalId = '00000000-0000-4000-8000-000000004012',
  [string] $ServiceId = '00000000-0000-4000-8000-000000004022',
  [int] $OutboxPollSeconds = 90
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$evidenceDir = Join-Path $root 'docs\evidencias\piloto_staging_01'
$logPath = Join-Path $evidenceDir '28_evolution_e2e_log.txt'
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null

$log = New-Object System.Collections.Generic.List[string]
function Log([string] $msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  $log.Add($line)
  Write-Host $line
}

function Redact-Secrets([string] $s) {
  if ($null -eq $s) { return '' }
  $t = $s
  $t = $t -replace '(?i)(apikey|authorization|bearer)\s*[:=]\s*["'']?[^"''\s,}]+', '$1=***'
  $t = $t -replace '(?i)"apikey"\s*:\s*"[^"]+"', '"apikey":"***"'
  return $t
}

function Invoke-ApiRaw {
  param([string] $Method, [string] $Url, [hashtable] $Headers = @{}, [string] $JsonBody = $null)
  $params = @{ Uri = $Url; Method = $Method; UseBasicParsing = $true }
  if ($Headers.Count -gt 0) { $params.Headers = [hashtable]::new($Headers) }
  if ($Method.ToUpperInvariant() -in @('POST','PUT','PATCH') -and $JsonBody) {
    $params.ContentType = 'application/json; charset=utf-8'
    if ($PSVersionTable.PSVersion.Major -lt 6) { $params.Body = [System.Text.Encoding]::UTF8.GetBytes($JsonBody) }
    else { $params.Body = $JsonBody }
  }
  if ($PSVersionTable.PSVersion.Major -ge 6) {
    $resp = Invoke-WebRequest @params -SkipHttpErrorCheck
    return @{ Code = [int]$resp.StatusCode; Body = $resp.Content }
  }
  try {
    $resp = Invoke-WebRequest @params -ErrorAction Stop
    return @{ Code = [int]$resp.StatusCode; Body = $resp.Content }
  } catch {
    if ($_.Exception.Response) {
      $code = [int]$_.Exception.Response.StatusCode
      $stream = $_.Exception.Response.GetResponseStream()
      $text = if ($stream) { (New-Object IO.StreamReader($stream)).ReadToEnd() } else { $_.Exception.Message }
      return @{ Code = $code; Body = $text }
    }
    throw
  }
}

function Login-Token([string] $Email) {
  $j = (@{ email = $Email; password = 'admin12345' } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/auth/login" -JsonBody $j
  if ($r.Code -ne 200) { throw "Login $Email falhou HTTP $($r.Code)" }
  return [string](($r.Body | ConvertFrom-Json).access_token)
}

function Format-ApiInstant($iso) {
  $dt = [DateTimeOffset]::Parse($iso)
  return $dt.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
}

function Next-WeekdayDate([int] $MinDaysAhead) {
  $d = [DateTime]::UtcNow.Date.AddDays($MinDaysAhead)
  while ($d.DayOfWeek -eq 'Sunday') { $d = $d.AddDays(1) }
  return $d.ToString('yyyy-MM-dd')
}

Log "=== PILOTO Evolution E2E ==="
Log "ApiBase=$ApiBase TenantId=$TenantId"
Log "HEAD=$(git -C $root rev-parse HEAD 2>$null)"
Log "Branch=$(git -C $root rev-parse --abbrev-ref HEAD 2>$null)"

# Preflight Evolution (dentro do container API, se existir)
try {
  $evoCheck = docker exec barbearia-api wget -qO- http://host.docker.internal:8081 2>$null
  if ($evoCheck) {
    Log "Preflight Evolution (container): HTTP body length=$($evoCheck.Length) (host.docker.internal:8081)"
  }
} catch {
  Log "Preflight Evolution (container): SKIP - $($_.Exception.Message)"
}

$tokAdmin = Login-Token 'admin@demo.local'
$tokAtt = Login-Token 'atendente@demo.local'
$tokMgr = Login-Token 'admin@demo.local'
$hdrAdmin = @{ Authorization = "Bearer $tokAdmin"; 'x-tenant-id' = $TenantId }
$hdrAtt = @{ Authorization = "Bearer $tokAtt"; 'x-tenant-id' = $TenantId }
$hdrMgr = @{ Authorization = "Bearer $tokMgr"; 'x-tenant-id' = $TenantId }

$dateStr = Next-WeekdayDate 3
$avUrl = ('{0}/api/v1/availability?professional_id={1}&service_id={2}&date={3}' -f $ApiBase, $ProfessionalId, $ServiceId, $dateStr)
$r = Invoke-ApiRaw -Method Get -Url $avUrl -Headers $hdrAdmin
if ($r.Code -ne 200) { throw "Availability falhou HTTP $($r.Code)" }
$slots = @(($r.Body | ConvertFrom-Json).slots)
if ($slots.Count -lt 1) { throw 'Sem slots disponíveis' }
$s0 = $slots[0]

$idem = "piloto-evo-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$createBody = (@{
  customer_id = $CustomerId
  professional_id = $ProfessionalId
  service_id = $ServiceId
  starts_at = (Format-ApiInstant $s0.starts_at)
  ends_at = (Format-ApiInstant $s0.ends_at)
  source = 'api'
  idempotency_key = $idem
  explicit_confirmation = $true
} | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrAdmin -JsonBody $createBody
Log "POST appointment HTTP $($r.Code)"
if ($r.Code -ne 201) { throw "Create appointment: $($r.Body)" }
$apptId = [string](($r.Body | ConvertFrom-Json).id)
Log "appointment_id=$apptId correlation_id (agendamento)=$apptId"

$r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$apptId/confirm" -Headers $hdrAdmin -JsonBody '{}'
Log "PATCH confirm HTTP $($r.Code)"
if ($r.Code -ne 200) { throw "Confirm: $($r.Body)" }

Log 'Aguardando notification-jobs-worker (ate 35s)...'
Start-Sleep -Seconds 35

$deadline = (Get-Date).AddSeconds($OutboxPollSeconds)
$outboxMsg = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  $listUrl = ('{0}/api/v1/outbox/messages?limit=20&page=1' -f $ApiBase)
  $r = Invoke-ApiRaw -Method Get -Url $listUrl -Headers $hdrAdmin
  if ($r.Code -ne 200) { continue }
  $list = ($r.Body | ConvertFrom-Json).data
  $match = @($list) | Where-Object { [string]$_.correlation_id -eq $apptId } | Select-Object -First 1
  if ($match) {
    $outboxMsg = $match
    Log "Outbox id=$($match.id) status=$($match.status) attempts=$($match.attempts) correlation_id=$($match.correlation_id)"
    if ($match.status -eq 'sent') { break }
    if ($match.status -eq 'dead') { throw "Outbox dead: $($match.last_error)" }
  }
}
if (-not $outboxMsg) { throw 'Outbox: nenhuma mensagem encontrada no prazo' }
if ($outboxMsg.status -ne 'sent') {
  throw "Outbox nao chegou a sent em ${OutboxPollSeconds}s (status=$($outboxMsg.status) error=$($outboxMsg.last_error))"
}

$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/outbox/messages/$($outboxMsg.id)" -Headers $hdrAdmin
$detail = $r.Body | ConvertFrom-Json
$prov = if ($detail.provider_response) { ($detail.provider_response | ConvertTo-Json -Compress) } else { 'null' }
Log "provider_response (redacted): $(Redact-Secrets $prov)"

# Retry RBAC
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/outbox/messages/$($outboxMsg.id)/retry" -Headers $hdrAtt
Log "Retry attendant HTTP $($r.Code) (esperado 403)"
if ($r.Code -ne 403) { throw "Retry attendant deveria 403, obteve $($r.Code)" }

$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/outbox/messages/$($outboxMsg.id)/retry" -Headers $hdrMgr
Log "Retry admin/manager HTTP $($r.Code) (esperado 200)"
if ($r.Code -ne 200) { throw "Retry manager falhou $($r.Code) $($r.Body)" }

Log '=== E2E OK ==='
$log | ForEach-Object { $_ } | Set-Content -Path $logPath -Encoding UTF8
Write-Host "Log: $logPath" -ForegroundColor Green
exit 0
