#requires -Version 5.1
<#
.SYNOPSIS
  P2.2.1 — Bateria operacional (health, auth, tenant, outbox, appointments, availability, time-blocks) + regressão P1/P2.1.

.DESCRIPTION
  Pré-requisitos: API (`docker compose up`), Postgres com seed `099_demo_seed_qa.sql` e migrations P2.1 (103/104) quando aplicável.
  Massa: tenant `00000000-0000-0000-0000-000000000001`, João `...4012`, Barba `...4022`, cliente `...4031`.
  Credenciais: `atendente@demo.local`, `joao.barbeiro@demo.local`, `fred.barbeiro@demo.local`, `admin@demo.local` / `admin12345`.

  Saída: `docs/QA_API_P2_2_OPERATIONAL_RESULTS.csv`
  Exit code 0 = sucesso; ≠0 em falha.
#>
param(
  [string] $ApiBase = 'http://localhost:3000',
  [string] $TenantId = '00000000-0000-0000-0000-000000000001',
  [string] $WrongTenantId = '00000000-0000-0000-0000-000000000099',
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
    $params.ContentType = 'application/json'
    $params.Body        = $JsonBody
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
  $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/auth/login" -JsonBody $j
  if ($r.Code -ne 200) { throw "Login falhou ($Email): HTTP $($r.Code) $($r.Body)" }
  $o = $r.Body | ConvertFrom-Json
  return [string]$o.access_token
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

$script:Rows.Add('case_id,expected_http,actual_http,result,response_body')

# CT-P2-201 Health
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/health"
Write-ResultRow 'CT-P2-201' 200 $r.Code $r.Body

# CT-P2-202 Database health
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/database/health"
Write-ResultRow 'CT-P2-202' 200 $r.Code $r.Body

# CT-P2-203 Auth negativo (sem token)
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/appointments?page=1&limit=5"
Write-ResultRow 'CT-P2-203' 401 $r.Code $r.Body

$tokAtt = Login-Token 'atendente@demo.local' 'admin12345'
$hdrOk = @{
  Authorization = "Bearer $tokAtt"
  'x-tenant-id' = $TenantId
}

# CT-P2-204 Tenant mismatch (appointments)
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/appointments?page=1&limit=5" -Headers @{
  Authorization = "Bearer $tokAtt"
  'x-tenant-id' = $WrongTenantId
}
Write-ResultRow 'CT-P2-204' 403 $r.Code $r.Body

# CT-P2-205 Outbox list com tenant válido
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/outbox/messages?page=1&limit=10" -Headers $hdrOk
Write-ResultRow 'CT-P2-205' 200 $r.Code $r.Body

# CT-P2-206 Outbox list sem token
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/outbox/messages?page=1&limit=5"
Write-ResultRow 'CT-P2-206' 401 $r.Code $r.Body

# CT-P2-207 Outbox list perfil professional (sem permissão de leitura)
$tokJoaoProbe = Login-Token 'joao.barbeiro@demo.local' 'admin12345'
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/outbox/messages?page=1&limit=5" -Headers @{
  Authorization = "Bearer $tokJoaoProbe"
  'x-tenant-id' = $TenantId
}
Write-ResultRow 'CT-P2-207' 403 $r.Code $r.Body

# CT-P2-208 Outbox cross-tenant (header divergente)
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/outbox/messages?page=1&limit=5" -Headers @{
  Authorization = "Bearer $tokAtt"
  'x-tenant-id' = $WrongTenantId
}
Write-ResultRow 'CT-P2-208' 403 $r.Code $r.Body

# CT-P2-209 Sanitização (resposta não deve conter segredos típicos em texto plano)
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/outbox/messages?page=1&limit=20" -Headers $hdrOk
$leak = $false
if ($r.Body) {
  $b = [string]$r.Body
  if ($b -match 'apikey|authorization:\s*Bearer|EVOLUTION_API_KEY' -or $b -match 'apiKey') { $leak = $true }
}
Write-ResultRow 'CT-P2-209' 200 $(if ($leak) { 500 } else { $r.Code }) $(if ($leak) { 'FAIL: possível vazamento' } else { $r.Body })

# CT-P2-210 Availability sem query (Zod 400)
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/availability" -Headers $hdrOk
Write-ResultRow 'CT-P2-210' 400 $r.Code $r.Body

# Escolher dia com slots
$dateStr = $null
$slots = @()
for ($i = 10; $i -le 40; $i += 5) {
  $tryDate = Next-WeekdayDate $i
  $slots = Get-AvailabilitySlots $hdrOk $tryDate
  if ($slots.Count -ge 12) {
    $dateStr = $tryDate
    break
  }
}
if (-not $dateStr) { throw 'Não foi possível obter slots suficientes para a bateria.' }

$avUrl = "$ApiBase/api/v1/availability?professional_id=$ProfessionalId&service_id=$ServiceId&date=$dateStr&min_advance_minutes=0&max_slots=50"

# CT-P2-211 Availability OK
$r = Invoke-ApiRaw -Method Get -Url $avUrl -Headers $hdrOk
Write-ResultRow 'CT-P2-211' 200 $r.Code $r.Body

# CT-P2-215 Time-block create
$blkStart = [string]$slots[5].starts_at
$blkEnd = [string]$slots[8].ends_at
$blockBody = (@{
    starts_at = $blkStart
    ends_at   = $blkEnd
    kind      = 'manual'
    reason    = 'QA P2.2 bloqueio manual'
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/professionals/$ProfessionalId/time-blocks" -Headers $hdrOk -JsonBody $blockBody
Write-ResultRow 'CT-P2-215' 201 $r.Code $r.Body
$blockId = $null
if ($r.Code -eq 201) {
  $blockObj = $r.Body | ConvertFrom-Json
  $blockId = [string]$blockObj.id
}

# CT-P2-216 Availability com bloqueio
$r = Invoke-ApiRaw -Method Get -Url $avUrl -Headers $hdrOk
Write-ResultRow 'CT-P2-216' 200 $r.Code $r.Body
$slotsAfter = @(($r.Body | ConvertFrom-Json).slots)
if ($slotsAfter.Count -ge $slots.Count) {
  $script:Failed = $true
  Write-ResultRow 'CT-P2-216-slotcount' 1 0 'Esperado menos slots após bloqueio.'
}

# CT-P2-217 Appointment em slot bloqueado
$targetInBlock = $slots[6]
$idemBlock = "qa-p22-blk-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$createInBlock = (@{
    customer_id             = $CustomerId
    professional_id         = $ProfessionalId
    service_id              = $ServiceId
    starts_at               = [string]$targetInBlock.starts_at
    ends_at                 = [string]$targetInBlock.ends_at
    source                   = 'api'
    idempotency_key         = $idemBlock
    explicit_confirmation   = $true
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrOk -JsonBody $createInBlock
Write-ResultRow 'CT-P2-217' 409 $r.Code $r.Body

# CT-P2-218 Time-block delete
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
$s2 = $slots[2]
$s3 = $slots[3]
$s4 = $slots[4]

$idemA = "qa-p22-a-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$bodyA = (@{
    customer_id             = $CustomerId
    professional_id         = $ProfessionalId
    service_id              = $ServiceId
    starts_at               = [string]$s0.starts_at
    ends_at                 = [string]$s0.ends_at
    source                   = 'api'
    idempotency_key         = $idemA
    explicit_confirmation   = $true
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrOk -JsonBody $bodyA
Write-ResultRow 'CT-P2-212' 201 $r.Code $r.Body
$apptA = $null
if ($r.Code -eq 201) { $apptA = $r.Body | ConvertFrom-Json }

$tokJoao = Login-Token 'joao.barbeiro@demo.local' 'admin12345'
$hdrJoao = @{
  Authorization = "Bearer $tokJoao"
  'x-tenant-id' = $TenantId
}
$idemW = "qa-p22-w-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$bodyW = (@{
    customer_id      = $CustomerId
    professional_id  = $ProfessionalId
    service_id       = $ServiceId
    starts_at        = [string]$s1.starts_at
    idempotency_key  = $idemW
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments/walk-in" -Headers $hdrOk -JsonBody $bodyW
Write-ResultRow 'CT-P2-212b-walkin' 201 $r.Code $r.Body
$apptW = $null
if ($r.Code -eq 201) { $apptW = $r.Body | ConvertFrom-Json }

# CT-P2-213 list on_date
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/appointments?on_date=$dateStr&page=1&limit=50" -Headers $hdrOk
Write-ResultRow 'CT-P2-213' 200 $r.Code $r.Body

$idemC = "qa-p22-c-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$bodyC = (@{
    customer_id             = $CustomerId
    professional_id         = $ProfessionalId
    service_id              = $ServiceId
    starts_at               = [string]$s3.starts_at
    ends_at                 = [string]$s3.ends_at
    source                   = 'api'
    idempotency_key         = $idemC
    explicit_confirmation   = $true
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrOk -JsonBody $bodyC
$apptC = $null
if ($r.Code -eq 201) { $apptC = $r.Body | ConvertFrom-Json }

# CT-P2-214 cancel
if ($apptC -and $apptC.id) {
  $cancelBody = (@{ reason = 'Cancelado pelo script QA P2.2' } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$($apptC.id)/cancel" -Headers $hdrOk -JsonBody $cancelBody
  Write-ResultRow 'CT-P2-214' 200 $r.Code $r.Body
}
else {
  Write-ResultRow 'CT-P2-214' 200 599 'SKIP'
}

# CT-P2-222 reschedule
if ($apptA -and $apptA.id) {
  $rsBody = (@{
    starts_at = [string]$s2.starts_at
    ends_at   = [string]$s2.ends_at
    reason    = 'Remarcação QA P2.2'
  } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$($apptA.id)/reschedule" -Headers $hdrOk -JsonBody $rsBody
  Write-ResultRow 'CT-P2-222' 200 $r.Code $r.Body
}
else {
  Write-ResultRow 'CT-P2-222' 200 599 'SKIP'
}

# CT-P2-223 complete
if ($apptW -and $apptW.id) {
  $wid = [string]$apptW.id
  $empty = '{}'
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$wid/check-in" -Headers $hdrOk -JsonBody $empty
  Write-ResultRow 'CT-P2-223a-checkin' 200 $r.Code $r.Body
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$wid/start" -Headers $hdrOk -JsonBody $empty
  Write-ResultRow 'CT-P2-223b-start' 200 $r.Code $r.Body
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$wid/complete" -Headers $hdrJoao -JsonBody $empty
  Write-ResultRow 'CT-P2-223' 200 $r.Code $r.Body
}
else {
  Write-ResultRow 'CT-P2-223' 200 599 'SKIP'
}

# CT-P2-224 no-show
$idemN = "qa-p22-n-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$bodyN = (@{
    customer_id             = $CustomerId
    professional_id         = $ProfessionalId
    service_id              = $ServiceId
    starts_at               = [string]$s4.starts_at
    ends_at                 = [string]$s4.ends_at
    source                   = 'api'
    idempotency_key         = $idemN
    explicit_confirmation   = $true
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrOk -JsonBody $bodyN
$apptN = $null
if ($r.Code -eq 201) { $apptN = $r.Body | ConvertFrom-Json }
if ($apptN -and $apptN.id) {
  $nsBody = (@{ reason = 'Cliente não compareceu (QA P2.2)' } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$($apptN.id)/no-show" -Headers $hdrOk -JsonBody $nsBody
  Write-ResultRow 'CT-P2-224' 200 $r.Code $r.Body
}
else {
  Write-ResultRow 'CT-P2-224' 200 599 'SKIP'
}

# CT-P2-225 no-show professional denied
$tokProFred = Login-Token 'fred.barbeiro@demo.local' 'admin12345'
$hdrProFred = @{
  Authorization = "Bearer $tokProFred"
  'x-tenant-id' = $TenantId
}
$idemNv = "qa-p22-nv-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
if ($slots.Count -ge 10) {
  $sx = $slots[9]
  $bodyNv = (@{
      customer_id             = $CustomerId
      professional_id         = $ProfessionalId
      service_id              = $ServiceId
      starts_at               = [string]$sx.starts_at
      ends_at                 = [string]$sx.ends_at
      source                   = 'api'
      idempotency_key         = $idemNv
      explicit_confirmation   = $true
    } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrOk -JsonBody $bodyNv
  $apptNv = $null
  if ($r.Code -eq 201) { $apptNv = $r.Body | ConvertFrom-Json }
  if ($apptNv -and $apptNv.id) {
    $nsBody2 = (@{ reason = 'Tentativa no-show como professional' } | ConvertTo-Json -Compress)
    $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$($apptNv.id)/no-show" -Headers $hdrProFred -JsonBody $nsBody2
    Write-ResultRow 'CT-P2-225' 403 $r.Code $r.Body
  }
  else {
    Write-ResultRow 'CT-P2-225' 403 599 'SKIP'
  }
}
else {
  Write-ResultRow 'CT-P2-225' 403 599 'SKIP'
}

$tokAdmin = Login-Token 'admin@demo.local' 'admin12345'
$hdrAdmin = @{
  Authorization = "Bearer $tokAdmin"
  'x-tenant-id' = $TenantId
}
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/operational-audit-events?page=1&limit=20" -Headers $hdrAdmin
Write-ResultRow 'CT-P2-226-audit' 200 $r.Code $r.Body

# CT-P2-219 Regressão P1 (script dedicado)
try {
  & "$PSScriptRoot\qa-api-negative-battery.ps1" -BaseUrl $ApiBase | Out-Null
  $ne = $LASTEXITCODE
}
catch {
  $ne = 1
}
Write-ResultRow 'CT-P2-219' 200 $(if ($ne -eq 0) { 200 } else { 500 }) "qa-api-negative-battery exit=$ne"

# CT-P2-220 Regressão P2.1 (bateria original)
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
