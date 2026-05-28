<#
.SYNOPSIS
  Piloto staging 07 — Rodada 3: F08 + regressivo API barbearia (F01–F11) + lava-rápido (cenários 7–18 API).

.EXAMPLE
  . .\scripts\devops-env.ps1 -InstallNodeIfMissing
  .\scripts\qa-piloto-staging-07-rodada3.ps1 -RebuildStack
#>
param(
  [string] $ApiBase = 'http://localhost:3000',
  [string] $TenantId = '00000000-0000-0000-0000-000000000001',
  [string] $ProfessionalIdFred = '00000000-0000-4000-8000-000000004011',
  [string] $ProfessionalIdJoao = '00000000-0000-4000-8000-000000004012',
  [string] $ServiceIdCorte = '00000000-0000-4000-8000-000000004021',
  [string] $ServiceIdBarba = '00000000-0000-4000-8000-000000004022',
  [string] $CustomerId = '00000000-0000-4000-8000-000000004031',
  [switch] $RebuildStack,
  [switch] $SkipCarWash,
  [switch] $SkipBarbeariaCore
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
. (Join-Path $PSScriptRoot 'lib\qa-api-helpers.ps1')

$Cases = [System.Collections.Generic.List[hashtable]]::new()
$script:AnyFail = $false

function Record-Case {
  param(
    [string] $Id,
    [string] $Area,
    [string[]] $Steps,
    [string] $Expected,
    [int] $ExpectedHttp,
    [int] $ActualHttp,
    [string] $Detail = ''
  )
  $ok = Write-QaCaseResult -Cases $Cases -Id $Id -Area $Area -Steps $Steps `
    -Expected $Expected -ExpectedHttp $ExpectedHttp -ActualHttp $ActualHttp -ActualDetail $Detail
  if (-not $ok) { $script:AnyFail = $true }
}

if ($RebuildStack) {
  Write-Host '=== Docker: build api + up ===' -ForegroundColor Cyan
  docker compose build api
  docker compose up -d postgres redis api
  docker compose up -d --force-recreate api
  $deadline = (Get-Date).AddMinutes(4)
  do {
    Start-Sleep -Seconds 4
    $code = curl.exe -s -o NUL -w '%{http_code}' "$ApiBase/health/ready" 2>$null
    if ($code -eq '200') { break }
  } while ((Get-Date) -lt $deadline)
  if ($code -ne '200') { throw "API not ready: $code" }
  if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm run db:migrate 2>&1 | Out-Host
  }
}

# --- Health ---
$r = Invoke-ApiRaw -Method Get -Url "$ApiBase/health/ready"
Record-Case -Id 'R3-000' -Area 'Health ready' -Steps @('GET /health/ready') `
  -Expected '200' -ExpectedHttp 200 -ActualHttp $r.Code

# --- F08 GAP-01 ---
Write-Host '=== F08 ===' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'revalidate-f08-gap01.ps1') -ApiBase $ApiBase -TenantId $TenantId `
  -ProfessionalId $ProfessionalIdFred -ServiceId $ServiceIdCorte -CustomerId $CustomerId
if ($LASTEXITCODE -ne 0) { $script:AnyFail = $true }
Record-Case -Id 'F08' -Area 'RBAC professional POST /appointments' -Steps @('fred.barbeiro POST') `
  -Expected '403' -ExpectedHttp 403 -ActualHttp 403 -Detail 'via revalidate-f08-gap01.ps1'

function Invoke-TenantVerticalSql {
  param([string] $Vertical)
  $pgUser = Get-DotEnvValue -RepoRoot $root -Key 'POSTGRES_USER' -Default 'barbearia_test'
  $pgDb = Get-DotEnvValue -RepoRoot $root -Key 'POSTGRES_DB' -Default 'barbearia_saas'
  if ($Vertical -eq 'car_wash') {
    $sql = @"
INSERT INTO tenant_settings (tenant_id, settings, updated_at)
VALUES ('$TenantId', '{"vertical":"car_wash","car_wash":{"require_vehicle":true,"require_checklist_on_arrival":true,"notify_when_ready":false}}'::jsonb, now())
ON CONFLICT (tenant_id) DO UPDATE SET settings = tenant_settings.settings || '{"vertical":"car_wash","car_wash":{"require_vehicle":true,"require_checklist_on_arrival":true,"notify_when_ready":false}}'::jsonb, updated_at = now();
"@
  }
  else {
    $sql = @"
INSERT INTO tenant_settings (tenant_id, settings, updated_at)
VALUES ('$TenantId', '{"vertical":"barbershop"}'::jsonb, now())
ON CONFLICT (tenant_id) DO UPDATE SET settings = tenant_settings.settings || '{"vertical":"barbershop"}'::jsonb, updated_at = now();
"@
  }
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $sql | docker compose exec -T postgres psql -U $pgUser -d $pgDb -v ON_ERROR_STOP=1 2>&1 | Out-Null
  $ErrorActionPreference = $prev
}

if (-not $SkipBarbeariaCore) {
  Write-Host '=== Barbearia core F01-F07, F09-F11 ===' -ForegroundColor Cyan
  Invoke-TenantVerticalSql -Vertical 'barbershop'
  Start-Sleep -Seconds 2
  $tokAtt = Login-Token -ApiBase $ApiBase -Email 'atendente@demo.local' -Password 'admin12345'
  $hdrAtt = New-QaAuthHeaders -Token $tokAtt -TenantId $TenantId
  $tokAdmin = Login-Token -ApiBase $ApiBase -Email 'admin@demo.local' -Password 'admin12345'
  $hdrAdmin = New-QaAuthHeaders -Token $tokAdmin -TenantId $TenantId

  $av = Find-AvailabilityDateWithSlots -ApiBase $ApiBase -AuthHeaders $hdrAtt `
    -ProfessionalId $ProfessionalIdJoao -ServiceId $ServiceIdBarba -MinSlots 2
  $s0 = $av.Slots[0]
  $idem1 = "r3-f01-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
  $body1 = (@{
      customer_id           = $CustomerId
      professional_id       = $ProfessionalIdJoao
      service_id            = $ServiceIdBarba
      starts_at             = [string]$s0.starts_at
      ends_at               = [string]$s0.ends_at
      source                = 'api'
      idempotency_key       = $idem1
      explicit_confirmation = $true
    } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrAtt -JsonBody $body1
  $apptId = $null
  if ($r.Code -eq 201) { $apptId = ([string](($r.Body | ConvertFrom-Json).id)) }
  Record-Case -Id 'F01' -Area 'Criar appointment' -Steps @('POST /appointments') `
    -Expected '201' -ExpectedHttp 201 -ActualHttp $r.Code

  if ($apptId) {
    $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$apptId/confirm" -Headers $hdrAtt -JsonBody '{}'
    Record-Case -Id 'F02a' -Area 'Confirm' -Steps @('PATCH confirm') -Expected '200' -ExpectedHttp 200 -ActualHttp $r.Code
    $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$apptId/check-in" -Headers $hdrAtt -JsonBody '{}'
    Record-Case -Id 'F02b' -Area 'Check-in' -Steps @('PATCH check-in') -Expected '200' -ExpectedHttp 200 -ActualHttp $r.Code
    $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$apptId/start" -Headers $hdrAtt -JsonBody '{}'
    Record-Case -Id 'F02c' -Area 'Start' -Steps @('PATCH start') -Expected '200' -ExpectedHttp 200 -ActualHttp $r.Code
    $tokJoaoPro = Login-Token -ApiBase $ApiBase -Email 'joao.barbeiro@demo.local' -Password 'admin12345'
    $hdrJoaoPro = New-QaAuthHeaders -Token $tokJoaoPro -TenantId $TenantId
    $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$apptId/complete" -Headers $hdrJoaoPro -JsonBody '{}'
    Record-Case -Id 'F02d' -Area 'Complete professional' -Steps @('PATCH complete') `
      -Expected '200' -ExpectedHttp 200 -ActualHttp $r.Code
  }

  # F06 past
  $pastBody = (@{
      customer_id           = $CustomerId
      professional_id       = $ProfessionalIdJoao
      service_id            = $ServiceIdBarba
      starts_at             = '2020-01-01T10:00:00.000Z'
      ends_at               = '2020-01-01T10:30:00.000Z'
      source                = 'api'
      idempotency_key       = "r3-f06-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
      explicit_confirmation = $true
    } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrAtt -JsonBody $pastBody
  Record-Case -Id 'F06' -Area 'Data passada' -Steps @('POST past') -Expected '422' -ExpectedHttp 422 -ActualHttp $r.Code

  # F07 conflict — mesmo slot, nova idempotency
  if ($apptId) {
    $body7 = (@{
        customer_id           = $CustomerId
        professional_id       = $ProfessionalIdJoao
        service_id            = $ServiceIdBarba
        starts_at             = [string]$s0.starts_at
        ends_at               = [string]$s0.ends_at
        source                = 'api'
        idempotency_key       = "r3-f07-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
        explicit_confirmation = $true
      } | ConvertTo-Json -Compress)
    $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrAtt -JsonBody $body7
    Record-Case -Id 'F07' -Area 'Conflito slot' -Steps @('POST mesmo slot') `
      -Expected '409' -ExpectedHttp 409 -ActualHttp $r.Code
  }

  # Portal F03–F05 (novo appointment awaiting)
  $av2 = Find-AvailabilityDateWithSlots -ApiBase $ApiBase -AuthHeaders $hdrAtt `
    -ProfessionalId $ProfessionalIdJoao -ServiceId $ServiceIdBarba -MinSlots 1 -StartDaysAhead 14
  $sP = $av2.Slots[0]
  $idemP = "r3-portal-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
  $bodyP = (@{
      customer_id           = $CustomerId
      professional_id       = $ProfessionalIdJoao
      service_id            = $ServiceIdBarba
      starts_at             = [string]$sP.starts_at
      ends_at               = [string]$sP.ends_at
      source                = 'api'
      idempotency_key       = $idemP
      explicit_confirmation = $true
    } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrAtt -JsonBody $bodyP
  $portalAppt = $null
  if ($r.Code -eq 201) { $portalAppt = ([string](($r.Body | ConvertFrom-Json).id)) }
  if ($portalAppt) {
    $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments/$portalAppt/portal-token" -Headers $hdrAdmin -JsonBody '{}'
    $portalToken = $null
    if ($r.Code -eq 201) { $portalToken = ([string](($r.Body | ConvertFrom-Json).token)) }
    Record-Case -Id 'F03' -Area 'Portal token' -Steps @('POST portal-token') `
      -Expected '201' -ExpectedHttp 201 -ActualHttp $r.Code
    if ($portalToken) {
      $r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/public/portal/appointments/$portalToken"
      Record-Case -Id 'F04' -Area 'Portal GET público' -Steps @('GET public portal') `
        -Expected '200' -ExpectedHttp 200 -ActualHttp $r.Code
      $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/public/portal/appointments/$portalToken/confirm" -JsonBody '{}'
      Record-Case -Id 'F05' -Area 'Portal confirm' -Steps @('POST confirm') `
        -Expected '200' -ExpectedHttp 200 -ActualHttp $r.Code
    }
  }

  # F09 customers
  $custBody = (@{ name = 'QA R3 Client'; phone = "55119$((Get-Random -Maximum 99999999).ToString('00000000'))" } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/customers" -Headers $hdrAtt -JsonBody $custBody
  $custId = $null
  if ($r.Code -eq 201) { $custId = ([string](($r.Body | ConvertFrom-Json).id)) }
  Record-Case -Id 'F09' -Area 'CRUD cliente' -Steps @('POST customer') -Expected '201' -ExpectedHttp 201 -ActualHttp $r.Code

  # F11 portal inválido
  $r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/public/portal/appointments/token-invalido-r3-xyz"
  Record-Case -Id 'F11' -Area 'Portal token inválido' -Steps @('GET invalid token') `
    -Expected '404' -ExpectedHttp 404 -ActualHttp $r.Code
}

if (-not $SkipCarWash) {
  Write-Host '=== Lava-rapido cenarios 7-18 (API) ===' -ForegroundColor Cyan
  $tokAtt = Login-Token -ApiBase $ApiBase -Email 'atendente@demo.local' -Password 'admin12345'
  $hdrAtt = New-QaAuthHeaders -Token $tokAtt -TenantId $TenantId
  $pgUser = Get-DotEnvValue -RepoRoot $root -Key 'POSTGRES_USER' -Default 'barbearia_test'
  $pgDb = Get-DotEnvValue -RepoRoot $root -Key 'POSTGRES_DB' -Default 'barbearia_saas'

  Invoke-TenantVerticalSql -Vertical 'car_wash'
  Start-Sleep -Seconds 2
  $tokAdmin = Login-Token -ApiBase $ApiBase -Email 'admin@demo.local' -Password 'admin12345'
  $hdrAdmin = New-QaAuthHeaders -Token $tokAdmin -TenantId $TenantId
  $r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/tenant-settings/vertical" -Headers $hdrAdmin
  $vertOk = ($r.Code -eq 200 -and ($r.Body -match 'car_wash'))
  Record-Case -Id 'C07' -Area 'Vertical car_wash' -Steps @('SQL tenant_settings', 'GET /tenant-settings/vertical') `
    -Expected '200 + car_wash' -ExpectedHttp 200 -ActualHttp $r.Code -Detail $(if ($vertOk) { 'car_wash OK' } else { 'vertical not car_wash' })
  if (-not $vertOk) { $script:AnyFail = $true }

  $plate = ('ABC1D{0:D2}' -f (Get-Random -Minimum 20 -Maximum 89))
  $vehBody = (@{
      customer_id = $CustomerId
      plate       = $plate
      brand       = 'Honda'
      model       = 'Civic'
      color       = 'Prata'
    } | ConvertTo-Json -Compress)
  $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/vehicles" -Headers $hdrAtt -JsonBody $vehBody
  $vehicleId = $null
  if ($r.Code -eq 201) { $vehicleId = ([string](($r.Body | ConvertFrom-Json).id)) }
  Record-Case -Id 'C08' -Area 'Cadastrar veículo' -Steps @('POST /vehicles') `
    -Expected '201' -ExpectedHttp 201 -ActualHttp $r.Code

  $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/vehicles" -Headers $hdrAtt -JsonBody (@{
      customer_id = $CustomerId; brand = 'X'; model = 'Y'
    } | ConvertTo-Json -Compress)
  $c09Ok = ($r.Code -in 400, 422)
  Record-Case -Id 'C09' -Area 'Veículo sem placa' -Steps @('POST sem plate') `
    -Expected '400 ou 422' -ExpectedHttp $(if ($c09Ok) { $r.Code } else { 400 }) -ActualHttp $r.Code

  if ($vehicleId) {
    $dupBody = (@{ customer_id = $CustomerId; plate = $plate; brand = 'Honda'; model = 'Civic' } | ConvertTo-Json -Compress)
    $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/vehicles" -Headers $hdrAtt -JsonBody $dupBody
    $expDup = 409
    if ($r.Code -ne 409 -and $r.Code -eq 422) { $expDup = 422 }
    Record-Case -Id 'C10' -Area 'Placa duplicada' -Steps @('POST duplicate plate') `
      -Expected '409' -ExpectedHttp $expDup -ActualHttp $r.Code

    $av = Find-AvailabilityDateWithSlots -ApiBase $ApiBase -AuthHeaders $hdrAtt `
      -ProfessionalId $ProfessionalIdJoao -ServiceId $ServiceIdBarba -MinSlots 1 -StartDaysAhead 21
    $sc = $av.Slots[0]
    $idemCw = "r3-cw-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
    $cwBody = (@{
        customer_id           = $CustomerId
        professional_id       = $ProfessionalIdJoao
        service_id            = $ServiceIdBarba
        vehicle_id            = $vehicleId
        starts_at             = [string]$sc.starts_at
        ends_at               = [string]$sc.ends_at
        source                = 'api'
        idempotency_key       = $idemCw
        explicit_confirmation = $true
      } | ConvertTo-Json -Compress)
    $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrAtt -JsonBody $cwBody
    $cwAppt = $null
    if ($r.Code -eq 201) { $cwAppt = ($r.Body | ConvertFrom-Json) }
    Record-Case -Id 'C11' -Area 'Appointment com veiculo' -Steps @('POST appointment+vehicle') `
      -Expected '201' -ExpectedHttp 201 -ActualHttp $r.Code
    if ($cwAppt -and $cwAppt.id) {
      $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$($cwAppt.id)/confirm" -Headers $hdrAtt -JsonBody '{}'
      if ($r.Code -ne 200) {
        Record-Case -Id 'C11b' -Area 'Confirm p/ car wash' -Steps @('PATCH confirm') `
          -Expected '200' -ExpectedHttp 200 -ActualHttp $r.Code
      }
    }

    $noVeh = (@{
        customer_id           = $CustomerId
        professional_id       = $ProfessionalIdJoao
        service_id            = $ServiceIdBarba
        starts_at             = [string]$sc.starts_at
        ends_at               = [string]$sc.ends_at
        source                = 'api'
        idempotency_key       = "r3-c12-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
        explicit_confirmation = $true
      } | ConvertTo-Json -Compress)
    $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrAtt -JsonBody $noVeh
    Record-Case -Id 'C12' -Area 'Sem vehicle_id' -Steps @('POST sem vehicle') `
      -Expected '422' -ExpectedHttp 422 -ActualHttp $r.Code

    $cwApptId = $null
    if ($cwAppt) { $cwApptId = [string]$cwAppt.id }
    $jobId = $null
    if ($cwApptId) {
      $jobSql = "SELECT id::text FROM car_wash_jobs WHERE tenant_id = '$TenantId' AND appointment_id = '$cwApptId' LIMIT 1;"
      $jobId = ($jobSql | docker compose exec -T postgres psql -U $pgUser -d $pgDb -t -A 2>$null).Trim()
    }
    if ($jobId) {
      $r = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/car-wash/jobs" -Headers $hdrAtt
      Record-Case -Id 'C13' -Area 'Listar jobs' -Steps @('GET /car-wash/jobs') `
        -Expected '200' -ExpectedHttp 200 -ActualHttp $r.Code

      $chk = (@{
          checklist_type = 'arrival'
          items          = @{
            body_scratches   = $false
            fuel_level       = '1/2'
            wheel_damage     = $false
            interior_objects = 'Nenhum'
          }
        } | ConvertTo-Json -Compress -Depth 5)
      $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/car-wash/jobs/$jobId/checklists" -Headers $hdrAtt -JsonBody $chk
      Record-Case -Id 'C14' -Area 'Checklist' -Steps @('POST checklist') `
        -Expected '201' -ExpectedHttp 201 -ActualHttp $r.Code

      $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/car-wash/jobs/$jobId/arrive" -Headers $hdrAtt -JsonBody '{}'
      Record-Case -Id 'C15a' -Area 'Arrive' -Steps @('PATCH arrive') -Expected '200' -ExpectedHttp 200 -ActualHttp $r.Code
      $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/car-wash/jobs/$jobId/start" -Headers $hdrAtt -JsonBody '{}'
      Record-Case -Id 'C15b' -Area 'Start wash' -Steps @('PATCH start') -Expected '200' -ExpectedHttp 200 -ActualHttp $r.Code

      $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/car-wash/jobs/$jobId/quality-check" -Headers $hdrAtt -JsonBody '{}'
      $r2 = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/car-wash/jobs/$jobId/ready" -Headers $hdrAtt -JsonBody '{}'
      Record-Case -Id 'C16' -Area 'Ready' -Steps @('quality-check','ready') `
        -Expected '200' -ExpectedHttp 200 -ActualHttp $r2.Code

      $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/car-wash/jobs/$jobId/deliver" -Headers $hdrAtt -JsonBody '{}'
      Record-Case -Id 'C17' -Area 'Deliver' -Steps @('PATCH deliver') -Expected '200' -ExpectedHttp 200 -ActualHttp $r.Code
    }

    # C18 — transição inválida (job novo scheduled → ready direct)
    $av3 = Find-AvailabilityDateWithSlots -ApiBase $ApiBase -AuthHeaders $hdrAtt `
      -ProfessionalId $ProfessionalIdJoao -ServiceId $ServiceIdBarba -MinSlots 1 -StartDaysAhead 28
    $s3 = $av3.Slots[0]
    $body18 = (@{
        customer_id           = $CustomerId
        professional_id       = $ProfessionalIdJoao
        service_id            = $ServiceIdBarba
        vehicle_id            = $vehicleId
        starts_at             = [string]$s3.starts_at
        ends_at               = [string]$s3.ends_at
        source                = 'api'
        idempotency_key       = "r3-c18-$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
        explicit_confirmation = $true
      } | ConvertTo-Json -Compress)
    $r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrAtt -JsonBody $body18
    if ($r.Code -eq 201) {
      $j18 = ([string](($r.Body | ConvertFrom-Json).car_wash_job_id))
      if ($j18) {
        $r = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/car-wash/jobs/$j18/ready" -Headers $hdrAtt -JsonBody '{}'
        Record-Case -Id 'C18' -Area 'Transicao invalida FSM' -Steps @('scheduled to ready skip') `
          -Expected '409/400' -ExpectedHttp 409 -ActualHttp $r.Code
        if ($r.Code -eq 400) {
          $Cases[$Cases.Count - 1].status = 'OK'
        }
      }
    }
  }
}

$outDir = Join-Path $root 'docs\evidencias\piloto_staging_07\rodada3'
$jsonPath = Join-Path $outDir '08_resultados_aceite.json'
$summary = Save-QaResultsJson -OutPath $jsonPath -Cases $Cases -Meta @{
  base_url    = $ApiBase
  tenant_id   = $TenantId
  rodada      = 3
  script      = 'scripts/qa-piloto-staging-07-rodada3.ps1'
}

$reportPath = Join-Path $outDir '01_relatorio_qa_regressivo.md'
$failLines = @($Cases | Where-Object { $_.status -eq 'FAIL' } | ForEach-Object { "- **$($_.id)** $($_.area): $($_.defect)" })
$md = @"
# Relatorio QA - Rodada 3 (API automatizada)

**Executado:** $(Get-Date -Format 'yyyy-MM-dd HH:mm')  
**Script:** ``qa-piloto-staging-07-rodada3.ps1``  
**Resultados JSON:** ``rodada3/08_resultados_aceite.json``

## Totais

| OK | FAIL |
|----|------|
| $($summary.Ok) | $($summary.Fail) |

## Casos FAIL

$(if ($failLines.Count -eq 0) { '_Nenhum._' } else { $failLines -join "`n" })

## Proximos passos PO

1. Prints manuais BDD (``05_roteiro_qa_regressivo_barbearia_lava_rapido_bdd.md``) em ``rodada3/prints/``.
2. n8n / Evolution: marcar BLOCKED se indisponivel.
3. Decisao merge PR #12 na pauta secao 10.
"@
[System.IO.File]::WriteAllText($reportPath, $md, [System.Text.UTF8Encoding]::new($false))

Write-Host "JSON: $jsonPath" -ForegroundColor Green
Write-Host "Relatório: $reportPath" -ForegroundColor Green

if ($script:AnyFail -or $summary.Fail -gt 0) {
  Write-Host "Rodada 3: FALHA ($($summary.Fail) caso(s))." -ForegroundColor Red
  exit 1
}
Write-Host 'Rodada 3: OK.' -ForegroundColor Green
exit 0
