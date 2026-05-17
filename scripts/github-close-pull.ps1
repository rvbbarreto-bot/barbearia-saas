<#!
  Fecha um Pull Request sem merge (PATCH state=closed).
  Requer: GITHUB_TOKEN com permissão para editar PRs no repositório.

  Exemplo:
    $env:GITHUB_TOKEN = "ghp_...."
    .\scripts\github-close-pull.ps1 -PullNumber 5

  Não faz merge. Não altera main.
#>
param(
  [Parameter(Mandatory = $true)]
  [int] $PullNumber
)

$ErrorActionPreference = "Stop"
$token = $env:GITHUB_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Error "Defina GITHUB_TOKEN antes de executar."
}

$owner = "rvbbarreto-bot"
$repo  = "barbearia-saas"
$uri   = "https://api.github.com/repos/$owner/$repo/pulls/$PullNumber"

$headers = @{
  Authorization = "Bearer $token"
  Accept        = "application/vnd.github+json"
  "User-Agent"  = "barbearia-saas-close-pr"
}

$body = @{ state = "closed" } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri $uri -Method Patch -Headers $headers -Body $body -ContentType "application/json; charset=utf-8"
Write-Host "PR #$PullNumber fechado (state=closed). Verifique no GitHub que merged_at=null." -ForegroundColor Green
