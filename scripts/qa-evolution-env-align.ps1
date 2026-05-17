#requires -Version 5.1
<#
  Alinha Evolution (AUTHENTICATION_API_KEY) com EVOLUTION_API_KEY do .env da raiz.
  Não imprime segredos completos. Não usa docker compose down -v.
#>
param(
  [string] $RepoRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent),
  [string] $EvolutionCompose = 'C:\Projetos\docker-compose.yml',
  [switch] $SkipRecreate
)

$ErrorActionPreference = 'Stop'
$envFile = Join-Path $RepoRoot '.env'
if (-not (Test-Path $envFile)) { throw ".env ausente em $RepoRoot" }

function Get-EnvValue([string] $name) {
  $line = Get-Content $envFile | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -Last 1
  if (-not $line) { return $null }
  return ($line -split '=', 2)[1].Trim()
}

function Mask-Key([string] $val) {
  if (-not $val) { return @{ status = 'MISSING'; len = 0; last4 = '' } }
  $s = $val.Trim()
  @{ status = 'SET'; len = $s.Length; last4 = if ($s.Length -ge 4) { $s.Substring($s.Length - 4) } else { $s } }
}

function Show-ContainerEnv([string] $label, [string] $container, [string[]] $vars) {
  foreach ($v in $vars) {
    $raw = docker exec $container printenv $v 2>$null
    if ($v -match 'KEY') {
      $m = Mask-Key $raw
      Write-Host "$label $v=$($m.status) len=$($m.len) last4=$($m.last4)"
    } else {
      if ($raw) { Write-Host "$label $v=$($raw.Trim())" } else { Write-Host "$label $v=MISSING" }
    }
  }
}

Write-Host '=== 1) Normalizar .env (remover duplicatas Evolution) ==='
& (Join-Path $RepoRoot 'scripts\normalize-evolution-env.ps1')

$key = Get-EnvValue 'EVOLUTION_API_KEY'
$url = Get-EnvValue 'EVOLUTION_API_URL'
$inst = Get-EnvValue 'EVOLUTION_INSTANCE'
$qa = Get-EnvValue 'QA_WHATSAPP_NUMBER'
$mk = Mask-Key $key
Write-Host "EVOLUTION_API_URL=$url"
Write-Host "EVOLUTION_INSTANCE=$inst"
Write-Host "QA_WHATSAPP_NUMBER=$qa"
Write-Host "EVOLUTION_API_KEY=$($mk.status) len=$($mk.len) last4=$($mk.last4)"

if (-not $SkipRecreate) {
  Write-Host '=== 2) Recriar evolution_api com --env-file (AUTHENTICATION_API_KEY alinhada) ==='
  if (-not (Test-Path $EvolutionCompose)) { throw "Compose Evolution nao encontrado: $EvolutionCompose" }
  docker compose -f $EvolutionCompose --env-file $envFile up -d --force-recreate evolution_api | Out-Host

  Write-Host '=== 3) Recriar api + n8n (barbearia stack) ==='
  Push-Location $RepoRoot
  docker compose -f docker-compose.yml -f docker-compose.evolution-local.yml up -d --force-recreate api n8n | Out-Host
  Pop-Location
}

Write-Host '=== 4) Inspecao mascarada ==='
Show-ContainerEnv 'evolution:' 'evolution_api' @('AUTHENTICATION_API_KEY','API_KEY','GLOBAL_API_KEY','EVOLUTION_API_KEY')
Show-ContainerEnv 'n8n:' 'barbearia-n8n' @('EVOLUTION_API_URL','EVOLUTION_INSTANCE','EVOLUTION_API_KEY','QA_WHATSAPP_NUMBER')
Show-ContainerEnv 'api:' 'barbearia-api' @('EVOLUTION_API_URL','EVOLUTION_INSTANCE','EVOLUTION_API_KEY')

Write-Host '=== 5) Teste direto Evolution (host -> localhost:8081) ==='
if (-not $key) { throw 'EVOLUTION_API_KEY ausente no .env' }
$body = @{ number = $qa; text = 'Teste manual Evolution — Barbearia QA' } | ConvertTo-Json -Compress
try {
  $resp = Invoke-WebRequest -Uri 'http://localhost:8081/message/sendText/teste' -Method POST `
    -Headers @{ apikey = $key; 'Content-Type' = 'application/json' } `
    -Body $body -UseBasicParsing -TimeoutSec 30
  Write-Host "Direct SendText HTTP $($resp.StatusCode)"
} catch {
  $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  Write-Host "Direct SendText HTTP $code — $($_.Exception.Message)"
}
