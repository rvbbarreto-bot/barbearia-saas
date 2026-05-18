# Verifica stack local mínima para login (postgres + redis + api + web).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

Write-Host "=== docker compose ps ===" -ForegroundColor Cyan
docker compose ps postgres redis api web

$apiHealth = curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/health/ready 2>$null
Write-Host "`nAPI /health/ready: $apiHealth"

if ($apiHealth -eq "200") {
  try {
    $r = Invoke-RestMethod -Uri "http://localhost:3001/auth/login" -Method POST -ContentType "application/json" `
      -Body (@{ email = "admin@demo.local"; password = "admin12345" } | ConvertTo-Json)
    Write-Host "Login via :3001: OK (tenant_owner, token recebido)" -ForegroundColor Green
  } catch {
    Write-Host "Login via :3001: FALHOU - $_" -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "API indisponivel. Execute: docker compose up -d postgres redis && docker compose up -d --build api" -ForegroundColor Yellow
  exit 1
}

Pop-Location
