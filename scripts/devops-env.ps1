<#
.SYNOPSIS
  Garante Docker e npm no PATH da sessão PowerShell (DevOps local Windows).

.DESCRIPTION
  - Adiciona Docker Desktop ao PATH
  - Localiza Node.js/npm (Program Files, fnm, nvm) ou instala LTS via winget
  - Opcional: persiste snippet em $PROFILE (switch -PersistProfile)

.EXAMPLE
  . .\scripts\devops-env.ps1
  docker --version; npm --version
#>
param(
  [switch] $PersistProfile,
  [switch] $InstallNodeIfMissing
)

$ErrorActionPreference = 'Stop'

function Add-PathIfExists([string] $Segment) {
  if (-not $Segment -or -not (Test-Path -LiteralPath $Segment)) { return }
  $parts = $env:Path -split ';' | Where-Object { $_ }
  if ($parts -notcontains $Segment) {
    $env:Path = "$Segment;$env:Path"
  }
}

# Docker Desktop
$dockerDirs = @(
  'C:\Program Files\Docker\Docker\resources\bin'
  'C:\Program Files\Docker\Docker\resources'
)
foreach ($d in $dockerDirs) { Add-PathIfExists $d }

function Find-NpmCmd {
  $candidates = @(
    "$env:ProgramFiles\nodejs\npm.cmd"
    "${env:ProgramFiles(x86)}\nodejs\npm.cmd"
    "$env:LOCALAPPDATA\Programs\node\npm.cmd"
    "$env:APPDATA\npm\npm.cmd"
  )
  foreach ($fnmRoot in @("$env:LOCALAPPDATA\fnm", "$env:USERPROFILE\.fnm")) {
    if (Test-Path $fnmRoot) {
      Get-ChildItem -Path $fnmRoot -Filter npm.cmd -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 3 -ExpandProperty FullName |
        ForEach-Object { $candidates += $_ }
    }
  }
  foreach ($nvmRoot in @("$env:APPDATA\nvm", "$env:NVM_HOME")) {
    if ($nvmRoot -and (Test-Path $nvmRoot)) {
      Get-ChildItem -Path $nvmRoot -Filter npm.cmd -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 3 -ExpandProperty FullName |
        ForEach-Object { $candidates += $_ }
    }
  }
  foreach ($c in $candidates) {
    if ($c -and (Test-Path -LiteralPath $c)) { return $c }
  }
  return $null
}

$npmCmd = Find-NpmCmd
if (-not $npmCmd -and $InstallNodeIfMissing) {
  Write-Host 'Node.js não encontrado — a instalar OpenJS.NodeJS.LTS via winget...' -ForegroundColor Yellow
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    & winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --disable-interactivity 2>&1 | Out-Host
    Add-PathIfExists "$env:ProgramFiles\nodejs"
    $npmCmd = Find-NpmCmd
  }
  else {
    Write-Warning 'winget indisponível. Instale Node.js 22 LTS manualmente: https://nodejs.org/'
  }
}

if ($npmCmd) {
  Add-PathIfExists (Split-Path -Parent $npmCmd)
  $nodeDir = Split-Path -Parent $npmCmd
  if ((Split-Path -Leaf $nodeDir) -eq 'bin') {
    Add-PathIfExists (Split-Path -Parent $nodeDir)
  }
}

# Alias npm/node se só existir no Cursor helpers (fallback mínimo para migrate)
$cursorNode = "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\node.exe"
if (-not (Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path $cursorNode)) {
  $env:DEVOPS_CURSOR_NODE = $cursorNode
  function global:node {
    param([string[]] $args)
    & $env:DEVOPS_CURSOR_NODE @args
  }
  function global:npm {
    param([string[]] $args)
    $apiRoot = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'apps\api'
    $npmCli = Join-Path $apiRoot 'node_modules\npm\bin\npm-cli.js'
    if (Test-Path $npmCli) {
      & $env:DEVOPS_CURSOR_NODE $npmCli @args
    }
    else {
      throw 'npm não encontrado e npm-cli.js ausente em apps/api/node_modules. Execute: cd apps/api; (instale Node) npm install'
    }
  }
}

function Get-ToolVersion([scriptblock] $Invoker) {
  try {
    $out = & $Invoker 2>&1
    if ($LASTEXITCODE -ne 0 -and -not $out) { return 'UNAVAILABLE' }
    return ($out | Out-String).Trim()
  }
  catch {
    return 'UNAVAILABLE'
  }
}

$script:DevOpsEnvReport = [ordered]@{
  Docker = (Get-ToolVersion { docker --version })
  Node   = (Get-ToolVersion { node --version })
  Npm    = (Get-ToolVersion { npm --version })
}

Write-Host '=== devops-env.ps1 ===' -ForegroundColor Cyan
$script:DevOpsEnvReport.GetEnumerator() | ForEach-Object {
  $color = if ($_.Value -match 'UNAVAILABLE') { 'Red' } else { 'Green' }
  Write-Host ("  {0}: {1}" -f $_.Key, $_.Value) -ForegroundColor $color
}

if ($PersistProfile -and $PROFILE) {
  $marker = '# barbearia-saas devops-env'
  $repoRoot = Split-Path -Parent $PSScriptRoot
  $line = ". `"$repoRoot\scripts\devops-env.ps1`""
  if (-not (Test-Path $PROFILE)) { New-Item -Path $PROFILE -ItemType File -Force | Out-Null }
  $prof = Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue
  if ($prof -notmatch [regex]::Escape($marker)) {
    Add-Content -Path $PROFILE -Value "`n$marker`n$line`n"
    Write-Host "Snippet adicionado a `$PROFILE" -ForegroundColor Green
  }
}

if ($script:DevOpsEnvReport.Docker -match 'UNAVAILABLE') {
  Write-Host 'Docker: inicie Docker Desktop e volte a correr este script.' -ForegroundColor Yellow
}
if ($script:DevOpsEnvReport.Npm -match 'UNAVAILABLE') {
  Write-Host 'npm: corra com -InstallNodeIfMissing ou instale Node 22 LTS.' -ForegroundColor Yellow
}
