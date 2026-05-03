# Auditoria estática dos workflows n8n versionados (P0 governança).
# Uso: pwsh -File scripts/audit-n8n-workflows.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$wfDir = Join-Path $root 'n8n/workflows'
$patterns = @(
  'n8n-nodes-base.postgres',
  '"type":"n8n-nodes-base.postgres"',
  'executeQuery',
  'message/sendText',
  'sendText',
  'EVOLUTION_API_URL',
  'INSERT ',
  'UPDATE ',
  'DELETE ',
  'SELECT \* FROM',
  'sk_live',
  'sk_test',
  'apikey',
  'Bearer eyJ'
)
Write-Host "=== n8n workflow static audit ===" 
Write-Host "Directory: $wfDir"
Get-ChildItem -Path $wfDir -Filter '*.json' | ForEach-Object {
  Write-Host "`n--- $($_.Name) ---"
  $content = Get-Content -Raw $_.FullName
  try {
    $j = $content | ConvertFrom-Json
    $active = $j.active
    Write-Host "active (export default): $active"
  } catch {
    Write-Host "JSON parse error: $_"
  }
  foreach ($p in $patterns) {
    if ($content -match $p) {
      Write-Host "[MATCH] $p"
    }
  }
}
Write-Host "`n=== Note ==="
Write-Host "Matches are expected for blocked flows (02/03) until remediation."
Write-Host "Workflows 02/03 must remain Active=OFF in the running n8n instance (UI evidence)."
