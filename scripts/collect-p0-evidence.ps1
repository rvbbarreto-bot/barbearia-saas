# Gera ficheiros em artifacts/p0/ para anexar ao PR. Requer Docker.
# docker rm pode escrever em stderr sem ser falha — não usar Stop global no cleanup
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = Join-Path $root "artifacts\p0"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$ts = Get-Date -Format "yyyyMMdd-HHmmss"

$migLog = Join-Path $out "migration-order-$ts.txt"
Get-ChildItem "$root\database\migrations\*.sql" | Sort-Object Name | ForEach-Object { $_.FullName.Replace("$root\", "") } | Set-Content -Encoding utf8 $migLog

& "$root\scripts\audit-n8n-workflows.ps1" 2>&1 | Set-Content -Encoding utf8 (Join-Path $out "n8n-audit-$ts.txt")

$container = "p0-evidence-$ts"
$dbLog = Join-Path $out "db-clean-migrate-seed-$ts.txt"
try {
  $oldEa = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  docker rm -f $container 2>$null | Out-Null
  $ErrorActionPreference = $oldEa

  docker run -d --name $container -e POSTGRES_PASSWORD=test -e POSTGRES_USER=barbearia -e POSTGRES_DB=barbearia_saas_test postgres:16-alpine | Out-Null
  Start-Sleep -Seconds 6
  foreach ($f in (Get-ChildItem "$root\database\migrations\*.sql" | Sort-Object Name)) {
    Add-Content -Path $dbLog -Value "=== $($f.Name) ===" -Encoding utf8
    Get-Content $f.FullName -Raw | docker exec -i $container psql -U barbearia -d barbearia_saas_test -v ON_ERROR_STOP=1 -f - | Add-Content -Path $dbLog -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "Migration $($f.Name) failed code $LASTEXITCODE" }
  }
  Add-Content -Path $dbLog -Value "=== SEED ===" -Encoding utf8
  Get-Content "$root\database\seeds\001_demo.sql" -Raw | docker exec -i $container psql -U barbearia -d barbearia_saas_test -v ON_ERROR_STOP=1 -f - | Add-Content -Path $dbLog -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw "Seed failed" }

  Add-Content -Path $dbLog -Value "=== BRANCHES RLS / FORCE / policies / indexes / triggers ===" -Encoding utf8
  @(
    "SELECT relrowsecurity AS rls, relforcerowsecurity AS force_rls FROM pg_class WHERE oid = 'public.branches'::regclass;"
    "SELECT polname FROM pg_policy WHERE polrelid = 'public.branches'::regclass ORDER BY 1;"
    "SELECT indexname FROM pg_indexes WHERE tablename = 'branches' AND schemaname = 'public' ORDER BY 1;"
    "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.branches'::regclass ORDER BY 1;"
  ) | ForEach-Object {
    docker exec $container psql -U barbearia -d barbearia_saas_test -c $_ | Add-Content -Path $dbLog -Encoding utf8
  }
}
finally {
  $oldEa = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  docker rm -f $container 2>$null | Out-Null
  $ErrorActionPreference = $oldEa
}

Write-Host "Evidências em: $out" -ForegroundColor Green
