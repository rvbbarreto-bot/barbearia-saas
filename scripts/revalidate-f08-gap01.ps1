<#
.SYNOPSIS
  Revalidação F08 / GAP-01 — professional não pode POST /api/v1/appointments (403).

.EXAMPLE
  . .\scripts\devops-env.ps1 -InstallNodeIfMissing
  .\scripts\revalidate-f08-gap01.ps1 -RebuildApi
#>
param(
  [string] $ApiBase = 'http://localhost:3000',
  [string] $TenantId = '00000000-0000-0000-0000-000000000001',
  [string] $ProfessionalEmail = 'fred.barbeiro@demo.local',
  [string] $Password = 'admin12345',
  [string] $ProfessionalId = '00000000-0000-4000-8000-000000004011',
  [string] $ServiceId = '00000000-0000-4000-8000-000000004021',
  [string] $CustomerId = '00000000-0000-4000-8000-000000004031',
  [switch] $RebuildApi,
  [switch] $UpdateRodada2Json
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$helpers = Join-Path $PSScriptRoot 'lib\qa-api-helpers.ps1'
if (-not (Test-Path $helpers)) { throw "Helpers ausentes: $helpers" }
. $helpers

if ($RebuildApi) {
  Write-Host '=== Rebuild API (Docker) ===' -ForegroundColor Cyan
  docker compose build api
  docker compose up -d --force-recreate api
  $deadline = (Get-Date).AddMinutes(3)
  do {
    Start-Sleep -Seconds 3
    $code = curl.exe -s -o NUL -w '%{http_code}' "$ApiBase/health/ready" 2>$null
    if ($code -eq '200') { break }
  } while ((Get-Date) -lt $deadline)
  if ($code -ne '200') { throw "API não ficou ready: HTTP $code" }
  Write-Host 'API ready.' -ForegroundColor Green
}

Write-Host '=== F08 — GAP-01 RBAC ===' -ForegroundColor Cyan
$tokAtt = Login-Token -ApiBase $ApiBase -Email 'atendente@demo.local' -Password $Password
$hdrAtt = New-QaAuthHeaders -Token $tokAtt -TenantId $TenantId

$av = Find-AvailabilityDateWithSlots -ApiBase $ApiBase -AuthHeaders $hdrAtt `
  -ProfessionalId $ProfessionalId -ServiceId $ServiceId -MinSlots 1
$slot = $av.Slots[$av.Slots.Count - 1]

$tokPro = Login-Token -ApiBase $ApiBase -Email $ProfessionalEmail -Password $Password
$hdrPro = New-QaAuthHeaders -Token $tokPro -TenantId $TenantId

$idem = "qa-f08-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$body = (@{
    customer_id           = $CustomerId
    professional_id       = $ProfessionalId
    service_id            = $ServiceId
    starts_at             = [string]$slot.starts_at
    ends_at               = [string]$slot.ends_at
    source                = 'api'
    idempotency_key       = $idem
    explicit_confirmation = $true
  } | ConvertTo-Json -Compress)

$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrPro -JsonBody $body
$pass = ($r.Code -eq 403)

Write-Host "POST /appointments como professional: HTTP $($r.Code)" -ForegroundColor $(if ($pass) { 'Green' } else { 'Red' })
if ($r.Body) { Write-Host $r.Body }

if (-not $pass) {
  Write-Host 'F08 FAIL — esperado HTTP 403 FORBIDDEN' -ForegroundColor Red
  exit 1
}

Write-Host 'F08 PASS — GAP-01 fechado em ambiente Docker/API.' -ForegroundColor Green

if ($UpdateRodada2Json) {
  $jsonPath = Join-Path $root 'docs\evidencias\piloto_staging_07\rodada2\08_resultados_aceite.json'
  if (Test-Path $jsonPath) {
    $doc = Get-Content $jsonPath -Raw | ConvertFrom-Json
    $f08 = @($doc.cases | Where-Object { $_.id -eq 'F08' })
    if ($f08.Count -eq 1) {
      $f08[0].actual = 'HTTP 403 FORBIDDEN (revalidação Docker)'
      $f08[0].status = 'OK'
      $f08[0].defect = ''
      $f08[0].evidence = "scripts/revalidate-f08-gap01.ps1 @ $(Get-Date -Format o)"
      $doc.executed_at = (Get-Date).ToUniversalTime().ToString('o')
      $ok = @($doc.cases | Where-Object { $_.status -eq 'OK' }).Count
      $fail = @($doc.cases | Where-Object { $_.status -eq 'FAIL' }).Count
      $doc.totals.OK = $ok
      $doc.totals.FAIL = $fail
      $doc | ConvertTo-Json -Depth 8 | Set-Content -Path $jsonPath -Encoding UTF8
      Write-Host "Actualizado: $jsonPath" -ForegroundColor Green
    }
  }
}

exit 0
