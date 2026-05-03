# Como Subir o Ambiente no Docker
## Guia Passo a Passo — Windows + PowerShell

---

## Pré-requisitos (instale antes de começar)

| Programa | Versão mínima | Como verificar |
|---|---|---|
| Docker Desktop | 4.25+ | `docker --version` |
| Git | 2.40+ | `git --version` |

> Abra o **PowerShell** como **Administrador** para todos os comandos abaixo.

---

## PASSO 1 — Clonar o Repositório

```powershell
# Escolha uma pasta no seu servidor (ex: C:\projetos)
cd C:\projetos

# Clonar o projeto
git clone <URL_DO_REPOSITORIO> barbearia-saas

# Entrar na pasta do projeto
cd barbearia-saas
```

> Se já clonou antes, apenas atualize:
> ```powershell
> cd C:\projetos\barbearia-saas
> git pull origin main
> ```

---

## PASSO 2 — Criar o Arquivo de Configuração (.env)

O `.env` contém senhas e configurações do sistema. **Nunca suba esse arquivo para o Git.**

```powershell
# Copiar o template de exemplo
Copy-Item .env.example .env

# Abrir para editar (use o editor de sua preferência)
notepad .env
```

**Conteúdo do `.env` para desenvolvimento local:**

> Use o arquivo `.env.example` como base: `cp .env.example .env`
> Preencha todos os valores marcados com `<...>` antes de subir os serviços.

```env
# Veja .env.example para a lista completa de variáveis necessárias.
# Nunca coloque valores reais em documentação ou arquivos versionáveis.
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>
POSTGRES_DB=barbearia_saas
POSTGRES_USER=barbearia
POSTGRES_PASSWORD=<SENHA_FORTE_POSTGRES>
REDIS_URL=redis://:<REDIS_PASSWORD>@redis:6379
REDIS_PASSWORD=<SENHA_FORTE_REDIS>
JWT_SECRET=<MINIMO_64_CHARS_ALEATORIOS>
N8N_ENCRYPTION_KEY=<RANDOM_32_CHARS_HEX>
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=<SENHA_FORTE_N8N>
N8N_WEBHOOK_URL=http://localhost:5678/
EVOLUTION_API_URL=https://evolution.example.com
EVOLUTION_API_KEY=<API_KEY_EVOLUTION>
CORS_ORIGIN=http://localhost:5173
OUTBOX_POLL_INTERVAL_MS=5000
OUTBOX_CONCURRENCY=5
```

> **Importante:** `JWT_SECRET` (min 64 chars) e `N8N_ENCRYPTION_KEY` (min 32 chars hex) são obrigatórios.
> Gere com: `openssl rand -base64 64` e `openssl rand -hex 16`

---

## PASSO 3 — Verificar se o Docker está Rodando

```powershell
docker info
```

**Saída esperada (resumo):** deve mostrar informações do servidor Docker sem erros.

Se aparecer `error during connect`, abra o **Docker Desktop** e aguarde ele inicializar.

---

## PASSO 4 — Subir os Contêineres

```powershell
# Subir tudo em background (-d = detached)
docker compose up -d
```

O Docker vai:
1. Baixar as imagens `postgres:16-alpine`, `redis:7-alpine`, `n8nio/n8n:1.91.3`
2. Compilar a imagem da API (pode demorar 2-3 minutos na primeira vez)
3. Criar os volumes de dados
4. Iniciar todos os serviços

**Aguarde até ver algo como:**
```
✔ Container barbearia-postgres  Started
✔ Container barbearia-redis     Started
✔ Container barbearia-api       Started
✔ Container barbearia-n8n       Started
```

---

## PASSO 5 — Verificar se Tudo Está Saudável

```powershell
# Ver status dos contêineres
docker compose ps
```

**Saída esperada (todos "running" ou "healthy"):**
```
NAME                IMAGE                   STATUS
barbearia-postgres  postgres:16-alpine      running (healthy)
barbearia-redis     redis:7-alpine          running
barbearia-api       barbearia-api           running
barbearia-n8n       n8nio/n8n:1.91.3        running
```

> Se algum aparecer como `exited` ou `restarting`, vá para a seção **Solução de Problemas** no final.

---

## PASSO 6 — Aplicar as Migrations do Banco de Dados

As migrations criam todas as tabelas. **Execute apenas uma vez** (ou quando houver novas migrations).

```powershell
# Aguardar o postgres ficar healthy (cerca de 10-15 segundos)
Start-Sleep -Seconds 15

# Aplicar as migrations em ordem
Get-ChildItem "database\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "Aplicando: $($_.Name)" -ForegroundColor Cyan
    Get-Content $_.FullName -Raw | docker exec -i barbearia-postgres psql -U barbearia -d barbearia_saas
    Write-Host "OK: $($_.Name)" -ForegroundColor Green
}
```

**Saída esperada para cada arquivo:**
```
Aplicando: 001_init.sql
CREATE EXTENSION
CREATE TYPE
CREATE TABLE
...
OK: 001_init.sql
```

---

## PASSO 7 — Aplicar o Seed de Dados Demo (opcional)

O seed cria um tenant de exemplo com usuário admin, profissionais e serviços para testar.

```powershell
Get-Content "database\seeds\001_demo.sql" -Raw | docker exec -i barbearia-postgres psql -U barbearia -d barbearia_saas
Write-Host "Seed aplicado com sucesso!" -ForegroundColor Green
```

**O seed cria:**
- Tenant: `Barão da Navalha`
- Usuário admin: `admin@demo.local` / senha: `admin12345`
- Profissionais: Fred, João, Robson
- Serviços: Corte masculino (R$50), Barba (R$35), Corte + Barba (R$80)

---

## PASSO 8 — Testar se a API está Funcionando

```powershell
# Teste 1: Liveness (API no ar)
Invoke-WebRequest -Uri "http://localhost:3000/health/live" -UseBasicParsing | Select-Object -ExpandProperty Content

# Resultado esperado:
# {"status":"ok"}

# Teste 2: Readiness (API + Banco + Redis)
Invoke-WebRequest -Uri "http://localhost:3000/health/ready" -UseBasicParsing | Select-Object -ExpandProperty Content

# Resultado esperado:
# {"status":"ok"}
```

---

## PASSO 9 — Testar o Login

```powershell
$body = '{"email":"admin@demo.local","password":"admin12345","tenant_id":"00000000-0000-0000-0000-000000000001"}'

$response = Invoke-WebRequest `
    -Uri "http://localhost:3000/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body `
    -UseBasicParsing

$response.Content
```

**Resposta esperada:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "user": {
    "id": "...",
    "email": "admin@demo.local",
    "role": "tenant_owner",
    "name": "Admin Demo"
  }
}
```

---

## PASSO 10 — Acessar o n8n (Automações)

Abra o navegador em: **http://localhost:5678**

- **Usuário:** valor de `N8N_BASIC_AUTH_USER` no `.env` (padrão: `admin`)
- **Senha:** valor de `N8N_BASIC_AUTH_PASSWORD` no `.env`

---

## Resumo das URLs Locais

| Serviço | URL | Descrição |
|---|---|---|
| API | http://localhost:3000 | Backend da aplicação |
| API Health | http://localhost:3000/health/ready | Status da API |
| n8n | http://localhost:5679 | Automações e fluxos (porta 5679 para não conflitar) |
| PostgreSQL | localhost:5432 | Banco de dados (use DBeaver/TablePlus) |
| Redis | localhost:6380 | Cache (porta 6380 para não conflitar com Evolution API) |

> **Nota sobre portas:** O projeto usa 5679 para n8n e 6380 para Redis no host  
> para evitar conflito com a Evolution API (que usa 5678 e 6379).  
> Dentro do Docker, os serviços se comunicam pelas portas originais (5678 e 6379).

---

## Comandos do Dia a Dia

```powershell
# Subir o ambiente
docker compose up -d

# Parar o ambiente (sem deletar dados)
docker compose stop

# Parar e remover os contêineres (dados ficam nos volumes)
docker compose down

# Parar e remover TUDO incluindo volumes (⚠️ apaga o banco!)
docker compose down -v

# Ver logs em tempo real de todos os serviços
docker compose logs -f

# Ver logs apenas da API
docker compose logs -f api

# Ver logs apenas do banco
docker compose logs -f postgres

# Reiniciar um serviço específico
docker compose restart api

# Ver uso de CPU e memória
docker stats

# Reconstruir a imagem da API (após mudanças no código)
docker compose build api
docker compose up -d api
```

---

## Solução de Problemas

### Problema: API reiniciando em loop

```powershell
# Ver o erro da API
docker compose logs api --tail=50
```

**Causas comuns:**
- `JWT_SECRET` tem menos de 32 caracteres → aumente no `.env`
- `DATABASE_URL` com host errado → use `postgres` (nome do serviço Docker, não `localhost`)
- Porta 3000 já em uso → feche outro programa na porta 3000

---

### Problema: Banco não aceita conexão

```powershell
# Verificar se o postgres está healthy
docker compose ps postgres

# Se aparecer "starting" aguarde mais 20 segundos e tente de novo
# Se aparecer "unhealthy" veja os logs:
docker compose logs postgres
```

---

### Problema: Migration com erro

```powershell
# Conectar direto no banco para investigar
docker exec -it barbearia-postgres psql -U barbearia -d barbearia_saas

# Dentro do psql, ver tabelas criadas:
\dt

# Sair do psql:
\q
```

---

### Problema: Porta já em uso

```powershell
# Ver qual processo está usando a porta 3000
netstat -ano | findstr :3000

# Matar o processo pelo PID (substitua 12345 pelo PID real)
taskkill /PID 12345 /F
```

---

### Resetar o ambiente do zero

```powershell
# ⚠️ CUIDADO: apaga todos os dados!
docker compose down -v
docker compose up -d
Start-Sleep -Seconds 15
Get-ChildItem "database\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    Get-Content $_.FullName -Raw | docker exec -i barbearia-postgres psql -U barbearia -d barbearia_saas
}
Get-Content "database\seeds\001_demo.sql" -Raw | docker exec -i barbearia-postgres psql -U barbearia -d barbearia_saas
```

---

*Para subir em produção, consulte `docs/DEPLOY_WINDOWS.md`*
