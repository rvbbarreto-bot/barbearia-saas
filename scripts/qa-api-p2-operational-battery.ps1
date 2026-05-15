<#
.SYNOPSIS
  P2.1 — Bateria operacional mínima (health, auth, tenant, appointments, availability, time-blocks, auditoria).

.DESCRIPTION
  Pré-requisitos: API acessível (ex.: `docker compose up`), Postgres com seed `099_demo_seed_qa.sql` aplicado.
  Em volumes **já existentes**, aplicar também `103_operational_audit_events.sql` e `104_calendar_blocks_created_by.sql` sobre a base (o initdb só corre no primeiro boot do volume).
  Massa fixa: tenant `00000000-0000-0000-0000-000000000001`, profissional João `...4012`, serviço Barba `...4022`, cliente `...4031`.
  Credenciais: `atendente@demo.local` / `admin12345`, `joao.barbeiro@demo.local` / `admin12345`, `admin@demo.local` / `admin12345`.

  Saída: `docs/QA_API_P2_OPERATIONAL_RESULTS.csv` (sobrescrito a cada execução).
  Exit code 0 = todos os passos com HTTP esperado; ≠0 em falha.
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

# --- CSV header ---
$script:Rows.Add('case_id,expected_http,actual_http,result,response_body')

# CT-P2-001
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/health"
Write-ResultRow 'CT-P2-001' 200 $r.Code $r.Body

# CT-P2-002
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/database/health"
Write-ResultRow 'CT-P2-002' 200 $r.Code $r.Body

# CT-P2-010
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/appointments?page=1&limit=5"
Write-ResultRow 'CT-P2-010' 401 $r.Code $r.Body

$tokAtt = Login-Token 'atendente@demo.local' 'admin12345'
$hdrOk = @{
  Authorization = "Bearer $tokAtt"
  'x-tenant-id' = $TenantId
}

# CT-P2-039 availability sem query obrigatória (Zod → 400)
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/availability" -Headers $hdrOk
Write-ResultRow 'CT-P2-039' 400 $r.Code $r.Body

# CT-P2-020 tenant mismatch
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/appointments?page=1&limit=5" -Headers @{
  Authorization = "Bearer $tokAtt"
  'x-tenant-id' = $WrongTenantId
}
Write-ResultRow 'CT-P2-020' 403 $r.Code $r.Body

# Escolher dia com slots suficientes
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
if (-not $dateStr) { throw 'Não foi possível obter slots suficientes para a bateria (availability vazia?). Verifique business_hours e profissional ativo.' }

# CT-P2-040
$avUrl = "$ApiBase/api/v1/availability?professional_id=$ProfessionalId&service_id=$ServiceId&date=$dateStr&min_advance_minutes=0&max_slots=50"
$r = Invoke-ApiRaw -Method Get -Url $avUrl -Headers $hdrOk
Write-ResultRow 'CT-P2-040' 200 $r.Code $r.Body

# CT-P2-041 (time block) — usa janela entre slots índice 5 e 8
$blkStart = [string]$slots[5].starts_at
$blkEnd = [string]$slots[8].ends_at
$blockBody = (@{
    starts_at = $blkStart
    ends_at   = $blkEnd
    kind      = 'manual'
    reason    = 'QA P2.1 bloqueio manual'
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/professionals/$ProfessionalId/time-blocks" -Headers $hdrOk -JsonBody $blockBody
Write-ResultRow 'CT-P2-041' 201 $r.Code $r.Body
$blockId = $null
if ($r.Code -eq 201) {
  $blockObj = $r.Body | ConvertFrom-Json
  $blockId = [string]$blockObj.id
}

# CT-P2-042 availability com bloqueio (menos slots que antes)
$r = Invoke-ApiRaw -Method Get -Url $avUrl -Headers $hdrOk
Write-ResultRow 'CT-P2-042' 200 $r.Code $r.Body
$slotsAfter = @(($r.Body | ConvertFrom-Json).slots)
if ($slotsAfter.Count -ge $slots.Count) {
  $script:Failed = $true
  Write-ResultRow 'CT-P2-042-slotcount' 1 0 'Esperado menos slots após bloqueio (calendar_blocks).'
}

# CT-P2-043 criação em bloqueio (slot 6 dentro do bloco)
$targetInBlock = $slots[6]
$idemBlock = "qa-p2-blk-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
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
Write-ResultRow 'CT-P2-043' 409 $r.Code $r.Body

# CT-P2-044 remover bloqueio
if ($blockId) {
  $r = Invoke-ApiRaw -Method Delete -Url "$ApiBase/api/v1/professionals/$ProfessionalId/time-blocks/$blockId" -Headers $hdrOk
  Write-ResultRow 'CT-P2-044' 204 $r.Code $r.Body
}
else {
  Write-ResultRow 'CT-P2-044' 204 599 'SKIP: block id ausente'
}

# Recarregar slots após remover bloqueio
$slots = Get-AvailabilitySlots $hdrOk $dateStr
$s0 = $slots[0]
$s1 = $slots[1]
$s2 = $slots[2]
$s3 = $slots[3]
$s4 = $slots[4]

# CT-P2-030 create
$idemA = "qa-p2-a-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
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
Write-ResultRow 'CT-P2-030' 201 $r.Code $r.Body
$apptA = $null
if ($r.Code -eq 201) { $apptA = $r.Body | ConvertFrom-Json }

# Walk-in + fluxo complete (João = profissional do token de conclusão)
$tokJoao = Login-Token 'joao.barbeiro@demo.local' 'admin12345'
$hdrJoao = @{
  Authorization = "Bearer $tokJoao"
  'x-tenant-id' = $TenantId
}
$idemW = "qa-p2-w-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$bodyW = (@{
    customer_id      = $CustomerId
    professional_id  = $ProfessionalId
    service_id       = $ServiceId
    starts_at        = [string]$s1.starts_at
    idempotency_key  = $idemW
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments/walk-in" -Headers $hdrOk -JsonBody $bodyW
Write-ResultRow 'CT-P2-030b-walkin' 201 $r.Code $r.Body
$apptW = $null
if ($r.Code -eq 201) { $apptW = $r.Body | ConvertFrom-Json }

# CT-P2-031 list (on_date)
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/appointments?on_date=$dateStr&page=1&limit=50" -Headers $hdrOk
Write-ResultRow 'CT-P2-031' 200 $r.Code $r.Body

# Agendamento para cancelar
$idemC = "qa-p2-c-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
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

# CT-P2-032 cancel
if ($apptC -and $apptC.id) {
  $cancelBody = (@{ reason = 'Cancelado pelo script QA P2.1' } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$($apptC.id)/cancel" -Headers $hdrOk -JsonBody $cancelBody
  Write-ResultRow 'CT-P2-032' 200 $r.Code $r.Body
}
else {
  Write-ResultRow 'CT-P2-032' 200 599 'SKIP: appointment cancel alvo ausente'
}

# CT-P2-033 reschedule ($apptA -> $s2)
if ($apptA -and $apptA.id) {
  $rsBody = (@{
    starts_at = [string]$s2.starts_at
    ends_at   = [string]$s2.ends_at
    reason    = 'Remarcação QA P2.1'
  } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$($apptA.id)/reschedule" -Headers $hdrOk -JsonBody $rsBody
  Write-ResultRow 'CT-P2-033' 200 $r.Code $r.Body
}
else {
  Write-ResultRow 'CT-P2-033' 200 599 'SKIP: appointment reschedule alvo ausente'
}

# CT-P2-034 complete (walk-in confirmado → check-in → start → complete como João)
if ($apptW -and $apptW.id) {
  $wid = [string]$apptW.id
  $empty = '{}'
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$wid/check-in" -Headers $hdrOk -JsonBody $empty
  Write-ResultRow 'CT-P2-034a-checkin' 200 $r.Code $r.Body
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$wid/start" -Headers $hdrOk -JsonBody $empty
  Write-ResultRow 'CT-P2-034b-start' 200 $r.Code $r.Body
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$wid/complete" -Headers $hdrJoao -JsonBody $empty
  Write-ResultRow 'CT-P2-034' 200 $r.Code $r.Body
}
else {
  Write-ResultRow 'CT-P2-034' 200 599 'SKIP: walk-in ausente'
}

# CT-P2-035 no-show ($s4)
$idemN = "qa-p2-n-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
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
  $nsBody = (@{ reason = 'Cliente não compareceu (QA P2.1)' } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$($apptN.id)/no-show" -Headers $hdrOk -JsonBody $nsBody
  Write-ResultRow 'CT-P2-035' 200 $r.Code $r.Body
}
else {
  Write-ResultRow 'CT-P2-035' 200 599 'SKIP: appointment no-show alvo ausente'
}

# CT-P2-035b no-show sem permissão (perfil `professional` < mínimo `attendant` em RBAC)
$tokProFred = Login-Token 'fred.barbeiro@demo.local' 'admin12345'
$hdrProFred = @{
  Authorization = "Bearer $tokProFred"
  'x-tenant-id' = $TenantId
}
$idemNv = "qa-p2-nv-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
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
    $nsBody2 = (@{ reason = 'Tentativa no-show como professional (deve falhar RBAC)' } | ConvertTo-Json -Compress)
    $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$($apptNv.id)/no-show" -Headers $hdrProFred -JsonBody $nsBody2
    Write-ResultRow 'CT-P2-035b-pro-denied' 403 $r.Code $r.Body
  }
  else {
    Write-ResultRow 'CT-P2-035b-pro-denied' 403 599 'SKIP: criação slot 9 falhou'
  }
}
else {
  Write-ResultRow 'CT-P2-035b-pro-denied' 403 599 'SKIP: poucos slots'
}

# CT-P2-050 auditoria (tenant_owner)
$tokAdmin = Login-Token 'admin@demo.local' 'admin12345'
$hdrAdmin = @{
  Authorization = "Bearer $tokAdmin"
  'x-tenant-id' = $TenantId
}
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/operational-audit-events?page=1&limit=20" -Headers $hdrAdmin
Write-ResultRow 'CT-P2-050' 200 $r.Code $r.Body

$outPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'docs\QA_API_P2_OPERATIONAL_RESULTS.csv'
$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllLines($outPath, $script:Rows, $utf8Bom)
Write-Host "CSV escrito: $outPath" -ForegroundColor Green

if ($script:Failed) {
  Write-Host 'Bateria P2.1: FALHA (ver linhas FAIL no CSV).' -ForegroundColor Red
  exit 1
}
Write-Host 'Bateria P2.1: OK.' -ForegroundColor Green
exit 0
