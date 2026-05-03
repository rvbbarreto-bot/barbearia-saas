<#
.SYNOPSIS
  Verifica se o baseline V4 (PDF ou MD validado) existe no caminho canónico.

.DESCRIPTION
  Caminho canónico (relativo a barbearia-saas/), por decisão do PO:
    docs/Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.pdf
    docs/Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.md

  Compatibilidade transitória (legado):
    docs/requirements/Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.pdf
    docs/requirements/Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.md

  -Strict: exit code 1 se nenhum dos ficheiros existir (para CI após o PO versionar o artefato).
#>
param(
  [switch] $Strict
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$docsDir = Join-Path $root 'docs'
$reqDir = Join-Path $root 'docs\requirements'

$candidates = @(
  (Join-Path $docsDir 'Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.pdf'),
  (Join-Path $docsDir 'Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.md'),
  (Join-Path $reqDir 'Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.pdf'),
  (Join-Path $reqDir 'Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.md')
)

Write-Host "[verify-v4-baseline] docs dir: $docsDir"

foreach ($p in $candidates) {
  if (Test-Path -LiteralPath $p) {
    Write-Host "[verify-v4-baseline] OK: baseline presente -> $p"
    exit 0
  }
}

$msg = @"
[verify-v4-baseline] AVISO: baseline V4 em falta.
  Esperado um de (PO / caminho oficial em docs/):
    $(Join-Path $docsDir 'Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.pdf')
    $(Join-Path $docsDir 'Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.md')
  Instruções: docs\README.md
"@

if ($Strict) {
  Write-Error $msg
  exit 1
}

Write-Warning $msg
exit 0
