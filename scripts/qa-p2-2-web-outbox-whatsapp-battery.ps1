#requires -Version 5.1
<#
.SYNOPSIS
  P2.2.1 — Bateria operacional (matriz CT-P2-201 … CT-P2-220).

.DESCRIPTION
  IDs **sem colisões**, alinhados ao PO:
  201 Health | 202 DB health | 203 Auth negativo | 204 Tenant mismatch (appointments) |
  205 Outbox list tenant válido | 206 Outbox sem token | 207 Outbox tenant header inválido (nil UUID) |
  208 Outbox cross-tenant | 209 Sanitização outbox | 210 Appointment create | 211 Cancel | 212 Reschedule |
  213 Complete (walk-in + check-in + start + complete) | 214 No-show | 215 Time-block create |
  216 Availability com bloqueio | 217 Appointment em slot bloqueado | 218 Time-block delete |
  219 Regressão P1 | 220 Regressão P2.1.

  Pré-requisitos: API (`docker compose up`), Postgres com `099_demo_seed_qa.sql` + migrations (103/104 quando aplicável).
  Saída: `docs/QA_API_P2_2_OPERATIONAL_RESULTS.csv`
  Windows PowerShell 5.1: o script envia JSON em UTF-8 (bytes) para PATCH/POST com acentos; instantes de slots normalizados para ISO UTC.
#>
param(
  [string] $ApiBase = 'http://localhost:3000',
  [string] $TenantId = '00000000-0000-0000-0000-000000000001',
  [string] $WrongTenantId = '00000000-0000-0000-0000-000000000099',
  [string] $NilTenantHeader = '00000000-0000-0000-0000-000000000000',
  [string] $ProfessionalId = '00000000-0000-4000-8000-000000004012',
  [string] $ServiceId = '00000000-0000-4000-8000-000000004022',
  [string] $CustomerId = '00000000-0000-4000-8000-000000004031'
)

$ErrorActionPreference = 'Stop'
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
  if ($Headers.Count -gt 0) {
    $params.Headers = [hashtable]::new($Headers)
  }
  $verb = $Method.ToUpperInvariant()
  $canHaveBody = $verb -in @('POST', 'PUT', 'PATCH', 'DELETE')
  if ($canHaveBody -and ($null -ne $JsonBody) -and ($JsonBody -ne '')) {
    $params.ContentType = 'application/json; charset=utf-8'
    # Windows PowerShell 5.1: string default encoding pode corromper JSON com acentos.
    if ($PSVersionTable.PSVersion.Major -lt 6) {
      $params.Body = [System.Text.Encoding]::UTF8.GetBytes($JsonBody)
    }
    else {
      $params.Body = $JsonBody
    }
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
  while ($d.DayOfWeek -eq [DayOfWeek]::Sunday) {
    $d = $d.AddDays(1)
  }
  return $d.ToString('yyyy-MM-dd')
}

function Get-AvailabilitySlots([hashtable] $AuthHeaders, [string] $DateStr) {
  $url = "$ApiBase/api/v1/availability?professional_id=$ProfessionalId&service_id=$ServiceId&date=$DateStr&min_advance_minutes=0&max_slots=50"
  $r = Invoke-ApiRaw -Method Get -Url $url -Headers $AuthHeaders
  if ($r.Code -ne 200) { throw "Availability falhou: HTTP $($r.Code) $($r.Body)" }
  $o = $r.Body | ConvertFrom-Json
  return @($o.slots)
}

# Converte instante de slot JSON (DateTime PS 5.1 ou string ISO) para ISO UTC aceite por Zod z.string().datetime().
function Format-ApiInstant([object] $Value) {
  if ($null -eq $Value) { throw 'Format-ApiInstant: valor nulo' }
  if ($Value -is [datetime]) {
    return $Value.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  }
  $s = [string]$Value
  if ($s.Length -ge 19 -and $s[4] -eq '-') { return $s }
  throw "Format-ApiInstant: formato não suportado ($s)"
}

$script:Rows.Add('case_id,expected_http,actual_http,result,response_body')

# --- CT-P2-201 / 202 ---
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/health"
Write-ResultRow 'CT-P2-201' 200 $r.Code $r.Body

$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/database/health"
Write-ResultRow 'CT-P2-202' 200 $r.Code $r.Body

# --- CT-P2-203 Auth negativo ---
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/appointments?page=1&limit=5"
Write-ResultRow 'CT-P2-203' 401 $r.Code $r.Body

$tokAtt = Login-Token 'atendente@demo.local' 'admin12345'
$hdrOk = @{
  Authorization = "Bearer $tokAtt"
  'x-tenant-id' = $TenantId
}

# --- CT-P2-204 Tenant mismatch (appointments) ---
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/appointments?page=1&limit=5" -Headers @{
  Authorization = "Bearer $tokAtt"
  'x-tenant-id' = $WrongTenantId
}
Write-ResultRow 'CT-P2-204' 403 $r.Code $r.Body

# --- CT-P2-205 Outbox list tenant válido ---
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/outbox/messages?page=1&limit=10" -Headers $hdrOk
Write-ResultRow 'CT-P2-205' 200 $r.Code $r.Body

# --- CT-P2-206 Outbox sem token ---
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/outbox/messages?page=1&limit=5"
Write-ResultRow 'CT-P2-206' 401 $r.Code $r.Body

# --- CT-P2-207 Outbox com tenant header inválido (UUID nil — política CT-021) ---
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/outbox/messages?page=1&limit=5" -Headers @{
  Authorization = "Bearer $tokAtt"
  'x-tenant-id' = $NilTenantHeader
}
Write-ResultRow 'CT-P2-207' 403 $r.Code $r.Body

# --- CT-P2-208 Outbox cross-tenant ---
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/outbox/messages?page=1&limit=5" -Headers @{
  Authorization = "Bearer $tokAtt"
  'x-tenant-id' = $WrongTenantId
}
Write-ResultRow 'CT-P2-208' 403 $r.Code $r.Body

# --- CT-P2-209 Sanitização ---
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/outbox/messages?page=1&limit=20" -Headers $hdrOk
$leak = $false
if ($r.Body) {
  $b = [string]$r.Body
  if ($b -match 'apikey|authorization:\s*Bearer|EVOLUTION_API_KEY|apiKey') { $leak = $true }
}
Write-ResultRow 'CT-P2-209' 200 $(if ($leak) { 500 } else { $r.Code }) $(if ($leak) { 'FAIL: possível vazamento' } else { $r.Body })

# --- Dados de calendário (pré-210): escolher dia com slots ---
# Mínimo 9 slots (usa índices até [8] em bloqueios/CT-216). Evita falhar após baterias P2.3 que consomem o mesmo dia.
$dateStr = $null
$slots = @()
for ($i = 7; $i -le 120; $i += 3) {
  $tryDate = Next-WeekdayDate $i
  $slots = Get-AvailabilitySlots $hdrOk $tryDate
  if ($slots.Count -ge 9) {
    $dateStr = $tryDate
    break
  }
}
if (-not $dateStr) { throw 'Não foi possível obter slots suficientes para a bateria.' }

$avUrl = "$ApiBase/api/v1/availability?professional_id=$ProfessionalId&service_id=$ServiceId&date=$dateStr&min_advance_minutes=0&max_slots=50"

# --- CT-P2-215 … 218 (bloqueios antes dos appointments nos slots 5–8) ---
$blkStart = Format-ApiInstant $slots[5].starts_at
$blkEnd = Format-ApiInstant $slots[8].ends_at
$blockBody = (@{
    starts_at = $blkStart
    ends_at   = $blkEnd
    kind      = 'manual'
    reason    = 'QA P2.2.1 bloqueio manual'
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/professionals/$ProfessionalId/time-blocks" -Headers $hdrOk -JsonBody $blockBody
Write-ResultRow 'CT-P2-215' 201 $r.Code $r.Body
$blockId = $null
if ($r.Code -eq 201) {
  $blockObj = $r.Body | ConvertFrom-Json
  $blockId = [string]$blockObj.id
}

$r = Invoke-ApiRaw -Method Get -Url $avUrl -Headers $hdrOk
$slotsAfter = @(($r.Body | ConvertFrom-Json).slots)
$slotOk = ($slotsAfter.Count -lt $slots.Count)
if (-not ($r.Code -eq 200 -and $slotOk)) { $script:Failed = $true }
Write-ResultRow 'CT-P2-216' 200 $(if ($r.Code -eq 200 -and $slotOk) { 200 } else { 500 }) $(if ($r.Code -ne 200) { $r.Body } elseif (-not $slotOk) { 'FAIL: slots não diminuíram após bloqueio' } else { $r.Body })

$targetInBlock = $slots[6]
$idemBlock = "qa-p221-blk-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$createInBlock = (@{
    customer_id             = $CustomerId
    professional_id         = $ProfessionalId
    service_id              = $ServiceId
    starts_at               = (Format-ApiInstant $targetInBlock.starts_at)
    ends_at                 = (Format-ApiInstant $targetInBlock.ends_at)
    source                   = 'api'
    idempotency_key         = $idemBlock
    explicit_confirmation   = $true
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrOk -JsonBody $createInBlock
Write-ResultRow 'CT-P2-217' 409 $r.Code $r.Body

if ($blockId) {
  $r = Invoke-ApiRaw -Method Delete -Url "$ApiBase/api/v1/professionals/$ProfessionalId/time-blocks/$blockId" -Headers $hdrOk
  Write-ResultRow 'CT-P2-218' 204 $r.Code $r.Body
}
else {
  Write-ResultRow 'CT-P2-218' 204 599 'SKIP: block id ausente'
}

$slots = Get-AvailabilitySlots $hdrOk $dateStr
$s0 = $slots[0]
$s1 = $slots[1]
$s3 = $slots[3]
$s4 = $slots[4]

# --- CT-P2-210 Appointment create ---
$idemA = "qa-p221-a-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$bodyA = (@{
    customer_id             = $CustomerId
    professional_id         = $ProfessionalId
    service_id              = $ServiceId
    starts_at               = (Format-ApiInstant $s0.starts_at)
    ends_at                 = (Format-ApiInstant $s0.ends_at)
    source                   = 'api'
    idempotency_key         = $idemA
    explicit_confirmation   = $true
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrOk -JsonBody $bodyA
Write-ResultRow 'CT-P2-210' 201 $r.Code $r.Body
$apptA = $null
if ($r.Code -eq 201) { $apptA = $r.Body | ConvertFrom-Json }
if ($apptA -and $apptA.id) {
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$($apptA.id)/confirm" -Headers $hdrOk -JsonBody '{}'
  if ($r.Code -ne 200) { throw "CT-P2-210 follow-up: confirm falhou HTTP $($r.Code) $($r.Body)" }
}

# --- CT-P2-212 Reschedule (availability fresca; evita s1 walk-in e s4 no-show) ---
if ($apptA -and $apptA.id) {
  $slotsRs = Get-AvailabilitySlots $hdrOk $dateStr
  if ($slotsRs.Count -lt 1) { throw 'CT-P2-212: availability vazia após confirm' }
  $avoidStarts = @((Format-ApiInstant $s1.starts_at), (Format-ApiInstant $s4.starts_at))
  $t0 = $slotsRs | Where-Object { $avoidStarts -notcontains (Format-ApiInstant $_.starts_at) } | Select-Object -First 1
  if (-not $t0) { throw 'CT-P2-212: sem slot livre fora de s1/s4' }
  $rsBody = (@{
    starts_at = (Format-ApiInstant $t0.starts_at)
    ends_at   = (Format-ApiInstant $t0.ends_at)
    reason    = 'Remarcação QA P2.2.1'
  } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$($apptA.id)/reschedule" -Headers $hdrOk -JsonBody $rsBody
  Write-ResultRow 'CT-P2-212' 200 $r.Code $r.Body
}
$idemC = "qa-p221-c-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$bodyC = (@{
    customer_id             = $CustomerId
    professional_id         = $ProfessionalId
    service_id              = $ServiceId
    starts_at               = (Format-ApiInstant $s3.starts_at)
    ends_at                 = (Format-ApiInstant $s3.ends_at)
    source                   = 'api'
    idempotency_key         = $idemC
    explicit_confirmation   = $true
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrOk -JsonBody $bodyC
$apptC = $null
if ($r.Code -eq 201) { $apptC = $r.Body | ConvertFrom-Json }
if ($apptC -and $apptC.id) {
  $cancelBody = (@{ reason = 'Cancelado pelo script QA P2.2.1' } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$($apptC.id)/cancel" -Headers $hdrOk -JsonBody $cancelBody
  Write-ResultRow 'CT-P2-211' 200 $r.Code $r.Body
}
else {
  Write-ResultRow 'CT-P2-211' 200 599 'SKIP: create cancel alvo'
}

# --- CT-P2-213 Complete (walk-in + fluxo) ---
$tokJoao = Login-Token 'joao.barbeiro@demo.local' 'admin12345'
$hdrJoao = @{
  Authorization = "Bearer $tokJoao"
  'x-tenant-id' = $TenantId
}
$idemW = "qa-p221-w-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$bodyW = (@{
    customer_id      = $CustomerId
    professional_id  = $ProfessionalId
    service_id       = $ServiceId
    starts_at        = (Format-ApiInstant $s1.starts_at)
    idempotency_key  = $idemW
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments/walk-in" -Headers $hdrOk -JsonBody $bodyW
$apptW = $null
if ($r.Code -eq 201) { $apptW = $r.Body | ConvertFrom-Json }
$ok213 = $false
if ($apptW -and $apptW.id) {
  $wid = [string]$apptW.id
  $empty = '{}'
  $r1 = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$wid/check-in" -Headers $hdrOk -JsonBody $empty
  $r2 = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$wid/start" -Headers $hdrOk -JsonBody $empty
  $r3 = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$wid/complete" -Headers $hdrJoao -JsonBody $empty
  $ok213 = ($r1.Code -eq 200) -and ($r2.Code -eq 200) -and ($r3.Code -eq 200)
  $body213 = "checkin=$($r1.Code) start=$($r2.Code) complete=$($r3.Code)"
}
else {
  $body213 = 'SKIP: walk-in ausente'
}
Write-ResultRow 'CT-P2-213' 200 $(if ($ok213) { 200 } else { 500 }) $body213

# --- CT-P2-214 No-show ---
$idemN = "qa-p221-n-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$bodyN = (@{
    customer_id             = $CustomerId
    professional_id         = $ProfessionalId
    service_id              = $ServiceId
    starts_at               = (Format-ApiInstant $s4.starts_at)
    ends_at                 = (Format-ApiInstant $s4.ends_at)
    source                   = 'api'
    idempotency_key         = $idemN
    explicit_confirmation   = $true
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrOk -JsonBody $bodyN
$apptN = $null
if ($r.Code -eq 201) { $apptN = $r.Body | ConvertFrom-Json }
if ($apptN -and $apptN.id) {
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$($apptN.id)/confirm" -Headers $hdrOk -JsonBody '{}'
  if ($r.Code -ne 200) { throw "CT-P2-214 follow-up: confirm falhou HTTP $($r.Code) $($r.Body)" }
  $nsBody = (@{ reason = 'Cliente não compareceu (QA P2.2.1)' } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$($apptN.id)/no-show" -Headers $hdrOk -JsonBody $nsBody
  Write-ResultRow 'CT-P2-214' 200 $r.Code $r.Body
}
else {
  Write-ResultRow 'CT-P2-214' 200 599 'SKIP: no-show alvo'
}

# --- CT-P2-219 / 220 Regressões ---
try {
  & "$PSScriptRoot\qa-api-negative-battery.ps1" -BaseUrl $ApiBase | Out-Null
  $ne = $LASTEXITCODE
}
catch {
  $ne = 1
}
Write-ResultRow 'CT-P2-219' 200 $(if ($ne -eq 0) { 200 } else { 500 }) "qa-api-negative-battery exit=$ne"

try {
  & "$PSScriptRoot\qa-api-p2-operational-battery.ps1" -ApiBase $ApiBase | Out-Null
  $p21 = $LASTEXITCODE
}
catch {
  $p21 = 1
}
Write-ResultRow 'CT-P2-220' 200 $(if ($p21 -eq 0) { 200 } else { 500 }) "qa-api-p2-operational-battery exit=$p21"

$outPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'docs\QA_API_P2_2_OPERATIONAL_RESULTS.csv'
$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllLines($outPath, $script:Rows, $utf8Bom)
Write-Host "CSV escrito: $outPath" -ForegroundColor Green

if ($script:Failed) {
  Write-Host 'Bateria P2.2.1: FALHA.' -ForegroundColor Red
  exit 1
}
Write-Host 'Bateria P2.2.1: OK.' -ForegroundColor Green
exit 0
