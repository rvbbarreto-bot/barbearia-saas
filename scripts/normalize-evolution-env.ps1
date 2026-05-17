#requires -Version 5.1
<#
  Remove duplicatas de EVOLUTION_* / QA_WHATSAPP_NUMBER no .env da raiz.
  Mantém a ultima ocorrencia de cada chave (bloco canonico no fim).
#>
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$path = Join-Path $root '.env'
if (-not (Test-Path $path)) { throw ".env nao encontrado: $path" }

$keys = @('EVOLUTION_API_URL', 'EVOLUTION_INSTANCE', 'EVOLUTION_API_KEY', 'QA_WHATSAPP_NUMBER')
$lines = Get-Content $path
$values = @{}
foreach ($k in $keys) {
  $match = $lines | Where-Object { $_ -match "^\s*$([regex]::Escape($k))\s*=" } | Select-Object -Last 1
  if ($match) { $values[$k] = $match }
}

$out = New-Object System.Collections.Generic.List[string]
$skip = $false
foreach ($line in $lines) {
  if ($line -match '^\s*#.*Evolution|^\s*#.*N8N.*Valida|^\s*#.*WHATSAPP') { continue }
  if ($line -match '^\s*(EVOLUTION_API_URL|EVOLUTION_INSTANCE|EVOLUTION_API_KEY|QA_WHATSAPP_NUMBER)\s*=') { continue }
  $out.Add($line)
}

while ($out.Count -gt 0 -and [string]::IsNullOrWhiteSpace($out[$out.Count - 1])) { $out.RemoveAt($out.Count - 1) }
$out.Add('')
$out.Add('# ── Evolution API (WhatsApp) — bloco canonico (API + n8n smoke QA) ─────────')
foreach ($k in $keys) {
  if ($values.ContainsKey($k)) { $out.Add($values[$k]) }
}

Set-Content -Path $path -Value ($out -join "`n") -Encoding UTF8
Write-Host "OK: .env normalizado em $path (uma entrada por variavel Evolution/QA)"
