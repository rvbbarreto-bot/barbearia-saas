# Suíte E2E Robot — Barbearia SaaS
# Uso:
#   .\scripts\qa-e2e-suite.ps1
#   .\scripts\qa-e2e-suite.ps1 -Tags smoke
#   .\scripts\qa-e2e-suite.ps1 -Headless
#   .\scripts\qa-e2e-suite.ps1 -Pabot 2
param(
  [string]$Tags = '',
  [switch]$Headless,
  [int]$Pabot = 0,
  [string]$Specs = 'specs'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$TestsDir = Join-Path $Root 'tests'
Set-Location $TestsDir

if (-not $env:PLAYWRIGHT_BROWSERS_PATH) {
  $env:PLAYWRIGHT_BROWSERS_PATH = 'C:\playwright-browsers-barbearia'
}
if ($Headless) { $env:QA_HEADLESS = 'True' } else { $env:QA_HEADLESS = 'False' }

if (-not (Test-Path '.venv\Scripts\Activate.ps1')) {
  Write-Host '=== Setup: venv + pip + rfbrowser init ==='
  python -m venv .venv
  .\.venv\Scripts\Activate.ps1
  pip install -r requirements.txt
  rfbrowser init
} else {
  .\.venv\Scripts\Activate.ps1
}

$headlessExe = Join-Path $env:PLAYWRIGHT_BROWSERS_PATH 'chromium_headless_shell-1223\chrome-headless-shell-win64\chrome-headless-shell.exe'
if (-not (Test-Path $headlessExe)) {
  $wrapper = Join-Path $TestsDir '.venv\Lib\site-packages\Browser\wrapper'
  Push-Location $wrapper
  npx --yes playwright install chromium | Out-Host
  Pop-Location
}

New-Item -ItemType Directory -Force -Path evidence\screenshots, evidence\traces, evidence\videos, reports, defects | Out-Null

$outDir = 'reports\robot-output'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$robotArgs = @('-d', $outDir)
if ($Tags) { $robotArgs += @('-i', $Tags) }
$robotArgs += $Specs

Write-Host "=== Robot E2E === specs=$Specs tags=$Tags headless=$($env:QA_HEADLESS)"
if ($Pabot -gt 1) {
  pabot --processes $Pabot @robotArgs
} else {
  robot @robotArgs
}
$code = $LASTEXITCODE

Write-Host "Relatório: $TestsDir\$outDir\report.html"
exit $code
