# Nightly / smoke — Robot regressivo PS-08 + doc10
# Pre-requisitos: Docker (api+web+postgres+redis), seeds PS-08 e viewer
param(
  [switch]$SkipDocker,
  [switch]$Headed
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# OneDrive pode bloquear .local-browsers dentro do repo; usar cache fora do sync.
if (-not $env:PLAYWRIGHT_BROWSERS_PATH) {
  $env:PLAYWRIGHT_BROWSERS_PATH = 'C:\playwright-browsers-barbearia'
}

if (-not $SkipDocker) {
  Write-Host '=== Docker: postgres + api + web ==='
  docker compose up -d postgres
  # Redis orphan workaround: conectar rede se container externo existir
  $redisExists = docker ps -a --filter 'name=barbearia-redis' --format '{{.Names}}' 2>$null
  if ($redisExists -eq 'barbearia-redis') {
    docker start barbearia-redis 2>$null | Out-Null
    $net = docker inspect barbearia-api --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>$null
    if ($net) {
      $onNet = docker inspect barbearia-redis --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>$null
      if ($onNet -notlike "*$net*") {
        docker network connect $net barbearia-redis 2>$null | Out-Null
      }
    }
  } else {
    docker compose up -d redis
  }
  docker compose up -d --force-recreate api web
  $deadline = (Get-Date).AddMinutes(3)
  do {
    Start-Sleep -Seconds 5
    try {
      $r = Invoke-WebRequest -Uri 'http://localhost:3000/health/ready' -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { break }
    } catch { }
  } while ((Get-Date) -lt $deadline)
}

Write-Host '=== Seeds QA ==='
.\scripts\qa-seed-viewer.ps1
.\scripts\qa-seed-car-wash-patio.ps1
.\scripts\qa-seed-outbox-failed.ps1

$robotDir = Join-Path $Root 'tests\robot'
Set-Location $robotDir

if (-not (Test-Path '.venv\Scripts\Activate.ps1')) {
  python -m venv .venv
  .\.venv\Scripts\Activate.ps1
  pip install -r requirements.txt
  rfbrowser init
} else {
  .\.venv\Scripts\Activate.ps1
}

$headlessExe = Join-Path $env:PLAYWRIGHT_BROWSERS_PATH 'chromium_headless_shell-1223\chrome-headless-shell-win64\chrome-headless-shell.exe'
if (-not (Test-Path $headlessExe)) {
  Write-Host "=== Playwright browsers ($env:PLAYWRIGHT_BROWSERS_PATH) ==="
  $wrapper = Join-Path $robotDir '.venv\Lib\site-packages\Browser\wrapper'
  Push-Location $wrapper
  npx --yes playwright install chromium | Out-Host
  Pop-Location
}

if ($Headed) {
  (Get-Content 'resources\variables\env.robot') -replace '\$\{BROWSER_HEADLESS\}\s+\$\{True\}', '${BROWSER_HEADLESS}    ${False}' | Set-Content 'resources\variables\env.robot'
}

Write-Host '=== Robot regressivo ==='
robot -d results tests\regressivo_ps08_doc10.robot
$code = $LASTEXITCODE

Write-Host "Relatorio: $robotDir\results\report.html"
exit $code
