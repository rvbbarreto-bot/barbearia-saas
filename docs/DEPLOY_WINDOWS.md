# Guia de Deploy — SaaS Barbearia
## Publicação em Servidor Windows com Docker

**Versão:** 1.0  
**Público:** DevOps / Responsável técnico do cliente  
**Nível:** Alto nível — visão geral e pré-requisitos

---

## 1. Visão Geral do Sistema

O sistema SaaS Barbearia é composto por **4 serviços** que rodam em contêineres Docker:

| Serviço | Função | Porta padrão |
|---|---|---|
| `api` | Backend da aplicação (Node.js / Fastify) | 3000 |
| `postgres` | Banco de dados relacional (PostgreSQL 16) | 5432 (interno) |
| `redis` | Cache e filas de mensagens | 6379 (interno) |
| `n8n` | Motor de automação / webhooks WhatsApp | 5678 |

> **Importante:** Em produção, apenas a `api` e o `n8n` ficam expostos publicamente via proxy reverso (Traefik ou Nginx). O banco de dados e o Redis **nunca** são expostos na internet.

---

## 2. Pré-Requisitos — Programas a Instalar no Servidor

### 2.1 Sistema Operacional Suportado

| Opção | Versão mínima | Observação |
|---|---|---|
| Windows Server | 2019 ou 2022 | Recomendado para servidores de produção |
| Windows 10/11 Pro | Build 19041+ | Apenas para ambientes de teste/homologação |

---

### 2.2 Lista de Programas Obrigatórios

#### ① Docker Desktop (Windows)
- **Download:** https://www.docker.com/products/docker-desktop/
- **Versão mínima:** 4.25 ou superior
- **Requisitos internos:**
  - WSL 2 (Windows Subsystem for Linux 2) — instalado automaticamente pelo Docker Desktop
  - Virtualização habilitada na BIOS (Intel VT-x ou AMD-V)
  - Hyper-V ativado (Windows Pro/Server)
- **Como verificar após instalação:**
  ```powershell
  docker --version
  docker compose version
  ```

> **Windows Server:** Usar Docker Engine (não Docker Desktop). Instalar via:
> ```powershell
> Install-Module DockerProvider -Force
> Install-Package Docker -ProviderName DockerProvider -Force
> ```

---

#### ② Git
- **Download:** https://git-scm.com/download/win
- **Versão mínima:** 2.40 ou superior
- **Uso:** Clonar o repositório do sistema no servidor
- **Como verificar:**
  ```powershell
  git --version
  ```

---

#### ③ Notepad++ ou VS Code (para editar configurações)
- **Download Notepad++:** https://notepad-plus-plus.org/
- **Download VS Code:** https://code.visualstudio.com/
- **Uso:** Editar o arquivo `.env.prod` com as configurações do cliente
- **Obrigatoriedade:** Opcional, mas fortemente recomendado

---

#### ④ PowerShell 7 (recomendado)
- **Download:** https://github.com/PowerShell/PowerShell/releases
- **Versão mínima:** 7.3 ou superior
- **Uso:** Executar os comandos de deploy e manutenção
- **Como verificar:**
  ```powershell
  $PSVersionTable.PSVersion
  ```

---

### 2.3 Requisitos de Hardware Mínimos (Produção)

| Recurso | Mínimo | Recomendado |
|---|---|---|
| CPU | 2 vCPUs | 4 vCPUs |
| RAM | 4 GB | 8 GB |
| Disco (SSD) | 40 GB livres | 100 GB livres |
| Rede | 10 Mbps | 100 Mbps |

---

### 2.4 Portas que Precisam Estar Abertas no Firewall

| Porta | Protocolo | Serviço | Direção |
|---|---|---|---|
| 80 | TCP | HTTP (redirect para HTTPS) | Entrada |
| 443 | TCP | HTTPS (API + n8n) | Entrada |
| 3000 | TCP | API interna | Somente local |
| 5678 | TCP | n8n interno | Somente local |

> **Regra:** Apenas as portas 80 e 443 devem ser abertas para a internet. As demais são internas ao Docker.

---

## 3. Infraestrutura Necessária (antes do deploy)

### 3.1 Domínios DNS
O cliente precisa apontar os seguintes subdomínios para o IP do servidor:

| Subdomínio | Destino | Serviço |
|---|---|---|
| `api.seudominio.com.br` | IP do servidor | Backend da aplicação |
| `n8n.seudominio.com.br` | IP do servidor | Motor de automação |

> Tempo de propagação de DNS: até 24 horas.

### 3.2 Certificado SSL/TLS
- **Opção A (recomendada):** Let's Encrypt — gerado automaticamente pelo Traefik durante o primeiro deploy
- **Opção B:** Certificado próprio do cliente (formato `.pem`)

---

## 4. Passo a Passo do Deploy

### Etapa 1 — Preparar o servidor

```powershell
# 1. Verificar se Docker está rodando
docker info

# 2. Criar pasta do projeto no servidor
mkdir C:\barbearia-saas
cd C:\barbearia-saas

# 3. Clonar o repositório
git clone <URL_DO_REPOSITORIO> .
```

---

### Etapa 2 — Configurar variáveis de ambiente

```powershell
# 1. Copiar o template de configuração
Copy-Item .env.staging.example .env.prod

# 2. Abrir o arquivo e preencher TODOS os campos
notepad .env.prod
```

**Campos obrigatórios no `.env.prod`:**

| Variável | Descrição | Exemplo |
|---|---|---|
| `DATABASE_URL` | String de conexão do banco | `postgres://user:senha@postgres:5432/barbearia_saas` |
| `POSTGRES_PASSWORD` | Senha do banco de dados | Mínimo 16 caracteres aleatórios |
| `REDIS_PASSWORD` | Senha do Redis | Mínimo 16 caracteres aleatórios |
| `JWT_SECRET` | Chave JWT | Mínimo 64 caracteres aleatórios |
| `CORS_ORIGIN` | URL do frontend | `https://app.seudominio.com.br` |
| `API_HOST` | Domínio da API | `api.seudominio.com.br` |
| `N8N_HOST` | Domínio do n8n | `n8n.seudominio.com.br` |
| `EVOLUTION_API_URL` | URL do Evolution API | Fornecido pelo cliente |
| `EVOLUTION_API_KEY` | Chave do Evolution API | Fornecido pelo cliente |

> **Segurança:** Nunca compartilhe o arquivo `.env.prod` por e-mail ou chat. Use um gerenciador de senhas (ex: Bitwarden, 1Password).

---

### Etapa 3 — Criar a rede Docker externa (Traefik)

```powershell
# Necessário apenas na primeira instalação
docker network create traefik-public
```

---

### Etapa 4 — Executar as migrações do banco de dados

```powershell
# As migrations criam todas as tabelas e configurações
# Executar antes de subir a aplicação pela primeira vez

docker compose -f docker-compose.prod.yml run --rm api node -e "
const { pool } = await import('./dist/infra/db/pool.js');
console.log('DB conectado');
pool.end();
"
```

> Para rodar as migrations SQL manualmente, use os scripts em `database/migrations/` na ordem numérica (001 → 007).

---

### Etapa 5 — Subir o sistema

```powershell
# Subir todos os serviços em modo produção
docker compose -f docker-compose.prod.yml up -d

# Verificar se todos os contêineres estão rodando
docker compose -f docker-compose.prod.yml ps
```

**Saída esperada (todos `healthy`):**

```
NAME                    STATUS          PORTS
barbearia-api-prod      healthy         0.0.0.0:3000->3000/tcp
barbearia-postgres-prod healthy
barbearia-redis-prod    healthy
barbearia-n8n-prod      healthy
barbearia-backup-prod   running
```

---

### Etapa 6 — Validar o deploy

```powershell
# Testar se a API está respondendo
Invoke-WebRequest -Uri "https://api.seudominio.com.br/health/ready"

# Resposta esperada: {"status":"ok"}
```

Verificações manuais no navegador:
- `https://api.seudominio.com.br/health/live` → deve retornar `{"status":"ok"}`
- `https://api.seudominio.com.br/health/ready` → deve retornar `{"status":"ok"}` (confirma DB + Redis)
- `https://n8n.seudominio.com.br` → deve abrir a interface do n8n

---

## 5. Comandos de Manutenção

### Verificar logs em tempo real
```powershell
# Logs da API
docker compose -f docker-compose.prod.yml logs -f api

# Logs de todos os serviços
docker compose -f docker-compose.prod.yml logs -f
```

### Reiniciar um serviço específico
```powershell
docker compose -f docker-compose.prod.yml restart api
```

### Atualizar para nova versão
```powershell
# 1. Baixar nova versão
git pull origin main

# 2. Reconstruir a imagem
docker compose -f docker-compose.prod.yml build api

# 3. Reiniciar sem downtime
docker compose -f docker-compose.prod.yml up -d --no-deps api
```

### Parar o sistema completamente
```powershell
docker compose -f docker-compose.prod.yml down
```

### Ver uso de recursos
```powershell
docker stats
```

---

## 6. Backup do Banco de Dados

O sistema inclui um serviço de backup automático (`backup`) que roda diariamente e mantém os últimos 60 dias de backups.

**Local dos backups no servidor:**
```
C:\barbearia-saas\backups\
```

**Para fazer backup manual agora:**
```powershell
docker exec barbearia-backup-prod /backup.sh
```

---

## 7. Segurança — Checklist pré-produção

Antes de entregar o sistema ao cliente, verificar:

- [ ] Todas as senhas no `.env.prod` são fortes (16+ caracteres, letras+números+símbolos)
- [ ] O arquivo `.env.prod` **não está** no repositório Git (verificar `.gitignore`)
- [ ] O banco de dados **não está** acessível pela internet (porta 5432 fechada)
- [ ] O Redis **não está** acessível pela internet (porta 6379 fechada)
- [ ] HTTPS está funcionando (certificado SSL válido)
- [ ] `CORS_ORIGIN` aponta somente para o domínio do frontend do cliente
- [ ] O n8n está protegido com usuário e senha fortes
- [ ] Backup automático está ativo e funcionando

---

## 8. Suporte e Contato

| Situação | Ação |
|---|---|
| Sistema não sobe | Verificar logs: `docker compose logs api` |
| Banco de dados com erro | Verificar migration aplicada e credenciais no `.env.prod` |
| WhatsApp não recebe mensagens | Verificar configuração do Evolution API e `EVOLUTION_API_KEY` |
| n8n não processa fluxos | Acessar `https://n8n.seudominio.com.br` e verificar execuções |

---

*Documento gerado em 29/04/2026 — Versão 1.0*  
*Equipe de Desenvolvimento — Exeq*
