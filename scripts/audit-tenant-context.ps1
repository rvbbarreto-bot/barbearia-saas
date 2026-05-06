# DEV/QA-07.1 — Varredura estática + inventário opcional de RLS na base.
#
# Uso:
#   pwsh -File scripts/audit-tenant-context.ps1
#     Exige DATABASE_URL (ex.: variável definida pelo harness run-api-integration-local.ps1
#     ou Postgres local com migrations aplicadas).
#   pwsh -File scripts/audit-tenant-context.ps1 -StaticOnly
#     Só ficheiros/repo; ignora base (remove DATABASE_URL temporariamente).
#
# Códigos de saída: 0 = OK; 1 = falha na auditoria; 2 = DATABASE_URL ausente (sem -StaticOnly).

param([switch]$StaticOnly)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$outDir = Join-Path (Join-Path $root 'artifacts') 'devqa-07-1'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = Join-Path $outDir "tenant-context-audit-$stamp.log"

if (-not $StaticOnly) {
  if (-not $env:DATABASE_URL) {
    Write-Host "DATABASE_URL ausente. Execute via scripts/run-api-integration-local.ps1 ou use -StaticOnly." -ForegroundColor Yellow
    exit 2
  }
}
else {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}

Push-Location (Join-Path $root 'apps/api')
try {
  node (Join-Path $root 'scripts/audit-tenant-context.mjs') 2>&1 | Tee-Object -FilePath $log
  if ($LASTEXITCODE -ne 0) { throw 'audit-tenant-context.mjs failed.' }
}
finally {
  Pop-Location
}
Write-Host "Log: $log"
