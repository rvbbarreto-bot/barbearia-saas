<#
.SYNOPSIS
  Gera portal-token para evidencias P07_14/P07_15 e regista matriz browser (API + paths).

  Prints UI: executar via browser MCP ou manualmente conforme roteiro BDD.
  Este script cobre API (portal token) e copia instrucoes para prints/.
#>
param(
  [string] $ApiBase = 'http://localhost:3000',
  [string] $WebBase = 'http://localhost:5173',
  [string] $TenantId = '00000000-0000-0000-0000-000000000001'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
. (Join-Path $PSScriptRoot 'lib\qa-api-helpers.ps1')

$printsDir = Join-Path $root 'docs\evidencias\piloto_staging_07\prints'
$rodada3Dir = Join-Path $root 'docs\evidencias\piloto_staging_07\rodada3'
if (-not (Test-Path $printsDir)) { New-Item -ItemType Directory -Path $printsDir -Force | Out-Null }
if (-not (Test-Path $rodada3Dir)) { New-Item -ItemType Directory -Path $rodada3Dir -Force | Out-Null }

$tokAtt = Login-Token -ApiBase $ApiBase -Email 'atendente@demo.local' -Password 'admin12345'
$hdrAtt = New-QaAuthHeaders -Token $tokAtt -TenantId $TenantId
$tokAdmin = Login-Token -ApiBase $ApiBase -Email 'admin@demo.local' -Password 'admin12345'
$hdrAdmin = New-QaAuthHeaders -Token $tokAdmin -TenantId $TenantId

# barbershop for portal demo
$pgUser = Get-DotEnvValue -RepoRoot $root -Key 'POSTGRES_USER' -Default 'barbearia_test'
$pgDb = Get-DotEnvValue -RepoRoot $root -Key 'POSTGRES_DB' -Default 'barbearia_saas'
$sqlBarber = @"
INSERT INTO tenant_settings (tenant_id, settings, updated_at)
VALUES ('$TenantId', '{"vertical":"barbershop"}'::jsonb, now())
ON CONFLICT (tenant_id) DO UPDATE SET settings = tenant_settings.settings || '{"vertical":"barbershop"}'::jsonb, updated_at = now();
"@
$sqlBarber | docker compose exec -T postgres psql -U $pgUser -d $pgDb -v ON_ERROR_STOP=1 2>&1 | Out-Null

$proId = '00000000-0000-4000-8000-000000004012'
$svcId = '00000000-0000-4000-8000-000000004022'
$custId = '00000000-0000-4000-8000-000000004031'
$av = Find-AvailabilityDateWithSlots -ApiBase $ApiBase -AuthHeaders $hdrAtt -ProfessionalId $proId -ServiceId $svcId -MinSlots 1 -StartDaysAhead 21
$slot = $av.Slots[0]
$body = (@{
    customer_id           = $custId
    professional_id       = $proId
    service_id            = $svcId
    starts_at             = [string]$slot.starts_at
    ends_at               = [string]$slot.ends_at
    source                = 'api'
    idempotency_key       = "qa-portal-ev-$([Guid]::NewGuid().ToString('N').Substring(0,10))"
    explicit_confirmation = $true
  } | ConvertTo-Json -Compress)
$r = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments" -Headers $hdrAtt -JsonBody $body
$apptId = ($r.Body | ConvertFrom-Json).id
$rTok = Invoke-ApiRaw -Method Post -Url "$ApiBase/api/v1/appointments/$apptId/portal-token" -Headers $hdrAdmin -JsonBody '{}'
$portalToken = ($rTok.Body | ConvertFrom-Json).token

$manifest = [ordered]@{
  generated_at  = (Get-Date).ToUniversalTime().ToString('o')
  web_base        = $WebBase
  api_base        = $ApiBase
  portal_valid    = "$WebBase/portal/$portalToken"
  portal_invalid  = "$WebBase/portal/token-invalido-qa-staging07"
  routes_manual   = @(
    @{ print = 'P07_01_login_admin.png'; url = "$WebBase/login"; user = 'admin@demo.local' }
    @{ print = 'P07_02_agenda_barbearia.png'; url = "$WebBase/agenda" }
    @{ print = 'P07_04_dashboard_gestao.png'; url = "$WebBase/gestao/dashboard" }
    @{ print = 'P07_03_cliente_360.png'; url = "$WebBase/clientes" }
    @{ print = 'P07_09_outbox.png'; url = "$WebBase/operacao/mensagens" }
    @{ print = 'P07_10_auditoria.png'; url = "$WebBase/operacao/auditoria" }
    @{ print = 'P07_14_portal_token_valido.png'; url = "$WebBase/portal/$portalToken" }
    @{ print = 'P07_15_portal_token_invalido.png'; url = "$WebBase/portal/token-invalido-qa-staging07" }
    @{ print = 'P07_18_forbidden.png'; url = "$WebBase/gestao/dashboard"; user = 'atendente@demo.local' }
  )
}
$manifestPath = Join-Path $rodada3Dir '02_browser_manifest.json'
$manifest | ConvertTo-Json -Depth 6 | Set-Content -Path $manifestPath -Encoding UTF8
$tokenPath = Join-Path $rodada3Dir '_portal_token.txt'
Set-Content -Path $tokenPath -Value $portalToken -Encoding UTF8 -NoNewline

Write-Host "Manifest: $manifestPath"
Write-Host "Portal valido: $WebBase/portal/$portalToken"
Write-Host "Portal invalido: $WebBase/portal/token-invalido-qa-staging07"
