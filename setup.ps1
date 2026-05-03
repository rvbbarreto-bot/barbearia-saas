# ============================================================
# setup.ps1 — Script de setup completo do ambiente local
# SaaS Barbearia
#
# Uso:
#   PowerShell -ExecutionPolicy Bypass -File setup.ps1
#   PowerShell -ExecutionPolicy Bypass -File setup.ps1 -Seed
#   PowerShell -ExecutionPolicy Bypass -File setup.ps1 -Reset
# ============================================================

param(
    [switch]$Seed,    # aplica seed de dados demo apos migrations
    [switch]$Reset    # para tudo, remove volumes e recria do zero
)

$ErrorActionPreference = "Stop"

# ── Helpers de output ────────────────────────────────────────
function Step($msg)    { Write-Host "`n▶ $msg" -ForegroundColor Cyan }
function Ok($msg)      { Write-Host "  ✅ $msg" -ForegroundColor Green }
function Warn($msg)    { Write-Host "  ⚠️  $msg" -ForegroundColor Yellow }
function Fail($msg)    { Write-Host "  ❌ $msg" -ForegroundColor Red; exit 1 }
function Info($msg)    { Write-Host "  $msg" -ForegroundColor Gray }

Write-Host ""
Write-Host "══════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "   SaaS Barbearia — Setup do Ambiente     " -ForegroundColor Magenta
Write-Host "══════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""

# ── Verificar pré-requisitos ─────────────────────────────────
Step "Verificando pré-requisitos..."

try { $null = docker --version; Ok "Docker encontrado: $(docker --version)" }
catch { Fail "Docker não encontrado. Instale o Docker Desktop: https://www.docker.com/products/docker-desktop/" }

try { $null = docker compose version; Ok "Docker Compose encontrado" }
catch { Fail "Docker Compose não encontrado. Atualize o Docker Desktop." }

try {
    $info = docker info 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Docker daemon não está rodando" }
    Ok "Docker daemon está rodando"
} catch {
    Fail "Docker Desktop não está em execução. Abra o Docker Desktop e aguarde inicializar."
}

# ── Verificar .env ────────────────────────────────────────────
Step "Verificando arquivo .env..."

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Warn "Arquivo .env criado a partir do .env.example"
        Warn "Edite o .env e troque JWT_SECRET por uma chave com 32+ caracteres!"
        Write-Host ""
        Write-Host "  Pressione ENTER para continuar apos editar o .env, ou CTRL+C para cancelar..." -ForegroundColor Yellow
        Read-Host | Out-Null
    } else {
        Fail "Arquivo .env nao encontrado e .env.example nao existe."
    }
} else {
    Ok ".env encontrado"
}

# Validar JWT_SECRET
$jwtSecret = (Get-Content ".env" | Where-Object { $_ -match "^JWT_SECRET=" }) -replace "^JWT_SECRET=", ""
if ($jwtSecret -eq "change_me_min_32_chars" -or $jwtSecret.Length -lt 32) {
    Warn "JWT_SECRET parece nao ter sido alterado ou e muito curto (min 32 chars)"
    Warn "O sistema pode falhar ao iniciar. Edite o .env antes de continuar."
}

# ── Reset (opcional) ──────────────────────────────────────────
if ($Reset) {
    Step "Modo RESET: removendo conteineres e volumes..."
    Warn "Todos os dados do banco serao apagados!"
    Write-Host "  Pressione ENTER para confirmar ou CTRL+C para cancelar..." -ForegroundColor Yellow
    Read-Host | Out-Null
    docker compose down -v 2>&1 | Out-Null
    Ok "Conteineres e volumes removidos"
}

# ── Subir os contêineres ──────────────────────────────────────
Step "Subindo os conteineres Docker..."
docker compose up -d --build 2>&1 | ForEach-Object { Info $_ }

if ($LASTEXITCODE -ne 0) { Fail "Falha ao subir os conteineres. Veja os logs acima." }
Ok "Conteineres iniciados"

# ── Aguardar PostgreSQL ficar healthy ─────────────────────────
Step "Aguardando PostgreSQL ficar pronto..."
$maxTentativas = 30
$tentativa = 0
do {
    $tentativa++
    Start-Sleep -Seconds 2
    $status = docker inspect barbearia-postgres --format "{{.State.Health.Status}}" 2>&1
    Info "Tentativa $tentativa/$maxTentativas — status: $status"
    if ($status -eq "healthy") { break }
    if ($tentativa -ge $maxTentativas) { Fail "PostgreSQL nao ficou healthy apos $($maxTentativas * 2) segundos." }
} while ($true)
Ok "PostgreSQL esta pronto"

# ── Aplicar migrations ────────────────────────────────────────
Step "Aplicando migrations do banco de dados..."

$migrations = Get-ChildItem "database\migrations\*.sql" | Sort-Object Name

if ($migrations.Count -eq 0) {
    Warn "Nenhuma migration encontrada em database\migrations\"
} else {
    foreach ($file in $migrations) {
        Info "Aplicando $($file.Name)..."
        $resultado = Get-Content $file.FullName -Raw | docker exec -i barbearia-postgres psql -U barbearia -d barbearia_saas 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host $resultado -ForegroundColor Red
            Fail "Erro ao aplicar $($file.Name)"
        }
        Ok $file.Name
    }
}

# ── Seed (opcional) ───────────────────────────────────────────
if ($Seed) {
    Step "Aplicando seed de dados demo..."
    if (Test-Path "database\seeds\001_demo.sql") {
        $resultado = Get-Content "database\seeds\001_demo.sql" -Raw | docker exec -i barbearia-postgres psql -U barbearia -d barbearia_saas 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host $resultado -ForegroundColor Yellow
            Warn "Seed pode ter falhado (dados ja existem? Use -Reset para recriar do zero)"
        } else {
            Ok "Seed aplicado com sucesso"
        }
    } else {
        Warn "Arquivo database\seeds\001_demo.sql nao encontrado"
    }
}

# ── Verificar healthcheck da API ──────────────────────────────
Step "Verificando API..."
$maxTentativas = 15
$tentativa = 0
do {
    $tentativa++
    Start-Sleep -Seconds 3
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3000/health/ready" -UseBasicParsing -TimeoutSec 3 2>&1
        if ($resp.StatusCode -eq 200) { break }
    } catch {}
    Info "Tentativa $tentativa/$maxTentativas — aguardando API..."
    if ($tentativa -ge $maxTentativas) {
        Warn "API nao respondeu. Verifique: docker compose logs api"
        break
    }
} while ($true)

try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/health/ready" -UseBasicParsing -TimeoutSec 5
    if ($resp.StatusCode -eq 200) { Ok "API respondendo em http://localhost:3000" }
} catch {
    Warn "API nao respondeu no health check. Verifique: docker compose logs api"
}

# ── Resumo final ──────────────────────────────────────────────
Write-Host ""
Write-Host "══════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "   Ambiente pronto!                       " -ForegroundColor Green
Write-Host "══════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Servicos:" -ForegroundColor White
Write-Host "  API    ➜  http://localhost:3000" -ForegroundColor Cyan
Write-Host "  n8n    ➜  http://localhost:5679  (usuario/senha: conforme N8N_BASIC_AUTH_USER e N8N_BASIC_AUTH_PASSWORD no .env)" -ForegroundColor Cyan
Write-Host "  DB     ➜  localhost:5432  (usuario/senha: conforme POSTGRES_USER e POSTGRES_PASSWORD no .env)" -ForegroundColor Cyan
Write-Host "  Redis  ➜  localhost:6380" -ForegroundColor Cyan
Write-Host ""

if ($Seed) {
    Write-Host "  Usuario demo:" -ForegroundColor White
    Write-Host "  Email  ➜  admin@demo.local" -ForegroundColor Yellow
    Write-Host "  Senha  ➜  admin12345" -ForegroundColor Yellow
    Write-Host "  Tenant ➜  00000000-0000-0000-0000-000000000001" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "  Comandos uteis:" -ForegroundColor White
Write-Host "  docker compose logs -f api    # ver logs da API" -ForegroundColor Gray
Write-Host "  docker compose ps             # ver status" -ForegroundColor Gray
Write-Host "  docker compose stop           # parar sem apagar dados" -ForegroundColor Gray
Write-Host ""
