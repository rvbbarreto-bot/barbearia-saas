<#
.SYNOPSIS
  PS-08.2 — Massa QA reproduzível: pátio lava-rápido com job em Agendados na data fixa.

.DESCRIPTION
  - Ativa vertical car_wash no tenant demo
  - Garante veículo com placa PS08QA1
  - Cria agendamento confirmado em 2026-06-16 (se ainda não existir job scheduled nessa data)
  - Idempotente: reexecução segura

.EXAMPLE
  docker compose up -d postgres redis api
  .\scripts\qa-seed-car-wash-patio.ps1
#>
param(
  [string] $ApiBase = 'http://localhost:3000',
  [string] $TenantId = '00000000-0000-0000-0000-000000000001',
  [string] $QaDate = '2026-06-16',
  [string] $CustomerId = '00000000-0000-4000-8000-000000004031',
  [string] $ProfessionalId = '00000000-0000-4000-8000-000000004012',
  [string] $ServiceId = '00000000-0000-4000-8000-000000004022',
  [string] $SeedPlate = 'PS08QA1'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
. (Join-Path $PSScriptRoot 'lib\qa-api-helpers.ps1')

function Invoke-Psql([string] $Sql) {
  $pgUser = Get-DotEnvValue -RepoRoot $root -Key 'POSTGRES_USER' -Default 'barbearia_test'
  $pgDb = Get-DotEnvValue -RepoRoot $root -Key 'POSTGRES_DB' -Default 'barbearia_saas'
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = $Sql | docker compose exec -T postgres psql -U $pgUser -d $pgDb -v ON_ERROR_STOP=1 -t -A 2>&1
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -ne 0) { throw "psql falhou: $out" }
  return ($out | Out-String).Trim()
}

Write-Host "=== PS-08.2: seed pátio $QaDate ===" -ForegroundColor Cyan

Invoke-Psql @"
INSERT INTO tenant_settings (tenant_id, settings, updated_at)
VALUES (
  '$TenantId',
  '{"vertical":"car_wash","car_wash":{"require_vehicle":true,"require_checklist_on_arrival":true,"notify_when_ready":false}}'::jsonb,
  now()
)
ON CONFLICT (tenant_id) DO UPDATE SET
  settings = tenant_settings.settings || '{"vertical":"car_wash","car_wash":{"require_vehicle":true,"require_checklist_on_arrival":true,"notify_when_ready":false}}'::jsonb,
  updated_at = now();
"@ | Out-Null

Start-Sleep -Seconds 2

$tok = Login-Token -ApiBase $ApiBase -Email 'atendente@demo.local' -Password 'admin12345'
$hdr = New-QaAuthHeaders -Token $tok -TenantId $TenantId

$jobsUrl = "$ApiBase/api/v1/car-wash/jobs?date=$QaDate&stage=scheduled&limit=5"
$jr = Invoke-ApiRaw -Method Get -Url $jobsUrl -Headers $hdr
if ($jr.Code -eq 200) {
  $existing = ($jr.Body | ConvertFrom-Json).data
  if (@($existing).Count -gt 0) {
    $first = $existing[0]
    Write-Host "OK — já existe job scheduled em $QaDate (placa $($first.plate), id $($first.id))." -ForegroundColor Green
    exit 0
  }
}

$vehicleId = $null
$vr = Invoke-ApiRaw -Method Get -Url "$ApiBase/api/v1/vehicles?search=$SeedPlate&limit=5" -Headers $hdr
if ($vr.Code -eq 200) {
  $rows = @(($vr.Body | ConvertFrom-Json).data)
  if ($rows.Count -gt 0) { $vehicleId = [string]$rows[0].id }
}
if (-not $vehicleId) {
  $body = (@{
      customer_id = $CustomerId
      plate       = $SeedPlate
      brand       = 'QA'
      model       = 'PS08 Patio'
      color       = 'Prata'
    } | ConvertTo-Json -Compress)
  $cr = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/vehicles" -Headers $hdr -JsonBody $body
  if ($cr.Code -ne 201) { throw "POST vehicle falhou: HTTP $($cr.Code) $($cr.Body)" }
  $vehicleId = [string](($cr.Body | ConvertFrom-Json).id)
  Write-Host "Veículo criado: $SeedPlate ($vehicleId)"
}

$slots = Get-AvailabilitySlots -ApiBase $ApiBase -AuthHeaders $hdr `
  -ProfessionalId $ProfessionalId -ServiceId $ServiceId -DateStr $QaDate
if ($slots.Count -lt 1) {
  throw "Sem slots em $QaDate — verifique business_hours / seed 099 (profissional João, serviço Barba)."
}
$sc = $slots[0]
$idem = 'qa-ps08-patio-2026-06-16'
$apptBody = (@{
    customer_id           = $CustomerId
    professional_id       = $ProfessionalId
    service_id            = $ServiceId
    vehicle_id            = $vehicleId
    starts_at             = [string]$sc.starts_at
    ends_at               = [string]$sc.ends_at
    source                = 'api'
    idempotency_key       = $idem
    explicit_confirmation = $true
  } | ConvertTo-Json -Compress)
$ar = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdr -JsonBody $apptBody
if ($ar.Code -eq 409 -and ($ar.Body -match 'DUPLICATE_IDEMPOTENCY')) {
  Write-Host 'Agendamento já existe (idempotency) — a confirmar estado do job...' -ForegroundColor DarkYellow
}
elseif ($ar.Code -ne 201) {
  throw "POST appointment falhou: HTTP $($ar.Code) $($ar.Body)"
}
else {
  $appt = $ar.Body | ConvertFrom-Json
  $apptId = [string]$appt.id
  $cf = Invoke-ApiRaw -Method Patch -Url "$ApiBase/api/v1/appointments/$apptId/confirm" -Headers $hdr -JsonBody '{}'
  if ($cf.Code -ne 200) { throw "PATCH confirm falhou: HTTP $($cf.Code) $($cf.Body)" }
  Write-Host "Agendamento confirmado: $apptId"
}

$jr2 = Invoke-ApiRaw -Method Get -Url $jobsUrl -Headers $hdr
if ($jr2.Code -ne 200) { throw "GET jobs falhou: HTTP $($jr2.Code)" }
$after = @(($jr2.Body | ConvertFrom-Json).data)
if ($after.Count -lt 1) {
  throw "Job scheduled não encontrado após seed — verifique vertical car_wash e appointment."
}
Write-Host "OK — $($after.Count) job(s) em Agendados em $QaDate (ex.: placa $($after[0].plate))." -ForegroundColor Green
Write-Host 'Próximo: browser /operacao/lava-rapido com data 2026-06-16 (C15–C17).' -ForegroundColor DarkGray
