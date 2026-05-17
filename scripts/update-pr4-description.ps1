<#!
  Atualiza o corpo (description) do PR #4 via GitHub REST API.
  Requer: variável de ambiente GITHUB_TOKEN (classic: repo) ou (fine-grained: Pull requests: Read and write).

  Uso (PowerShell, na raiz do repo):
    $env:GITHUB_TOKEN = "ghp_...."   # ou gh auth token
    .\scripts\update-pr4-description.ps1

  Fonte do texto: docs/evidencias/piloto_staging_03/PR_4_CORPO_DESCRICAO.md
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mdPath = Join-Path $root "docs/evidencias/piloto_staging_03/PR_4_CORPO_DESCRICAO.md"
if (-not (Test-Path $mdPath)) { throw "Missing: $mdPath" }

$token = $env:GITHUB_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Host "GITHUB_TOKEN nao definido. Defina o token e volte a executar, ou cole o ficheiro manualmente no GitHub." -ForegroundColor Yellow
  exit 2
}

$bodyText = [System.IO.File]::ReadAllText($mdPath, [System.Text.UTF8Encoding]::new($false))
$payload = @{ body = $bodyText } | ConvertTo-Json -Depth 5 -Compress

$headers = @{
  Authorization = "Bearer $token"
  Accept        = "application/vnd.github+json"
  "User-Agent"  = "barbearia-saas-update-pr4"
}

$uri = "https://api.github.com/repos/rvbbarreto-bot/barbearia-saas/pulls/4"
Invoke-RestMethod -Uri $uri -Method Patch -Headers $headers -Body $payload -ContentType "application/json; charset=utf-8"
Write-Host "PR #4 description updated OK." -ForegroundColor Green
