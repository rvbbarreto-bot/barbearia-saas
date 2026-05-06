# DEV/QA-07: structural JSON validation + optional n8n CLI import in Docker.
# Pin: n8n/.docker-image-tag (must match docker-compose.staging.yml n8n service).
# Usage: pwsh -File scripts/validate-n8n-runtime-import.ps1 [-TryDockerImport]
param([switch]$TryDockerImport)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$outDir = Join-Path (Join-Path $root 'artifacts') 'devqa-07'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = Join-Path $outDir "n8n-runtime-validation-$stamp.log"

$tagPath = Join-Path $root 'n8n/.docker-image-tag'
if (-not (Test-Path $tagPath)) { throw "Missing $tagPath" }
$n8nTag = (Get-Content -Raw $tagPath).Trim()
if (-not $n8nTag) { throw 'n8n/.docker-image-tag is empty' }

function Write-Log([string]$m) {
  $line = "$(Get-Date -Format o) $m"
  Write-Host $line
  Add-Content -Path $log -Value $line
}

Write-Log "=== n8n runtime / import validation (DEV/QA-07) image=n8nio/n8n:$n8nTag ==="

Push-Location $root
try {
  node scripts/n8n-validate-workflow-import.mjs 2>&1 | Tee-Object -FilePath $log -Append
  if ($LASTEXITCODE -ne 0) { throw 'node scripts/n8n-validate-workflow-import.mjs failed.' }
}
finally {
  Pop-Location
}

if ($TryDockerImport) {
  Write-Log "Docker import: image n8nio/n8n:$n8nTag (entrypoint runs n8n CLI; use import:workflow, not n8n import:workflow)."
  $enc = 'devqa05n8nencryptionkey32charsminimum00'
  $workflows = @(
    '01_whatsapp_router_multitenant.json',
    '02_ai_scheduling_agent_multitenant.json',
    '03_recall_30_days_multitenant.json'
  )
  foreach ($wf in $workflows) {
    Write-Log "Importing $wf ..."
    docker run --rm `
      -e N8N_ENCRYPTION_KEY=$enc `
      -v "${root}/n8n/workflows:/wf:ro" `
      "n8nio/n8n:$n8nTag" `
      import:workflow --input="/wf/$wf" 2>&1 | Tee-Object -FilePath $log -Append
    if ($LASTEXITCODE -ne 0) { throw "docker import failed for $wf (exit $LASTEXITCODE)." }
  }
  Write-Log "Docker CLI import completed for 01/02/03 (ephemeral DB, not persisted across runs)."
}

Write-Log "Done. Log: $log"
Write-Host "Static audit: pwsh -File scripts/audit-n8n-workflows.ps1"
