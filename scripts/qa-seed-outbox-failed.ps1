<#
.SYNOPSIS
  PS-08.3 — Massa QA: mensagem outbox em status failed no tenant demo (C26 retry admin).

.DESCRIPTION
  Idempotente via idempotency_key fixa qa-ps08-outbox-failed-seed.
  Não altera RBAC (atendente continua sem retry na UI).

.EXAMPLE
  docker compose up -d postgres
  .\scripts\qa-seed-outbox-failed.ps1
#>
param(
  [string] $TenantId = '00000000-0000-0000-0000-000000000001',
  [string] $CustomerId = '00000000-0000-4000-8000-000000004031',
  [string] $IdempotencyKey = 'qa-ps08-outbox-failed-seed'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
. (Join-Path $PSScriptRoot 'lib\qa-api-helpers.ps1')

$pgUser = Get-DotEnvValue -RepoRoot $root -Key 'POSTGRES_USER' -Default 'barbearia_test'
$pgDb = Get-DotEnvValue -RepoRoot $root -Key 'POSTGRES_DB' -Default 'barbearia_saas'

Write-Host '=== PS-08.3: seed outbox failed ===' -ForegroundColor Cyan

$sql = @"
DELETE FROM message_outbox
 WHERE tenant_id = '$TenantId'::uuid
   AND idempotency_key = '$IdempotencyKey';

INSERT INTO message_outbox (
  tenant_id,
  channel,
  payload,
  metadata,
  status,
  attempts,
  max_attempts,
  last_error,
  idempotency_key,
  customer_id,
  correlation_id,
  next_retry_at
) VALUES (
  '$TenantId'::uuid,
  'whatsapp',
  '{"type":"text","template_key":"qa_ps08_failed","preview":"QA PS-08.3 — mensagem de teste (retry admin)"}'::jsonb,
  '{"provider":"evolution","phone":"5511999990001"}'::jsonb,
  'failed',
  3,
  5,
  'QA seed PS-08.3 — falha simulada para homologação C26',
  '$IdempotencyKey',
  '$CustomerId'::uuid,
  'qa-ps08-outbox-failed',
  now()
);
"@

$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$sql | docker compose exec -T postgres psql -U $pgUser -d $pgDb -v ON_ERROR_STOP=1 2>&1 | Out-Host
$ErrorActionPreference = $prev
if ($LASTEXITCODE -ne 0) { throw 'psql seed outbox failed' }

Write-Host 'OK — 1 mensagem failed no tenant demo.' -ForegroundColor Green
Write-Host 'Validar: /operacao/mensagens → filtro Falhou → Retry (admin).' -ForegroundColor DarkGray
Write-Host 'Opcional staging: OUTBOX_FORCE_SEND_FAILURE=true (ver .env.example).' -ForegroundColor DarkGray
