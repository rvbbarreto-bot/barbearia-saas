# Executa suite E2E Robot (tests/login.robot)
# Uso: .\scripts\qa-e2e-run.ps1
#      .\scripts\qa-e2e-run.ps1 -Headless
param(
  [switch]$Headless,
  [string]$Tags = ''
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$TestsDir = Join-Path $Root 'tests'
Set-Location $TestsDir

if (-not $env:PLAYWRIGHT_BROWSERS_PATH) {
  $env:PLAYWRIGHT_BROWSERS_PATH = 'C:\playwright-browsers-barbearia'
}

if (-not (Test-Path '.venv\Scripts\Activate.ps1')) {
  Write-Host '=== Criando venv e instalando Robot + Browser ==='
  python -m venv .venv
  .\.venv\Scripts\Activate.ps1
  pip install -r requirements.txt
  rfbrowser init
} else {
  .\.venv\Scripts\Activate.ps1
}

$headlessExe = Join-Path $env:PLAYWRIGHT_BROWSERS_PATH 'chromium_headless_shell-1223\chrome-headless-shell-win64\chrome-headless-shell.exe'
if (-not (Test-Path $headlessExe)) {
  Write-Host "=== Instalando browsers Playwright em $env:PLAYWRIGHT_BROWSERS_PATH ==="
  $wrapper = Join-Path $TestsDir '.venv\Lib\site-packages\Browser\wrapper'
  Push-Location $wrapper
  npx --yes playwright install chromium | Out-Host
  Pop-Location
}

if ($Headless) {
  $envPath = Join-Path $TestsDir 'resources\variables\env.robot'
  (Get-Content $envPath) -replace '\$\{BROWSER_HEADLESS\}\s+\$\{False\}', '${BROWSER_HEADLESS}    ${True}' | Set-Content $envPath
}

$robotArgs = @('-d', 'results', 'login.robot')
if ($Tags) { $robotArgs = @('-i', $Tags) + $robotArgs }

Write-Host '=== Robot E2E (login.robot) ==='
robot @robotArgs
$code = $LASTEXITCODE
Write-Host "Relatório: $TestsDir\results\report.html"
exit $code
