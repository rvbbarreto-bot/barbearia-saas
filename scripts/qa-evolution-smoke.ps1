<#
.SYNOPSIS
  PS-08.4 — Smoke Evolution local (sem imprimir API key).

.EXAMPLE
  .\scripts\qa-evolution-up.ps1
  .\scripts\qa-evolution-smoke.ps1
#>
param(
  [string] $HostUrl = 'http://localhost:8081',
  [string] $InstanceName = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-EnvFromDotEnv([string] $Key) {
  $path = Join-Path $root '.env'
  if (-not (Test-Path $path)) { return $null }
  $line = Get-Content $path | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -replace "^\s*$Key\s*=\s*", '').Trim().Trim('"').Trim("'")
}

if (-not $InstanceName) {
  $InstanceName = Get-EnvFromDotEnv 'EVOLUTION_INSTANCE'
}

Write-Host "==> Evolution root: $HostUrl/"
try {
  $r = Invoke-WebRequest -Uri "$HostUrl/" -UseBasicParsing -TimeoutSec 15
  Write-Host "PASS — HTTP $($r.StatusCode)"
} catch {
  $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  if ($code -ge 200 -and $code -lt 500) {
    Write-Host "PASS — HTTP $code (serviço respondeu)"
  } else {
    Write-Host "FAIL — Evolution inacessível em $HostUrl"
    Write-Host "  Execute: .\scripts\qa-evolution-up.ps1"
    exit 1
  }
}

$keySet = [bool](Get-EnvFromDotEnv 'EVOLUTION_API_KEY')
if ($keySet) { Write-Host "EVOLUTION_API_KEY=SET (valor não exibido)" } else { Write-Host "WARN — EVOLUTION_API_KEY ausente no .env" }

if ($InstanceName) {
  Write-Host "EVOLUTION_INSTANCE=$InstanceName"
  Write-Host "Instância: validar connectionStatus=open no manager Evolution antes do workflow n8n 03_QA."
} else {
  Write-Host "WARN — EVOLUTION_INSTANCE não definido no .env"
  Write-Host "Crie instância no manager Evolution e alinhe EVOLUTION_INSTANCE (ex.: teste)."
}

Write-Host ""
Write-Host "QA doc 10 — C35/C36: após instância open, executar workflow 03_QA no n8n (http://localhost:5679)."
Write-Host "Print evidência: docs/evidencias/piloto_staging_08/prints/PS08_04_evolution_health.png"
