# GAP-03: seed idempotente do usuario viewer@demo.local (senha admin12345)
param(
  [string]$TenantId = '00000000-0000-0000-0000-000000000001'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
. (Join-Path $PSScriptRoot 'lib\qa-api-helpers.ps1')

$pgUser = Get-DotEnvValue -RepoRoot $Root -Key 'POSTGRES_USER' -Default 'barbearia_test'
$pgDb = Get-DotEnvValue -RepoRoot $Root -Key 'POSTGRES_DB' -Default 'barbearia_saas'

$sql = @'
INSERT INTO users (tenant_id, name, email, password_hash, role, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Viewer Demo',
  'viewer@demo.local',
  '$2b$10$yeVnSfPaHFmBAG3wrKlGFe5p64O0yYj3SU5nIrsCfUngqp/hcocba',
  'viewer',
  true
)
ON CONFLICT (tenant_id, email) DO UPDATE
SET role = EXCLUDED.role, name = EXCLUDED.name, is_active = true, updated_at = now();
'@

Write-Host '=== GAP-03: seed viewer@demo.local ===' -ForegroundColor Cyan
$sql | docker compose exec -T postgres psql -U $pgUser -d $pgDb -v ON_ERROR_STOP=1 2>&1 | Out-Host
Write-Host 'OK viewer seed' -ForegroundColor Green
