# PILOTO-STAGING-01 — smoke local (API health + git evidence)
# Uso: .\scripts\piloto-staging-01-smoke.ps1 [-ApiBase http://localhost:3000]

param(
  [string]$ApiBase = 'http://localhost:3000'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host '=== Git ===' -ForegroundColor Cyan
git fetch origin --prune 2>$null
git status --short --branch
git rev-parse HEAD

Write-Host ''
Write-Host "=== Health $ApiBase ===" -ForegroundColor Cyan
@('/health', '/health/ready', '/database/health') | ForEach-Object {
  $uri = "$ApiBase$_"
  try {
    $r = Invoke-RestMethod -Uri $uri -TimeoutSec 8
    Write-Host "OK $uri" -ForegroundColor Green
    $r | ConvertTo-Json -Compress
  } catch {
    Write-Host "FAIL $uri - $($_.Exception.Message)" -ForegroundColor Red
    exit 1
  }
}

Write-Host ''
Write-Host '=== Docker (barbearia*) ===' -ForegroundColor Cyan
docker ps --filter "name=barbearia" --format "table {{.Names}}\t{{.Status}}" 2>$null

Write-Host ''
Write-Host 'Smoke OK' -ForegroundColor Green
