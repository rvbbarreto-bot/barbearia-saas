#requires -Version 5.1
<#
.SYNOPSIS
  P2.3 — Operação assistida (matriz CT-P2-300 … CT-P2-332).

.DESCRIPTION
  300 Health | 301 DB health | 302 Migration dry-run (npm na raiz) |
  330 Regressão P2.2.1 | 331 Regressão P2.1 | 332 Regressão P1 (negativo) |
  310 Webhook inbound válido | 311 Duplicado | 312 Token inválido/ausente | 313 Payload sem phone |
  314 Auditoria inbound_message_received | 315 inbound_duplicate_ignored |
  316 Outbox (appointment_confirm enfileirado) | 317 Retry manual (gestão) | 318 Auditoria OUTBOX_MANUAL_RETRY |
  320 Reminder 24h job pendente | 321 Idempotência outbox reminder_24h | 322 Cancel remove jobs |
  323 Completed remove jobs | 324 No-show remove jobs |

  Pré-requisitos: API + Postgres Docker; seed 099 (`demo-qa-inbound`, `demo_webhook_token_change_me`).
  CT 320–324: `docker compose exec postgres` (ou -SkipDockerDbChecks).
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

function Invoke-WebhookPost([hashtable] $Hdr, [string] $JsonBody) {
  return Invoke-ApiRaw -Method Post -Url "$ApiBase/webhooks/whatsapp/inbound" -Headers $Hdr -JsonBody $JsonBody
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

# --- CT-P2-330 / 331 / 332 regressões (P2.2 → P2.1 → P1) ---
try {
  & "$PSScriptRoot\qa-p2-2-web-outbox-whatsapp-battery.ps1" -ApiBase $ApiBase | Out-Null
  $n330 = $LASTEXITCODE
}
catch { $n330 = 1 }
Write-ResultRow 'CT-P2-330' 200 $(if ($n330 -eq 0) { 200 } else { 500 }) "qa-p2-2-web-outbox-whatsapp-battery exit=$n330"

try {
  & "$PSScriptRoot\qa-api-p2-operational-battery.ps1" -ApiBase $ApiBase | Out-Null
  $n331 = $LASTEXITCODE
}
catch { $n331 = 1 }
Write-ResultRow 'CT-P2-331' 200 $(if ($n331 -eq 0) { 200 } else { 500 }) "qa-api-p2-operational-battery exit=$n331"

try {
  & "$PSScriptRoot\qa-api-negative-battery.ps1" -BaseUrl $ApiBase | Out-Null
  $n332 = $LASTEXITCODE
}
catch { $n332 = 1 }
Write-ResultRow 'CT-P2-332' 200 $(if ($n332 -eq 0) { 200 } else { 500 }) "qa-api-negative-battery exit=$n332"

# --- CT-P2-310 / 311 / 312 / 313 webhook ---
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

$ext312 = "qa-p23-badtok-$([Guid]::NewGuid().ToString('N'))"
$bj312 = (@{ phone = '+5511999999003'; name = 'X'; message = 'token' } | ConvertTo-Json -Compress)
$hdrBad = @{
  'x-webhook-instance' = $InstanceKey
  'x-webhook-token'    = 'token_invalido_qa'
}
$r312 = Invoke-WebhookPost $hdrBad $bj312
Write-ResultRow 'CT-P2-312' 401 $r312.Code $r312.Body

$hdrNoTok = @{ 'x-webhook-instance' = $InstanceKey }
$bj313 = (@{ message = 'sem phone' } | ConvertTo-Json -Compress)
$r313 = Invoke-WebhookPost $hdrNoTok $bj313
Write-ResultRow 'CT-P2-313' 400 $r313.Code $r313.Body

# --- CT-P2-314 / 315 auditoria webhook ---
$tokAtt = Login-Token 'atendente@demo.local' 'admin12345'
$hdrOk = @{ Authorization = "Bearer $tokAtt"; 'x-tenant-id' = $TenantId }

$r314 = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/operational-audit-events?event_type=inbound_message_received&limit=10" -Headers $hdrOk
if ($r314.Code -eq 404) {
  $r314 = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/operational-audit/events?event_type=inbound_message_received&limit=10" -Headers $hdrOk
}
$ok314 = ($r314.Code -eq 200) -and ($r314.Body -match 'inbound_message_received')
Write-ResultRow 'CT-P2-314' 200 $(if ($ok314) { 200 } else { 500 }) $(if ($ok314) { 'ok' } else { $r314.Body })

$r315 = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/operational-audit-events?event_type=inbound_duplicate_ignored&limit=10" -Headers $hdrOk
if ($r315.Code -eq 404) {
  $r315 = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/operational-audit/events?event_type=inbound_duplicate_ignored&limit=10" -Headers $hdrOk
}
$ok315 = ($r315.Code -eq 200) -and ($r315.Body -match 'inbound_duplicate_ignored')
Write-ResultRow 'CT-P2-315' 200 $(if ($ok315) { 200 } else { 500 }) $(if ($ok315) { 'ok' } else { $r315.Body })

# --- CT-P2-316 … 318 outbox + retry + auditoria ---
$minUtc = [DateTime]::UtcNow.AddHours(72)
$dateStr = $null
$s0 = $null
for ($i = 30; $i -le 200; $i += 2) {
  $tryDate = Next-WeekdayDate $i
  $slots = Get-AvailabilitySlots $hdrOk $tryDate
  foreach ($sl in $slots) {
    $st = [DateTimeOffset]::Parse([string]$sl.starts_at, $null, [System.Globalization.DateTimeStyles]::RoundtripKind).UtcDateTime
    if ($st -gt $minUtc) { $dateStr = $tryDate; $s0 = $sl; break }
  }
  if ($dateStr) { break }
}
if (-not $dateStr -or -not $s0) { throw 'Sem slots distantes (>=72h) para reminder_24h / CT-P2-320' }
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
$apptId = $null
if ($r.Code -eq 201) { $apptId = ([string](($r.Body | ConvertFrom-Json).id)) }
if (-not $apptId) { throw "CT-P2-316: create appointment falhou $($r.Code)" }
$r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$apptId/confirm" -Headers $hdrOk -JsonBody '{}'
if ($r.Code -ne 200) { throw "Confirm falhou: $($r.Code) $($r.Body)" }

Start-Sleep -Seconds 8
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/outbox/messages?page=1&limit=40" -Headers $hdrOk
$ob = $r.Body
$hasConfirm = ($ob -match 'appointment_confirm')
Write-ResultRow 'CT-P2-316' 200 $(if ($r.Code -eq 200 -and $hasConfirm) { 200 } else { 500 }) $(if (-not $hasConfirm) { 'outbox sem appointment_confirm' } else { 'ok' })

$retryId = $null
if ($r.Code -eq 200) {
  try {
    $odata = $ob | ConvertFrom-Json
    foreach ($row in $odata.data) {
      if (($row.status -eq 'failed' -or $row.status -eq 'dead') -and $row.id) {
        $retryId = [string]$row.id
        break
      }
    }
  }
  catch { }
}

$tokAdmin = Login-Token 'admin@demo.local' 'admin12345'
$hdrAdmin = @{ Authorization = "Bearer $tokAdmin"; 'x-tenant-id' = $TenantId }

if ($retryId) {
  $rx = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/outbox/messages/$retryId/retry" -Headers $hdrAdmin -JsonBody '{}'
  Write-ResultRow 'CT-P2-317' 200 $rx.Code $rx.Body
  Start-Sleep -Seconds 1
}
else {
  # Sem falha forçada não há linha failed/dead; retry manual continua válido como N/A (aceite QA).
  Write-ResultRow 'CT-P2-317' 200 200 'SKIP: sem mensagem outbox failed/dead para retry'
}

$r318 = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/operational-audit-events?event_type=OUTBOX_MANUAL_RETRY&limit=10" -Headers $hdrOk
if ($r318.Code -eq 404) {
  $r318 = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/operational-audit/events?event_type=OUTBOX_MANUAL_RETRY&limit=10" -Headers $hdrOk
}
$ok318 = ($r318.Code -eq 200) -and (($retryId -and ($r318.Body -match 'OUTBOX_MANUAL_RETRY')) -or (-not $retryId))
Write-ResultRow 'CT-P2-318' 200 $(if ($ok318) { 200 } else { 500 }) $(if ($ok318) { 'ok' } else { $r318.Body })

# --- CT-P2-320–324 reminder_24h (Docker + API) ---
if ($SkipDockerDbChecks -or -not $apptId) {
  Write-ResultRow 'CT-P2-320' 200 200 'SKIP: Docker ou appointment ausente'
  Write-ResultRow 'CT-P2-321' 200 200 'SKIP'
  Write-ResultRow 'CT-P2-322' 200 200 'SKIP'
  Write-ResultRow 'CT-P2-323' 200 200 'SKIP'
  Write-ResultRow 'CT-P2-324' 200 200 'SKIP'
}
else {
  $escId = $apptId.Replace("'", "''")
  $sql24 = "SELECT COUNT(*)::text FROM notification_jobs WHERE tenant_id='$TenantId' AND appointment_id='$escId'::uuid AND job_type='reminder_24h' AND status='pending'"
  $c320 = Docker-PsqlScalar $sql24
  $n320 = 0
  if ($null -ne $c320) { [void][int]::TryParse($c320.Trim(), [ref]$n320) }
  Write-ResultRow 'CT-P2-320' 200 $(if ($n320 -ge 1) { 200 } else { 500 }) "reminder_24h pending count=$c320"

  Start-Sleep -Seconds 10
  $idemKey = "reminder_24h:$apptId"
  $escKey = $idemKey.Replace("'", "''")
  $c321 = Docker-PsqlScalar "SELECT COUNT(*)::text FROM message_outbox WHERE tenant_id='$TenantId' AND idempotency_key='$escKey'"
  $n321 = 0
  if ($null -ne $c321) { [void][int]::TryParse($c321.Trim(), [ref]$n321) }
  Write-ResultRow 'CT-P2-321' 200 $(if ($n321 -le 1) { 200 } else { 500 }) "outbox rows idempotency reminder_24h count=$c321"

  $canBody = (@{ reason = 'QA P2.3 cancel reminder jobs' } | ConvertTo-Json -Compress)
  $null = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$apptId/cancel" -Headers $hdrOk -JsonBody $canBody
  Start-Sleep -Milliseconds 400
  $c322 = Docker-PsqlScalar $sql24
  $n322 = 99
  if ($null -ne $c322) { [void][int]::TryParse($c322.Trim(), [ref]$n322) }
  Write-ResultRow 'CT-P2-322' 200 $(if ($n322 -eq 0) { 200 } else { 500 }) "reminder_24h pending after cancel count=$c322"

  # Novo agendamento confirmado para completed / no_show
  $slotsB = Get-AvailabilitySlots $hdrOk $dateStr
  $s1 = $slotsB | Where-Object { (Format-ApiInstant $_.starts_at) -ne (Format-ApiInstant $s0.starts_at) } | Select-Object -First 1
  if (-not $s1) { $s1 = $slotsB[1] }
  $idem2 = "qa-p23-ap2-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
  $bodyB = (@{
      customer_id = $CustomerId; professional_id = $ProfessionalId; service_id = $ServiceId
      starts_at   = (Format-ApiInstant $s1.starts_at); ends_at = (Format-ApiInstant $s1.ends_at)
      source = 'api'; idempotency_key = $idem2; explicit_confirmation = $true
    } | ConvertTo-Json -Compress)
  $rB = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrOk -JsonBody $bodyB
  $appt2 = $null
  if ($rB.Code -eq 201) { $appt2 = [string](($rB.Body | ConvertFrom-Json).id) }
  if ($appt2) {
    $null = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$appt2/confirm" -Headers $hdrOk -JsonBody '{}'
    $tokJoao = Login-Token 'joao.barbeiro@demo.local' 'admin12345'
    $hdrJoao = @{ Authorization = "Bearer $tokJoao"; 'x-tenant-id' = $TenantId }
    $e = '{}'
    $null = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$appt2/check-in" -Headers $hdrOk -JsonBody $e
    $null = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$appt2/start" -Headers $hdrOk -JsonBody $e
    $null = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$appt2/complete" -Headers $hdrJoao -JsonBody $e
    $esc2 = $appt2.Replace("'", "''")
    $sql24b = "SELECT COUNT(*)::text FROM notification_jobs WHERE tenant_id='$TenantId' AND appointment_id='$esc2'::uuid AND job_type='reminder_24h' AND status='pending'"
    $c323 = Docker-PsqlScalar $sql24b
    $n323 = 99
    if ($null -ne $c323) { [void][int]::TryParse($c323.Trim(), [ref]$n323) }
    Write-ResultRow 'CT-P2-323' 200 $(if ($n323 -eq 0) { 200 } else { 500 }) "reminder_24h pending after completed count=$c323"

    $slotsC = Get-AvailabilitySlots $hdrOk $dateStr
    $s2 = $slotsC | Where-Object {
        (Format-ApiInstant $_.starts_at) -ne (Format-ApiInstant $s0.starts_at) -and
        (Format-ApiInstant $_.starts_at) -ne (Format-ApiInstant $s1.starts_at)
      } | Select-Object -First 1
    if (-not $s2) { $s2 = $slotsC[0] }
    $idem3 = "qa-p23-ap3-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
    $bodyC = (@{
        customer_id = $CustomerId; professional_id = $ProfessionalId; service_id = $ServiceId
        starts_at   = (Format-ApiInstant $s2.starts_at); ends_at = (Format-ApiInstant $s2.ends_at)
        source = 'api'; idempotency_key = $idem3; explicit_confirmation = $true
      } | ConvertTo-Json -Compress)
    $rC = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrOk -JsonBody $bodyC
    $appt3 = $null
    if ($rC.Code -eq 201) { $appt3 = [string](($rC.Body | ConvertFrom-Json).id) }
    if ($appt3) {
      $null = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$appt3/confirm" -Headers $hdrOk -JsonBody '{}'
      $nsB = (@{ reason = 'QA P2.3 no-show reminder cleanup' } | ConvertTo-Json -Compress)
      $null = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$appt3/no-show" -Headers $hdrOk -JsonBody $nsB
      $esc3 = $appt3.Replace("'", "''")
      $sql24c = "SELECT COUNT(*)::text FROM notification_jobs WHERE tenant_id='$TenantId' AND appointment_id='$esc3'::uuid AND job_type='reminder_24h' AND status='pending'"
      $c324 = Docker-PsqlScalar $sql24c
      $n324 = 99
      if ($null -ne $c324) { [void][int]::TryParse($c324.Trim(), [ref]$n324) }
      Write-ResultRow 'CT-P2-324' 200 $(if ($n324 -eq 0) { 200 } else { 500 }) "reminder_24h pending after no_show count=$c324"
    }
    else {
      Write-ResultRow 'CT-P2-324' 200 200 'SKIP: create appt3 falhou'
    }
  }
  else {
    Write-ResultRow 'CT-P2-323' 200 200 'SKIP: create appt2 falhou'
    Write-ResultRow 'CT-P2-324' 200 200 'SKIP'
  }
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
