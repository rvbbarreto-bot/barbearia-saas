<#
.SYNOPSIS
  PS-08.4 — Sobe Evolution API no Docker (profile evolution) e valida health em :8081.

.EXAMPLE
  Copy-Item .env.example .env   # preencher EVOLUTION_API_KEY e EVOLUTION_POSTGRES_PASSWORD
  docker compose up -d postgres redis api n8n
  .\scripts\qa-evolution-up.ps1
#>
param(
  [int] $WaitSeconds = 120,
  [string] $HostUrl = 'http://localhost:8081'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$compose = @(
  'compose',
  '-f', 'docker-compose.yml',
  '-f', 'docker-compose.evolution-stack.yml',
  '--profile', 'evolution'
)

Write-Host "==> Subindo evolution-postgres + evolution (profile evolution)..."
& docker @compose up -d evolution-postgres evolution
if ($LASTEXITCODE -ne 0) { throw "docker compose up falhou ($LASTEXITCODE)" }

Write-Host "==> Aguardando healthcheck (max ${WaitSeconds}s)..."
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$healthy = $false
while ((Get-Date) -lt $deadline) {
  $status = docker inspect -f '{{.State.Health.Status}}' barbearia-evolution 2>$null
  if ($status -eq 'healthy') {
    $healthy = $true
    break
  }
  if ($status -eq 'unhealthy') {
    Write-Host "Container unhealthy — últimos logs:"
    docker logs --tail 40 barbearia-evolution
    throw "barbearia-evolution unhealthy"
  }
  Start-Sleep -Seconds 3
}
if (-not $healthy) {
  docker logs --tail 40 barbearia-evolution
  throw "Timeout aguardando barbearia-evolution healthy"
}

Write-Host "==> HTTP GET $HostUrl/"
try {
  $code = (Invoke-WebRequest -Uri $HostUrl/ -UseBasicParsing -TimeoutSec 15).StatusCode
  Write-Host "OK — HTTP $code em $HostUrl"
} catch {
  if ($_.Exception.Response) {
    $code = [int]$_.Exception.Response.StatusCode
    Write-Host "OK — HTTP $code em $HostUrl (resposta recebida)"
  } else {
    throw "Falha ao contactar Evolution em ${HostUrl}: $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "Próximos passos:"
Write-Host "  1. Recriar api/n8n com URL interna:"
Write-Host "     docker compose -f docker-compose.yml -f docker-compose.evolution-stack.yml --profile evolution up -d --force-recreate api n8n"
Write-Host "  2. Criar instância WhatsApp na UI/manager Evolution (QR) — nome = EVOLUTION_INSTANCE no .env"
Write-Host "  3. .\scripts\qa-evolution-smoke.ps1"
Write-Host "  4. n8n :5679 — workflow 03_QA_Barbearia_Evolution_SendText_Smoke (manual, active=false)"
