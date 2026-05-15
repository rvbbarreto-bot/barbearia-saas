#requires -Version 5.1
<#
.SYNOPSIS
  P2.3 — Bateria operação assistida (matriz CT-P2-300 … CT-P2-334).

.DESCRIPTION
  300 Health | 301 DB health | 302 Migration dry-run (npm na raiz) |
  310 Webhook inbound válido | 311 Inbound duplicado | 312 Inbound texto intenção (agendar) |
  313 Availability | 314 Appointment create+confirm | 315 Outbox confirmação (lista) |
  316 Outbox pending com rastreio (last_error tolerado QA) | 317 Retry attendant negado (403 RBAC) |
  318 Auditoria operacional list | 319 Filtro event_type appointment_created |
  320 Reminder D-1 job (SQL Docker) | 321 Re-schedule mantém lembrete coerente | 322 Cancel remove lembretes pendentes |
  330 Portal HTTP (/) | 331 Portal rota SPA | 332 Regressão P1 | 333 P2.1 | 334 P2.2.1

  Pré-requisitos: API + Postgres Docker; seed 099 (`demo-qa-inbound`, `demo_webhook_token_change_me`).
  CT 320–322 exigem `docker compose exec postgres` (parâmetro -SkipDockerDbChecks para SKIP).
  Saída: docs/QA_API_P2_3_OPERATIONAL_ASSISTED_RESULTS.csv
#>
param(
  [string] $ApiBase = 'http://localhost:3000',
  [string] $WebBase = 'http://localhost:3001',
  [string] $TenantId = '00000000-0000-0000-0000-000000000001',
  [string] $ProfessionalId = '00000000-0000-4000-8000-000000004012',
  [string] $ServiceId = '00000000-0000-4000-8000-000000004022',
  [string] $CustomerId = '00000000-0000-4000-8000-000000004031',
  [string] $InstanceKey = 'demo-qa-inbound',
  [string] $WebhookToken = 'demo_webhook_token_change_me',
  [switch] $SkipDockerDbChecks
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Read-DotEnvValue([string] $Key) {
  $p = Join-Path $RepoRoot '.env'
  if (-not (Test-Path -LiteralPath $p)) { return $null }
  foreach ($line in Get-Content -LiteralPath $p) {
    if ($line -match '^\s*#') { continue }
    $pat = '^\s*' + [regex]::Escape($Key) + '\s*=\s*(.+)\s*$'
    if ($line -match $pat) { return $matches[1].Trim() }
  }
  return $null
}
$script:PgUser = Read-DotEnvValue 'POSTGRES_USER'
if (-not $script:PgUser) { $script:PgUser = 'barbearia' }
$script:PgDb = Read-DotEnvValue 'POSTGRES_DB'
if (-not $script:PgDb) { $script:PgDb = 'barbearia_saas' }

$script:Failed = $false
$script:Rows = New-Object System.Collections.Generic.List[string]

function Escape-Csv([string] $s) {
  if ($null -eq $s) { return '""' }
  $t = $s -replace "`r`n", ' ' -replace "`n", ' ' -replace '"', '""'
  if ($t.Length -gt 8000) { $t = $t.Substring(0, 8000) + '…' }
  return "`"$t`""
}

function Write-ResultRow([string] $CaseId, [int] $Expected, [int] $Actual, [string] $Body) {
  $ok = ($Expected -eq $Actual)
  if (-not $ok) { $script:Failed = $true }
  $line = "$(Escape-Csv $CaseId),$Expected,$Actual,$(if ($ok) { 'PASS' } else { 'FAIL' }),$(Escape-Csv $Body)"
  $script:Rows.Add($line)
}

function Invoke-ApiRaw {
  param(
    [string] $Method,
    [string] $Url,
    [hashtable] $Headers = @{},
    [string] $JsonBody = $null
  )
  $params = @{
    Uri             = $Url
    Method          = $Method
    UseBasicParsing = $true
  }
  if ($Headers.Count -gt 0) { $params.Headers = [hashtable]::new($Headers) }
  $verb = $Method.ToUpperInvariant()
  $canHaveBody = $verb -in @('POST', 'PUT', 'PATCH', 'DELETE')
  if ($canHaveBody -and ($null -ne $JsonBody) -and ($JsonBody -ne '')) {
    $params.ContentType = 'application/json; charset=utf-8'
    if ($PSVersionTable.PSVersion.Major -lt 6) {
      $params.Body = [System.Text.Encoding]::UTF8.GetBytes($JsonBody)
    }
    else { $params.Body = $JsonBody }
  }
  if ($PSVersionTable.PSVersion.Major -ge 6) {
    $params.SkipHttpErrorCheck = $true
    $resp = Invoke-WebRequest @params
    return @{ Code = [int]$resp.StatusCode; Body = $resp.Content }
  }
  try {
    $resp = Invoke-WebRequest @params -ErrorAction Stop
    return @{ Code = [int]$resp.StatusCode; Body = $resp.Content }
  }
  catch {
    $ex = $_.Exception
    if ($ex.Response) {
      $code = [int]$ex.Response.StatusCode
      $stream = $ex.Response.GetResponseStream()
      if ($null -ne $stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $text = $reader.ReadToEnd()
        return @{ Code = $code; Body = $text }
      }
      return @{ Code = $code; Body = $ex.Message }
    }
    throw
  }
}

function Login-Token([string] $Email, [string] $Password) {
  $j = (@{ email = $Email; password = $Password } | ConvertTo-Json -Compress)
  $maxAttempts = 5
  $delaySec = 65
  for ($a = 1; $a -le $maxAttempts; $a++) {
    $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/auth/login" -JsonBody $j
    if ($r.Code -eq 200) {
      $o = $r.Body | ConvertFrom-Json
      return [string]$o.access_token
    }
    if ($r.Code -eq 429 -and $a -lt $maxAttempts) {
      Write-Host "Login rate limit ($Email); pausa ${delaySec}s ($a/$maxAttempts)..." -ForegroundColor DarkYellow
      Start-Sleep -Seconds $delaySec
      continue
    }
    throw "Login falhou ($Email): HTTP $($r.Code) $($r.Body)"
  }
  throw "Login falhou ($Email): tentativas esgotadas"
}

function Next-WeekdayDate([int] $MinDaysAhead) {
  $d = [DateTime]::UtcNow.Date.AddDays($MinDaysAhead)
  while ($d.DayOfWeek -eq [DayOfWeek]::Sunday) { $d = $d.AddDays(1) }
  return $d.ToString('yyyy-MM-dd')
}

function Get-AvailabilitySlots([hashtable] $AuthHeaders, [string] $DateStr) {
  $url = "$ApiBase/api/v1/availability?professional_id=$ProfessionalId&service_id=$ServiceId&date=$DateStr&min_advance_minutes=0&max_slots=50"
  $r = Invoke-ApiRaw -Method Get -Url $url -Headers $AuthHeaders
  if ($r.Code -ne 200) { throw "Availability falhou: HTTP $($r.Code) $($r.Body)" }
  $o = $r.Body | ConvertFrom-Json
  return @($o.slots)
}

function Format-ApiInstant([object] $Value) {
  if ($null -eq $Value) { throw 'Format-ApiInstant: valor nulo' }
  if ($Value -is [datetime]) {
    return $Value.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  }
  $s = [string]$Value
  if ($s.Length -ge 19 -and $s[4] -eq '-') { return $s }
  throw "Format-ApiInstant: formato não suportado ($s)"
}

function Invoke-WebhookInbound([hashtable] $BodyObj, [string] $ExtId) {
  $h = @{}
  foreach ($k in $BodyObj.Keys) { $h[$k] = $BodyObj[$k] }
  $h['external_message_id'] = $ExtId
  $json = ($h | ConvertTo-Json -Compress)
  $hdr = @{
    'x-webhook-instance' = $InstanceKey
    'x-webhook-token'    = $WebhookToken
  }
  return Invoke-ApiRaw -Method Post -Url "$ApiBase/webhooks/whatsapp/inbound" -Headers $hdr -JsonBody $json
}

function Docker-PsqlScalar([string] $Sql) {
  try {
    $u = $script:PgUser
    $d = $script:PgDb
    $out = & docker compose exec -T postgres psql -U $u -d $d -t -A -c $Sql 2>&1
    if ($LASTEXITCODE -ne 0) { return $null }
    $s = if ($out -is [array]) { ($out | Out-String) } else { [string]$out }
    return $s.Trim()
  }
  catch {
    return $null
  }
}

$script:Rows.Add('case_id,expected_http,actual_http,result,response_body')

# --- CT-P2-300 / 301 ---
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/health"
Write-ResultRow 'CT-P2-300' 200 $r.Code $r.Body

$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/database/health"
Write-ResultRow 'CT-P2-301' 200 $r.Code $r.Body

# --- CT-P2-302 dry-run ---
try {
  $dry = & npm run db:migrate:dry-run 2>&1 | Out-String
  $de = if ($LASTEXITCODE -eq 0) { 200 } else { 500 }
}
catch { $dry = $_.Exception.Message; $de = 500 }
Write-ResultRow 'CT-P2-302' 200 $de $dry

# --- CT-P2-332 / 333 / 334 regressões (primeiro: evita esgotar slots antes das baterias longas) ---
try {
  & "$PSScriptRoot\qa-api-negative-battery.ps1" -BaseUrl $ApiBase | Out-Null
  $n1 = $LASTEXITCODE
}
catch { $n1 = 1 }
Write-ResultRow 'CT-P2-332' 200 $(if ($n1 -eq 0) { 200 } else { 500 }) "qa-api-negative-battery exit=$n1"

try {
  & "$PSScriptRoot\qa-api-p2-operational-battery.ps1" -ApiBase $ApiBase | Out-Null
  $n2 = $LASTEXITCODE
}
catch { $n2 = 1 }
Write-ResultRow 'CT-P2-333' 200 $(if ($n2 -eq 0) { 200 } else { 500 }) "qa-api-p2-operational-battery exit=$n2"

try {
  & "$PSScriptRoot\qa-p2-2-web-outbox-whatsapp-battery.ps1" -ApiBase $ApiBase | Out-Null
  $n3 = $LASTEXITCODE
}
catch { $n3 = 1 }
Write-ResultRow 'CT-P2-334' 200 $(if ($n3 -eq 0) { 200 } else { 500 }) "qa-p2-2-web-outbox-whatsapp-battery exit=$n3"

# --- CT-P2-310 / 311 / 312 webhook ---
$ext310 = "qa-p23-$([Guid]::NewGuid().ToString('N'))"
$bodyWh = @{
  phone   = '+5511999999001'
  name    = 'QA P2.3'
  message = 'Olá'
}
$r = Invoke-WebhookInbound $bodyWh $ext310
Write-ResultRow 'CT-P2-310' 200 $r.Code $r.Body

$r2 = Invoke-WebhookInbound $bodyWh $ext310
$dupOk = ($r2.Code -eq 200) -and (($r2.Body | ConvertFrom-Json).duplicate -eq $true)
Write-ResultRow 'CT-P2-311' 200 $(if ($dupOk) { 200 } else { $r2.Code }) $r2.Body

$ext312 = "qa-p23-int-$([Guid]::NewGuid().ToString('N'))"
$bodyInt = @{
  phone   = '+5511999999002'
  name    = 'QA Intenção'
  message = 'Quero agendar um horário para barba amanhã'
}
$r = Invoke-WebhookInbound $bodyInt $ext312
Write-ResultRow 'CT-P2-312' 200 $r.Code $r.Body

# --- CT-P2-313 … 315 (API autenticada) ---
$tokAtt = Login-Token 'atendente@demo.local' 'admin12345'
$hdrOk = @{ Authorization = "Bearer $tokAtt"; 'x-tenant-id' = $TenantId }

$dateStr = $null
$slots = @()
for ($i = 14; $i -le 45; $i += 5) {
  $tryDate = Next-WeekdayDate $i
  $slots = Get-AvailabilitySlots $hdrOk $tryDate
  if ($slots.Count -ge 6) { $dateStr = $tryDate; break }
}
if (-not $dateStr) { throw 'Sem slots para CT-P2-313' }

$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/availability?professional_id=$ProfessionalId&service_id=$ServiceId&date=$dateStr&min_advance_minutes=0&max_slots=20" -Headers $hdrOk
Write-ResultRow 'CT-P2-313' 200 $r.Code $r.Body

$s0 = $slots[0]
$idem = "qa-p23-appt-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$bodyA = (@{
    customer_id             = $CustomerId
    professional_id         = $ProfessionalId
    service_id              = $ServiceId
    starts_at               = (Format-ApiInstant $s0.starts_at)
    ends_at                 = (Format-ApiInstant $s0.ends_at)
    source                   = 'api'
    idempotency_key         = $idem
    explicit_confirmation   = $true
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrOk -JsonBody $bodyA
Write-ResultRow 'CT-P2-314' 201 $r.Code $r.Body
$apptId = $null
if ($r.Code -eq 201) { $apptId = ([string](($r.Body | ConvertFrom-Json).id)) }

if ($apptId) {
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$apptId/confirm" -Headers $hdrOk -JsonBody '{}'
  if ($r.Code -ne 200) { throw "Confirm falhou: $($r.Code) $($r.Body)" }
}

$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/outbox/messages?page=1&limit=30" -Headers $hdrOk
$ob = $r.Body
$hasConfirm = ($ob -match 'appointment_confirm')
Write-ResultRow 'CT-P2-315' 200 $(if ($r.Code -eq 200 -and $hasConfirm) { 200 } else { 500 }) $(if (-not $hasConfirm) { 'outbox sem appointment_confirm' } else { 'ok' })

# --- CT-P2-316: lista outbox com estados QA (pending + last_error tolerado) ---
$ok316 = ($r.Code -eq 200) -and ($ob -match 'pending')
Write-ResultRow 'CT-P2-316' 200 $(if ($ok316) { 200 } else { 500 }) $(if ($ok316) { 'lista outbox com pending' } else { $ob })

# --- CT-P2-317 attendant retry (sem permissão manager) -> 403 ---
$firstId = $null
if ($r.Code -eq 200) {
  try {
    $odata = $ob | ConvertFrom-Json
    if ($odata.data -and $odata.data.Count -gt 0) { $firstId = [string]$odata.data[0].id }
  }
  catch { }
}
if ($firstId) {
  $rx = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/outbox/messages/$firstId/retry" -Headers $hdrOk -JsonBody '{}'
  Write-ResultRow 'CT-P2-317' 403 $rx.Code $rx.Body
}
else {
  Write-ResultRow 'CT-P2-317' 599 599 'SKIP: sem id outbox na listagem'
}

# --- CT-P2-318 / 319 operational audit (canonical + alias) ---
$r318 = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/operational-audit-events?limit=10" -Headers $hdrOk
if ($r318.Code -eq 404) {
  $r318 = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/operational-audit/events?limit=10" -Headers $hdrOk
}
Write-ResultRow 'CT-P2-318' 200 $r318.Code $r318.Body

$r319 = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/operational-audit-events?event_type=appointment_created&limit=5" -Headers $hdrOk
if ($r319.Code -eq 404) {
  $r319 = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/operational-audit/events?event_type=appointment_created&limit=5" -Headers $hdrOk
}
Write-ResultRow 'CT-P2-319' 200 $r319.Code $r319.Body

# --- CT-P2-320–322 notification_jobs (Docker) ---
if ($SkipDockerDbChecks -or -not $apptId) {
  Write-ResultRow 'CT-P2-320' 200 599 'SKIP: Docker ou appointment ausente'
  Write-ResultRow 'CT-P2-321' 200 599 'SKIP'
  Write-ResultRow 'CT-P2-322' 200 599 'SKIP'
}
else {
  $escId = $apptId.Replace("'", "''")
  $sqlC = "SELECT COUNT(*)::text FROM notification_jobs WHERE tenant_id='$TenantId' AND appointment_id='$escId'::uuid AND job_type='reminder_d1' AND status='pending'"
  $c320 = Docker-PsqlScalar $sqlC
  $n320 = 0
  if ($null -ne $c320) { [void][int]::TryParse($c320.Trim(), [ref]$n320) }
  Write-ResultRow 'CT-P2-320' 200 $(if ($n320 -ge 1) { 200 } else { 500 }) "reminder_d1 pending count=$c320"

  # reschedule para outro slot livre
  $slots2 = Get-AvailabilitySlots $hdrOk $dateStr
  $t1 = $slots2 | Where-Object { (Format-ApiInstant $_.starts_at) -ne (Format-ApiInstant $s0.starts_at) } | Select-Object -First 1
  if ($t1) {
    $rsB = (@{
        starts_at = (Format-ApiInstant $t1.starts_at)
        ends_at   = (Format-ApiInstant $t1.ends_at)
        reason    = 'QA P2.3 reschedule reminder idempotency'
      } | ConvertTo-Json -Compress)
    $null = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$apptId/reschedule" -Headers $hdrOk -JsonBody $rsB
  }
  $c321 = Docker-PsqlScalar $sqlC
  $n321 = 0
  if ($null -ne $c321) { [void][int]::TryParse($c321.Trim(), [ref]$n321) }
  Write-ResultRow 'CT-P2-321' 200 $(if ($n321 -eq 1) { 200 } else { 500 }) "reminder_d1 after reschedule count=$c321"

  $canBody = (@{ reason = 'QA P2.3 cancel for reminder cleanup' } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$apptId/cancel" -Headers $hdrOk -JsonBody $canBody
  Start-Sleep -Milliseconds 300
  $c322 = Docker-PsqlScalar $sqlC
  $n322 = 99
  if ($null -ne $c322) { [void][int]::TryParse($c322.Trim(), [ref]$n322) }
  Write-ResultRow 'CT-P2-322' 200 $(if ($n322 -eq 0) { 200 } else { 500 }) "reminder_d1 pending after cancel count=$c322"
}

# --- CT-P2-330 / 331 portal smoke (HTTP) ---
try {
  $w0 = Invoke-WebRequest -Uri $WebBase -UseBasicParsing -TimeoutSec 15
  Write-ResultRow 'CT-P2-330' 200 $w0.StatusCode 'portal root'
}
catch {
  Write-ResultRow 'CT-P2-330' 200 500 $_.Exception.Message
}
try {
  $w1 = Invoke-WebRequest -Uri "$WebBase/operacao/agenda" -UseBasicParsing -TimeoutSec 15
  Write-ResultRow 'CT-P2-331' 200 $w1.StatusCode 'agenda route'
}
catch {
  Write-ResultRow 'CT-P2-331' 200 500 $_.Exception.Message
}

$outPath = Join-Path $RepoRoot 'docs\QA_API_P2_3_OPERATIONAL_ASSISTED_RESULTS.csv'
$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllLines($outPath, $script:Rows, $utf8Bom)
Write-Host "CSV escrito: $outPath" -ForegroundColor Green

if ($script:Failed) {
  Write-Host 'Bateria P2.3: FALHA.' -ForegroundColor Red
  exit 1
}
Write-Host 'Bateria P2.3: OK.' -ForegroundColor Green
exit 0
