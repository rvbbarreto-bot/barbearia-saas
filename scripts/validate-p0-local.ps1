# Validação fail-fast P0 (API + Web). Falha no primeiro comando com código != 0.
# Uso: na raiz do repo, PowerShell 5.1+:  powershell -ExecutionPolicy Bypass -File scripts/validate-p0-local.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

function Step-ExitCode {
  param([string]$Label)
  if ($LASTEXITCODE -ne 0) {
    throw "$Label falhou com exit code $LASTEXITCODE"
  }
}

Write-Host "=== API: lint ===" -ForegroundColor Cyan
Set-Location "$root\apps\api"
npm run lint
Step-ExitCode "API lint"
Write-Host "=== API: typecheck ===" -ForegroundColor Cyan
npm run typecheck
Step-ExitCode "API typecheck"
Write-Host "=== API: test unit ===" -ForegroundColor Cyan
npm run test:unit
Step-ExitCode "API test:unit"

Write-Host "=== Web: lint ===" -ForegroundColor Cyan
Set-Location "$root\apps\web"
npm run lint
Step-ExitCode "Web lint"
Write-Host "=== Web: typecheck ===" -ForegroundColor Cyan
npm run typecheck
Step-ExitCode "Web typecheck"
Write-Host "=== Web: test ===" -ForegroundColor Cyan
npm test
Step-ExitCode "Web test"
Write-Host "=== Web: build ===" -ForegroundColor Cyan
npm run build
Step-ExitCode "Web build"

Set-Location $root
Write-Host "`nTodas as etapas P0 locais concluídas com sucesso." -ForegroundColor Green
