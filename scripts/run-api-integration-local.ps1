<#
.SYNOPSIS
  Sobe Postgres 16 + Redis 7 (Docker), aplica migrations, corre testes de integração API e grava logs em artifacts/devqa-07-1.

.DESCRIPTION
  Requer Docker Desktop (ou motor Docker) acessível no PATH.
  Não usa credenciais reais. Destrói os contentores no fim, salvo -KeepAlive.
  A API de testes usa o role Postgres `barbearia_app` (RLS). O Vitest reenvia DATABASE_URL/JWT/REDIS aos workers via `apps/api/vitest.config.ts` para evitar skips no Windows.
  Hotfix DEV/QA-07.1: inclui HTTP RBAC `commission/entries` + artefactos em artifacts/devqa-07-1.

.PARAMETER KeepAlive
  Mantém contentores a correr após o script (para depuração manual).

.PARAMETER ApplySeed
  Aplica database/seeds/001_demo.sql (opcional; por defeito **não** aplica para evitar colisões com testes isolados).

.EXAMPLE
  pwsh -File scripts/run-api-integration-local.ps1
#>
param(
  [switch]$KeepAlive,
  [switch]$ApplySeed
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$artifactDir = Join-Path (Join-Path $root 'artifacts') 'devqa-07-1'
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null

$id = [guid]::NewGuid().ToString('n').Substring(0, 10)
$logFile = Join-Path $artifactDir "integration-$id.log"
$pgName = "bb-int-pg-$id"
$rdName = "bb-int-rd-$id"
$pgPort = 55430 + (Get-Random -Maximum 150)
$rdPort = 56380 + (Get-Random -Maximum 150)

function Write-Log([string]$msg) {
  $line = "$(Get-Date -Format o) $msg"
  Write-Host $line
  Add-Content -Path $logFile -Value $line
}

try {
  Write-Log "=== DEV/QA-07.1 API integration harness ==="
  Write-Log "Postgres container: $pgName port $pgPort"
  Write-Log "Redis container: $rdName port $rdPort"

  docker run -d --name $pgName `
    -e POSTGRES_USER=barbearia `
    -e POSTGRES_PASSWORD=barbearia_test_password `
    -e POSTGRES_DB=barbearia_saas_test `
    -p "${pgPort}:5432" `
    postgres:16-alpine | Out-Null

  docker run -d --name $rdName -p "${rdPort}:6379" redis:7-alpine | Out-Null

  $deadline = (Get-Date).AddSeconds(90)
  $prevEapReady = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  try {
    do {
      docker exec $pgName pg_isready -U barbearia -d barbearia_saas_test *> $null
      if ($LASTEXITCODE -eq 0) { break }
      if ((Get-Date) -gt $deadline) { throw 'Postgres não ficou pronto a tempo (pg_isready).' }
      Start-Sleep -Seconds 1
    } while ($true)
  }
  finally {
    $ErrorActionPreference = $prevEapReady
  }
  Start-Sleep -Seconds 3

  # Role `barbearia_app` (não-superuser) criada na migration 006 — necessária para RLS nos testes.
  $env:DATABASE_URL = "postgres://barbearia_app:barbearia_app_dev_password@127.0.0.1:$pgPort/barbearia_saas_test"
  $env:REDIS_URL = "redis://127.0.0.1:$rdPort"
  $env:JWT_SECRET = 'devqa03-integration-secret-32chars-minimum-ok'
  $env:NODE_ENV = 'test'
  $env:PORT = '3999'
  $env:RECALL_ENABLED = 'true'
  $env:PIX_REAL_PROVIDER_ENABLED = 'false'
  $env:WAITLIST_SLOT_NOTIFY_ENABLED = 'false'
  $env:WAITLIST_SWEEP_ENABLED = 'false'
  $env:CORS_ORIGIN = '*'
  $env:OUTBOX_POLL_INTERVAL_MS = '60000'
  $env:OUTBOX_CONCURRENCY = '1'

  Write-Log "Aplicar migrations (ordem lexicográfica)…"
  Get-ChildItem -Path (Join-Path $root 'database/migrations') -Filter '*.sql' |
    Sort-Object Name |
    ForEach-Object {
      Write-Log "  $($_.Name)"
      $tmpSql = Join-Path $env:TEMP "bb-migrate-$id-$($_.Name)"
      Copy-Item $_.FullName $tmpSql -Force
      docker cp $tmpSql "${pgName}:/tmp/migrate.sql" | Out-Null
      $tmpOut = Join-Path $env:TEMP "bb-migrate-out-$id.txt"
      $prevEap = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      docker exec $pgName psql -U barbearia -d barbearia_saas_test -v ON_ERROR_STOP=1 -f /tmp/migrate.sql > $tmpOut 2>&1
      $migrateExit = $LASTEXITCODE
      $ErrorActionPreference = $prevEap
      Get-Content $tmpOut -ErrorAction SilentlyContinue | Add-Content -Path $logFile
      Remove-Item $tmpOut -Force -ErrorAction SilentlyContinue
      Remove-Item $tmpSql -Force -ErrorAction SilentlyContinue
      if ($migrateExit -ne 0) { throw "Falha ao aplicar $($_.Name) (psql exit $migrateExit)." }
    }

  if ($ApplySeed) {
    Write-Log "Aplicar seed 001_demo.sql…"
    $seedSrc = Join-Path $root 'database/seeds/001_demo.sql'
    $tmpSeed = Join-Path $env:TEMP "bb-seed-$id.sql"
    Copy-Item $seedSrc $tmpSeed -Force
    docker cp $tmpSeed "${pgName}:/tmp/seed.sql" | Out-Null
    $tmpSeedOut = Join-Path $env:TEMP "bb-seed-out-$id.txt"
    $prevEap2 = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker exec $pgName psql -U barbearia -d barbearia_saas_test -v ON_ERROR_STOP=1 -f /tmp/seed.sql > $tmpSeedOut 2>&1
    $seedExit = $LASTEXITCODE
    $ErrorActionPreference = $prevEap2
    Get-Content $tmpSeedOut -ErrorAction SilentlyContinue | Add-Content -Path $logFile
    Remove-Item $tmpSeedOut -Force -ErrorAction SilentlyContinue
    if ($seedExit -ne 0) { throw "Falha ao aplicar seed (psql exit $seedExit)." }
  }

  Push-Location (Join-Path $root 'apps/api')
  try {
    Write-Log "npm run typecheck"
    npm run typecheck 2>&1 | Tee-Object -FilePath $logFile -Append
    if ($LASTEXITCODE -ne 0) { throw 'npm run typecheck falhou.' }

    Write-Log "npm run lint"
    npm run lint 2>&1 | Tee-Object -FilePath $logFile -Append
    if ($LASTEXITCODE -ne 0) { throw 'npm run lint falhou.' }

    Write-Log "npm run test:unit"
    npm run test:unit 2>&1 | Tee-Object -FilePath $logFile -Append
    if ($LASTEXITCODE -ne 0) { throw 'npm run test:unit falhou.' }

    $integrationFiles = @(
      'src/infra/db/tenant-context.integration.test.ts',
      'src/modules/branches/branches.rls.integration.test.ts',
      'src/modules/waitlist/waitlist.integration.test.ts',
      'src/modules/customers/customers.integration.test.ts',
      'src/modules/professionals/professionals.integration.test.ts',
      'src/modules/recall/recall.integration.test.ts',
      'src/modules/appointments/appointments.integration.test.ts',
      'src/modules/availability/availability.integration.test.ts',
      'src/modules/integrations/integrations-outbound.integration.test.ts',
      'src/modules/finance/finance.service.integration.test.ts',
      'src/modules/commission/commission.service.integration.test.ts',
      'src/modules/commission/commission.entries.http.integration.test.ts',
      'src/modules/users/users.isolation.integration.test.ts',
      'src/modules/audit/audit_logs.isolation.integration.test.ts'
    )

    Write-Log "npm run test -- (integração) $($integrationFiles -join ' ')"
    Write-Log "Env harness (sem valores): DATABASE_URL=$([bool]$env:DATABASE_URL) JWT_SECRET=$([bool]$env:JWT_SECRET) REDIS_URL=$([bool]$env:REDIS_URL)"
    # Não usar cmd /c: URLs com @ e : podem ser mal interpretadas; $env: já está definido nesta sessão.
    # Redirecionar para ficheiro evita pipeline alterar $LASTEXITCODE (Tee-Object).
    $tmpVitest = Join-Path $env:TEMP "bb-int-vitest-$id.log"
    $prevEapTests = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & npm run test -- @($integrationFiles) *> $tmpVitest
    $vitestExit = $LASTEXITCODE
    $ErrorActionPreference = $prevEapTests
    Get-Content $tmpVitest -ErrorAction SilentlyContinue | Tee-Object -FilePath $logFile -Append
    Remove-Item $tmpVitest -Force -ErrorAction SilentlyContinue
    if ($vitestExit -ne 0) { throw "Testes de integração falharam (exit $vitestExit)." }

    Write-Log "node scripts/audit-tenant-context.mjs (DATABASE_URL ativo)"
    $tmpTenantAudit = Join-Path $env:TEMP "bb-tenant-audit-$id.log"
    $taExit = 0
    $prevEapTa = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location (Join-Path $root 'apps/api')
    try {
      & node (Join-Path $root 'scripts/audit-tenant-context.mjs') *> $tmpTenantAudit
      $taExit = $LASTEXITCODE
    }
    finally {
      Pop-Location
    }
    $ErrorActionPreference = $prevEapTa
    Get-Content $tmpTenantAudit -ErrorAction SilentlyContinue | Tee-Object -FilePath $logFile -Append
    Remove-Item $tmpTenantAudit -Force -ErrorAction SilentlyContinue
    if ($taExit -ne 0) { throw "audit-tenant-context falhou (exit $taExit)." }

    Write-Log "=== Harness concluído com sucesso ==="
  }
  finally {
    Pop-Location
  }
}
catch {
  try { Write-Log "ERRO: $($_.Exception.Message)" } catch {}
  try { Write-Log $_.ScriptStackTrace } catch {}
  exit 1
}
finally {
  if (-not $KeepAlive) {
    docker rm -f $pgName 2>$null | Out-Null
    docker rm -f $rdName 2>$null | Out-Null
    try { Write-Log "Contentores removidos (use -KeepAlive para manter)." } catch {}
  }
  else {
    try { Write-Log "KeepAlive: contentores $pgName e $rdName mantidos." } catch {}
  }
  try { Write-Log "Log: $logFile" } catch {}
}
