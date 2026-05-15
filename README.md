# Barbearia SaaS V4 — Guia de Setup Local

> Stack: Node.js 22 · Fastify · TypeScript · PostgreSQL 16 · Redis 7 · n8n · React · Vite

---

## Sumário

**QA / ambiente local reproduzível:** `[docs/QA_AMBIENTE_LOCAL.md](docs/QA_AMBIENTE_LOCAL.md)` — URLs, portas, `.env`, Docker vs npm.

**Bateria negativa API + fecho PO:** relatório `docs/RELATORIO_QA_API_TESTES_NEGATIVOS_2026-05-14.md`, anexo `docs/FECHO_QA_API_NEGATIVOS_PO_2026-05-14.md`, script `scripts/qa-api-negative-battery.ps1`.

**Fase P2 (MVP operacional / piloto controlado):** branch `feature/p2-operational-mvp-pilot` — relatório mestre `docs/P2_RELATORIO_MVP_OPERACIONAL.md`; decisões de produto `docs/P2_DECISOES_PRODUTO.md`; QA `docs/P2_QA_EXECUCAO.md` (script `scripts/qa-api-p2-operational-battery.ps1`, resultados `docs/QA_API_P2_OPERATIONAL_RESULTS.csv`); runbook `docs/P2_RUNBOOK_SUPORTE.md`; WhatsApp/n8n `docs/P2_FLUXO_WHATSAPP_N8N.md`; outbox `docs/P2_OUTBOX_OPERACIONAL.md`; appointments `docs/P2_APPOINTMENT_LIFECYCLE.md`.

1. [Baseline oficial V4 (PO)](#baseline-oficial-v4-po)
2. [Pré-requisitos](#pré-requisitos)
3. [Configuração de variáveis de ambiente](#configuração-de-variáveis-de-ambiente)
4. [Subindo o projeto](#subindo-o-projeto)
5. [Migrações e seed](#migrações-e-seed)
6. [Healthchecks](#healthchecks)
7. [Operações do dia a dia](#operações-do-dia-a-dia)
8. [Referência de variáveis](#referência-de-variáveis)
9. [Endpoints da API](#endpoints-da-api)
10. [Decisões arquiteturais](#decisões-arquiteturais)
11. [Segurança — regra de ouro](#segurança--regra-de-ouro)
12. [Pipeline de CI e qualidade](#pipeline-de-ci-e-qualidade)

---

## Baseline oficial V4 (PO)

- **Documento canónico (PDF):** `docs/Barbearia_SaaS_V4_Revisao_Senior_Baixo_Nivel.pdf` — baseline e ordem de referência: `**docs/README.md`** (histórico de caminho em `docs/requirements/README.md`).
- **Verificação DevOps (local/CI):** `PowerShell -ExecutionPolicy Bypass -File scripts/verify-v4-baseline.ps1` — use `-Strict` quando o PDF/MD já tiver de existir no clone.
- **Homologação final DEV oficial:** modelo de relatório complementar em `**docs/HOMOLOGACAO_FINAL_RELATORIO_COMPLEMENTAR_TEMPLATE.md`**.
- **Regra Cursor (IA / equipa):** `.cursor/rules/barbearia-v4-baseline.mdc` na **raiz do clone** do pacote (ver nota em `docs/requirements/README.md` se o workspace for só `barbearia-saas/`).
- Documentação técnica adicional: `docs/DOC_BAIXO_NIVEL_REQUISITOS.md` (complementar; não substitui o PDF oficial até equivalência declarada pelo PO).

---

## Pré-requisitos


| Ferramenta                                      | Versão mínima                   |
| ----------------------------------------------- | ------------------------------- |
| Docker Desktop                                  | 4.x                             |
| Docker Compose                                  | v2 (incluído no Docker Desktop) |
| Node.js (para desenvolvimento local sem Docker) | 22.x LTS                        |
| npm                                             | 10.x                            |


---

## Configuração de variáveis de ambiente

O projeto possui **dois** arquivos de exemplo que devem ser copiados e preenchidos:

### 1. API e infraestrutura (raiz do projeto)

```bash
cp .env.example .env
```

Edite `.env` e **substitua todos os placeholders** `<...>` por valores reais.  
Veja a [Referência de variáveis](#referência-de-variáveis) abaixo.

### 2. Frontend (apps/web)

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edite `apps/web/.env.local` conforme necessário.

> **Regra absoluta:** NUNCA commite `.env` nem `.env.local` ao Git.  
> Eles estão bloqueados pelo `.gitignore`. Os únicos arquivos que vão ao repositório são os `.env.example`.

---

## Subindo o projeto

### Opção A — Script automático (recomendado no Windows)

```powershell
# Setup completo (apenas infraestrutura)
PowerShell -ExecutionPolicy Bypass -File setup.ps1

# Setup completo + seed de dados demo
PowerShell -ExecutionPolicy Bypass -File setup.ps1 -Seed

# Destruir tudo e recriar do zero
PowerShell -ExecutionPolicy Bypass -File setup.ps1 -Reset -Seed
```

### Opção B — Docker Compose manual

```bash
# 1. Copiar e preencher variáveis de ambiente
cp .env.example .env
# edite .env com seus valores

# 2. Subir todos os serviços
docker compose up -d --build

# 3. Aguardar o PostgreSQL ficar healthy (≈15 s)
docker compose ps

# 4. Aplicar migrations manualmente (se necessário)
for f in database/migrations/*.sql; do
  docker exec -i barbearia-postgres psql -U barbearia -d barbearia_saas < "$f"
done

# 5. (Opcional) Aplicar seed demo
docker exec -i barbearia-postgres psql -U barbearia -d barbearia_saas \
  < database/seeds/001_demo.sql
```

### URLs locais após subir


| Serviço        | URL                                            | Notas                                   |
| -------------- | ---------------------------------------------- | --------------------------------------- |
| API            | [http://localhost:3000](http://localhost:3000) | Health: `GET /health`                   |
| Frontend (dev) | [http://localhost:5173](http://localhost:5173) | `cd apps/web && npm run dev`            |
| n8n            | [http://localhost:5679](http://localhost:5679) | Usuário: valor de `N8N_BASIC_AUTH_USER` |
| PostgreSQL     | localhost:5432                                 | Usuário/senha: conforme `.env`          |
| Redis          | localhost:6380                                 | Senha: conforme `REDIS_PASSWORD`        |


### Importação de workflows n8n (via API JSON)

Trecho apenas referência para quando for subir fluxos automatizados; **não** bloqueia migrations, seed nem testes da API.


| Variável / item | Observação                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `N8N_API_KEY`   | Obrigatória para chamadas REST do n8n; sem ela os scripts/import recebem **401**.                        |
| `N8N_URL`       | Opcional (ex.: `http://localhost:5678`).                                                                 |
| Script          | Da raiz deste projeto (`apps/`, `n8n/`, `docker-compose.yml`): `node n8n/import_workflows_from_json.mjs` |


---

## Migrações e seed

As migrations ficam em `database/migrations/` e são aplicadas em ordem numérica.  
O Docker Compose aplica automaticamente no **primeiro boot** (via `entrypoint-initdb.d`), incluindo **`099_demo_seed_qa.sql`** (tenant demo + utilizadores + serviços/profissionais) quando o volume Postgres está vazio.

Pendências de permissões da role da aplicação (produção): ver `database/SECURITY_HARDENING.md`.

> **Atenção:** `entrypoint-initdb.d` só executa quando o volume do banco está vazio.  
> Para aplicar migrations em um volume já existente (ex: nova migration adicionada), use **`migrate.sh`** (com `psql` local) ou **`npm run db:migrate`** (via `docker compose exec` no serviço `postgres`). Ambos usam a tabela `_migrations` e **não** reaplicam ficheiros já registados.

### Primeiro deploy após P2.1 (volumes Postgres já existentes)

As migrations **`103_operational_audit_events.sql`** e **`104_calendar_blocks_created_by.sql`** entram no mesmo fluxo que as demais. Após `git pull` e com o Postgres do Compose em execução:

```bash
npm run db:migrate
```

Em ambientes Linux/macOS com `psql` apontando para o mesmo host/porta do `.env`:

```bash
./migrate.sh
```

Confirmar que `103` e `104` aparecem como aplicadas (ou `SKIP` se já estiverem na `_migrations`). Não é necessário `docker exec` manual ficheiro a ficheiro.

### Volumes criados só pelo `initdb` (`_migrations` vazia)

O Compose monta `database/migrations/` em `docker-entrypoint-initdb.d`: no **primeiro** arranque do volume o Postgres executa esses `.sql`, mas **não** preenche `_migrations`. Nesse estado, `npm run db:migrate:dry-run` pode mostrar **todas** as migrations como pendentes; **não** corra `npm run db:migrate` de imediato (risco de tentar reaplicar `001_init.sql` sobre um esquema já criado).

1. Confirmar até que ficheiro de migration o volume já reflecte (histórico de deploy / versão da imagem ou inspecção do esquema).
2. Registar esse conjunto em `_migrations` **sem** reexecutar SQL:

```bash
npm run db:migrate:backfill -- --through 102_qa_customer_uuid_fix.sql
```

Substitua o nome pelo **último** ficheiro já efectivo no volume (ordem lexicográfica, igual à pasta `database/migrations/`). Ex.: se o init já correu com o repo actual (incl. **103** e **104**), use `--through 104_calendar_blocks_created_by.sql`.

3. Depois: `npm run db:migrate` (aplica apenas o que ainda não estiver em `_migrations`).

### Migrations incrementais com rastreamento

```bash
# Aplicar migrations pendentes (pula as já aplicadas)
./migrate.sh

# Aplicar migrations + seed demo
./migrate.sh --seed

# Ver quais migrations ainda não foram aplicadas (sem executar)
./migrate.sh --dry-run
```

> O script cria uma tabela `_migrations` para rastrear o que já foi aplicado.

### Via Docker Compose (sem psql local na máquina)

Na raiz do repositório, com `docker compose up` e serviço `postgres` **healthy**:

```bash
# Aplicar migrations pendentes (usa _migrations; alinhado com migrate.sh)
npm run db:migrate

# Listar o que falta aplicar (sem executar)
npm run db:migrate:dry-run

# Migrations + seed demo (equivalente a ./migrate.sh --seed)
npm run db:migrate:seed
```

> Implementação: `scripts/migrate-docker.mjs` (Node, sem dependências extra).

### Via Docker (casos pontuais / legado)

Para diagnóstico pontual, pode injetar SQL via `docker compose exec` + `psql`; **não** use isto como substituto de `npm run db:migrate` / `migrate.sh` em rotina, porque não mantém `_migrations` coerente com o histórico de `entrypoint-initdb.d`.

### Dados demo


| Campo         | Valor                                  |
| ------------- | -------------------------------------- |
| Tenant ID     | `00000000-0000-0000-0000-000000000001` |
| E-mail        | `admin@demo.local`                     |
| Senha         | `admin12345`                           |
| Webhook token | `demo_webhook_token_change_me`         |


> Estes dados são **exclusivos para desenvolvimento local**. Não use em staging ou produção.

---

## Healthchecks

Todos os serviços possuem healthcheck configurado no `docker-compose.yml`.


| Serviço    | Rota/Comando                   | Critério                          |
| ---------- | ------------------------------ | --------------------------------- |
| `postgres` | `pg_isready`                   | healthy antes de subir API e n8n  |
| `redis`    | `redis-cli ping`               | healthy antes de subir API        |
| `api`      | `GET /health/ready` → HTTP 200 | healthy antes de subir web e n8n  |
| `web`      | `GET /` → HTTP 200             | independente                      |
| `n8n`      | `GET /healthz` → HTTP 200      | depende de postgres + api healthy |


```bash
# Verificar status de todos os healthchecks
docker compose ps

# Saúde da API (resposta esperada: {"status":"ok"})
curl http://localhost:3000/health/ready

# Saúde do banco (via API)
curl http://localhost:3000/health/live

# Saúde do Redis (direto)
docker exec barbearia-redis redis-cli -a "$REDIS_PASSWORD" ping
```

**O worker de outbox** (envio assíncrono de mensagens WhatsApp) é executado **embutido na API** como `setInterval`. Não é um serviço Docker separado. Configurado por `OUTBOX_POLL_INTERVAL_MS` e `OUTBOX_CONCURRENCY`.

---

## Operações do dia a dia

```bash
# ── Subir stack completa ───────────────────────────────────────────────────
docker compose up -d --build

# ── Subir só API + infra (sem web e n8n) ──────────────────────────────────
docker compose -f docker-compose.api-only.yml up -d --build

# ── Ver logs em tempo real ─────────────────────────────────────────────────
docker compose logs -f                   # todos os serviços
docker compose logs -f api               # só API
docker compose logs -f postgres          # só banco
docker compose logs -f n8n               # só n8n

# ── Parar sem apagar dados ────────────────────────────────────────────────
docker compose stop

# ── Parar e remover containers (volumes preservados) ─────────────────────
docker compose down

# ── Resetar banco (apaga TODOS os dados e recria do zero) ─────────────────
docker compose down -v
docker compose up -d --build

# ── Acessar o banco via psql ──────────────────────────────────────────────
docker exec -it barbearia-postgres psql -U barbearia -d barbearia_saas

# ── Rebuild de um serviço específico ──────────────────────────────────────
docker compose build api
docker compose build web
docker compose up -d api

# ── Verificar variáveis de ambiente injetadas na API ──────────────────────
docker exec barbearia-api env | grep -E "NODE_ENV|PORT|DATABASE|REDIS|JWT"
```

---

## Referência de variáveis

### Variáveis obrigatórias (sem valor padrão seguro)


| Variável                  | Descrição                                                   | Como gerar                |
| ------------------------- | ----------------------------------------------------------- | ------------------------- |
| `JWT_SECRET`              | Chave de assinatura JWT. Mínimo 64 chars.                   | `openssl rand -base64 64` |
| `POSTGRES_PASSWORD`       | Senha do PostgreSQL.                                        | `openssl rand -base64 32` |
| `REDIS_PASSWORD`          | Senha do Redis.                                             | `openssl rand -base64 32` |
| `N8N_ENCRYPTION_KEY`      | Chave de criptografia das credenciais n8n. Mínimo 32 chars. | `openssl rand -hex 16`    |
| `N8N_BASIC_AUTH_PASSWORD` | Senha do painel n8n.                                        | `openssl rand -base64 24` |


### Variáveis obrigatórias com padrão aceitável em dev


| Variável                  | Padrão dev               | Descrição                                            |
| ------------------------- | ------------------------ | ---------------------------------------------------- |
| `NODE_ENV`                | `development`            | Ambiente de execução                                 |
| `PORT`                    | `3000`                   | Porta da API                                         |
| `POSTGRES_DB`             | `barbearia_saas`         | Nome do banco de dados                               |
| `POSTGRES_USER`           | `barbearia`              | Usuário do PostgreSQL                                |
| `DATABASE_URL`            | —                        | URL completa do PostgreSQL (derivada das vars acima) |
| `REDIS_URL`               | —                        | URL completa do Redis (derivada de `REDIS_PASSWORD`) |
| `JWT_EXPIRES_IN`          | `15m`                    | Expiração do access token                            |
| `JWT_REFRESH_EXPIRES_IN`  | `7d`                     | Expiração do refresh token                           |
| `CORS_ORIGIN`             | `http://localhost:5173`  | Origem permitida pelo CORS                           |
| `N8N_BASIC_AUTH_USER`     | `admin`                  | Usuário do painel n8n                                |
| `N8N_WEBHOOK_URL`         | `http://localhost:5678/` | URL pública do n8n                                   |
| `OUTBOX_POLL_INTERVAL_MS` | `5000`                   | Intervalo do worker de outbox (ms)                   |
| `OUTBOX_CONCURRENCY`      | `5`                      | Concorrência do worker de outbox                     |
| `OUTBOX_FORCE_SEND_FAILURE` | `false` (omit)       | Se `true`, simula falha do provider (CT-101); mensagem não é `sent`, fica `pending`/`dead` com retry |


### Variáveis de integrações externas (obrigatórias em produção)


| Variável            | Descrição                                               |
| ------------------- | ------------------------------------------------------- |
| `EVOLUTION_API_URL` | URL da Evolution API (WhatsApp)                         |
| `EVOLUTION_API_KEY` | Chave da Evolution API                                  |
| `OPENAI_API_KEY`    | Chave da OpenAI (somente se o agente de IA for ativado) |


### Variáveis de rate limit (opcionais — possuem padrão)


| Variável                      | Padrão     | Descrição                              |
| ----------------------------- | ---------- | -------------------------------------- |
| `AUTH_RATE_LIMIT_WINDOW`      | `1 minute` | Janela de rate limit para autenticação |
| `AUTH_LOGIN_RATE_LIMIT_MAX`   | `10`       | Máx. tentativas de login por janela    |
| `AUTH_REFRESH_RATE_LIMIT_MAX` | `20`       | Máx. refreshes por janela              |
| `AUTH_LOGOUT_RATE_LIMIT_MAX`  | `30`       | Máx. logouts por janela                |
| `AUTH_MAX_FAILED_ATTEMPTS`    | `5`        | Tentativas antes do bloqueio de conta  |
| `AUTH_LOCKOUT_MINUTES`        | `15`       | Duração do bloqueio de conta (minutos) |
| `TENANT_DEFAULT_RPM`          | `300`      | Rate limit padrão por tenant (req/min) |


### Variáveis do Frontend (`apps/web/.env.local`)


| Variável                 | Obrigatória    | Descrição                                    |
| ------------------------ | -------------- | -------------------------------------------- |
| `VITE_DEFAULT_TENANT_ID` | Não (dev only) | UUID do tenant exibido na tela de login demo |


---

## Endpoints da API

### Contexto multi-tenant (`x-tenant-id` e JWT)

- O JWT de acesso inclui o claim `tenant_id` após login bem-sucedido.
- **Ordem de resolução (CT-020 / P1):** (1) se `x-tenant-id` estiver presente e não vazio, esse valor define o tenant da operação; (2) caso contrário, usa-se o `tenant_id` do JWT; (3) se nenhum dos dois existir, **401** `TENANT_REQUIRED`; (4) se ambos existirem e forem **diferentes**, **403** `TENANT_MISMATCH`.
- Integrações devem **continuar a enviar** `x-tenant-id` por clareza e para testes explícitos de isolamento.
- Detalhe canónico: `apps/api/src/openapi/spec.ts` (descrição global e `securitySchemes.tenantHeader`).

### Confirmação explícita em agendamentos (`explicit_confirmation`)

- Com `explicit_confirmation: true`, o fluxo típico aguarda confirmação explícita (dois passos / painel).
- Com `false`, trata-se de **criação administrativa / walk-in** sem confirmação explícita do cliente pelo canal: permitido apenas para **`tenant_admin` ou superior** em `source` não walk-in, ou **`walk_in`** operado por **`attendant` ou superior** (exceto `professional`, sempre bloqueado com `false`). Rastreável em `appointment_events` (`administrative_skip_client_explicit_confirm`). Decisão de produto: `docs/DECISAO_PRODUTO_CT073_EXPLICIT_CONFIRMATION.md`.

### Saúde


| Método | Rota            | Descrição                          |
| ------ | --------------- | ---------------------------------- |
| `GET`  | `/health`       | Liveness check                     |
| `GET`  | `/health/ready` | Readiness check (API + DB + Redis) |


### Autenticação


| Método | Rota            | Auth |
| ------ | --------------- | ---- |
| `POST` | `/auth/login`   | —    |
| `POST` | `/auth/refresh` | —    |
| `POST` | `/auth/logout`  | JWT  |


### WhatsApp


| Método | Rota                         | Auth                       |
| ------ | ---------------------------- | -------------------------- |
| `POST` | `/webhooks/whatsapp/inbound` | `x-webhook-token` (header) |


### Catálogo (serviços e profissionais)


| Método       | Rota                                 | Auth                                                               |
| ------------ | ------------------------------------ | ------------------------------------------------------------------ |
| `GET`        | `/api/v1/services`                   | JWT (lista operacional: só **ativos**; `active=false` só gerência) |
| `GET`        | `/api/v1/services/:id`               | JWT                                                                |
| `POST/PATCH` | `/api/v1/services` …                 | JWT **manager**+                                                   |
| `GET`        | `/api/v1/professionals`              | JWT                                                                |
| `POST/PATCH` | `/api/v1/professionals` …            | JWT **manager**+                                                   |
| `PATCH`      | `/api/v1/professionals/:id/services` | JWT **manager** (substitui vínculos)                               |
| `POST`       | `/api/v1/professionals/:id/services` | JWT **manager** (adição idempotente)                               |


Payloads e erros (`SERVICE_NOT_BOOKABLE`, `SCHEDULE_DURATION_MISMATCH`, etc.): `**apps/api/docs/CATALOG_API.md`**.

### Agendamentos


| Método  | Rota                                  | Auth                                                    |
| ------- | ------------------------------------- | ------------------------------------------------------- |
| `GET`   | `/api/v1/appointments`                | JWT                                                     |
| `POST`  | `/api/v1/appointments`                | JWT — corpo deve incluir `**service_id**` (catálogo V4) |
| `PATCH` | `/api/v1/appointments/:id/cancel`     | JWT                                                     |
| `PATCH` | `/api/v1/appointments/:id/reschedule` | JWT                                                     |


### Disponibilidade


| Método | Rota                   | Auth |
| ------ | ---------------------- | ---- |
| `GET`  | `/api/v1/availability` | JWT  |


### Profissionais — folgas e horários


| Método         | Rota                                                        | Auth |
| -------------- | ----------------------------------------------------------- | ---- |
| `GET/POST`     | `/api/v1/professionals/:id/time-off`                        | JWT  |
| `PATCH/DELETE` | `/api/v1/professionals/:id/time-off/:timeOffId`             | JWT  |
| `GET/POST`     | `/api/v1/professionals/:id/recurring-time-off`              | JWT  |
| `PATCH/DELETE` | `/api/v1/professionals/:id/recurring-time-off/:recurringId` | JWT  |
| `GET/POST`     | `/api/v1/professionals/:id/business-hours`                  | JWT  |
| `PATCH/DELETE` | `/api/v1/professionals/:id/business-hours/:businessHoursId` | JWT  |


---

## Decisões arquiteturais

1. **Core API é a fonte de verdade** — toda regra de negócio vive na API. n8n é camada de orquestração.
2. **PostgreSQL multi-tenant com RLS** — toda tabela de negócio possui `tenant_id`. Row Level Security garante isolamento.
3. **Outbox de mensagens** — toda saída para o WhatsApp passa por `message_outbox` com idempotência, retry e auditoria.
4. **JWT com rotação de refresh token** — revogação encadeada em caso de reuso detectado.
5. **Timezone** — usa o timezone do profissional com fallback para o timezone do tenant.
6. **Google Calendar** — integração opcional; agenda interna é o padrão.

---

## Segurança — regra de ouro

```
NUNCA commite .env, .env.local ou qualquer arquivo com segredos reais.
Os únicos arquivos de variáveis que vão ao Git são os .env.example.
```

Se você suspeitar que um segredo foi exposto, consulte `CREDENCIAIS_ROTACAO.md` e siga o checklist imediatamente.

Para gerar segredos seguros:

```bash
# JWT_SECRET (64 chars base64)
openssl rand -base64 64

# POSTGRES_PASSWORD / REDIS_PASSWORD (32 chars base64)
openssl rand -base64 32

# N8N_ENCRYPTION_KEY (32 chars hex)
openssl rand -hex 16
```

---

## Comandos úteis

Veja a seção [Operações do dia a dia](#operações-do-dia-a-dia) para a lista completa.

---

## Pipeline de CI e qualidade

O pipeline roda automaticamente em **push/PR** para `main` e `develop` via GitHub Actions (`.github/workflows/ci.yml`).

### Jobs


| Job        | O que valida                                           |
| ---------- | ------------------------------------------------------ |
| `api`      | typecheck · lint · test:unit · test integração · build |
| `web`      | lint · typecheck · test smoke · build Vite             |
| `security` | `npm audit --audit-level=high` em ambos os pacotes     |


> O CI **falha imediatamente** se typecheck, testes ou build falharem em qualquer job.

---

### Executar os mesmos comandos do CI localmente

#### API

```bash
cd apps/api

# 1. Instalar dependências (necessário após alterar package.json)
npm install

# 2. TypeScript — verificação de tipos
npm run typecheck

# 3. ESLint — lint
npm run lint

# 4. Testes unitários (sem banco, rápido)
npm run test:unit

# 5. Testes de integração (requer PostgreSQL + Redis rodando)
npm test

# 6. Testes com cobertura
npm run test:coverage

# 7. Build
npm run build
```

#### Web

```bash
cd apps/web

# 1. Instalar dependências (necessário após alterar package.json)
npm install

# 2. ESLint — lint
npm run lint

# 3. TypeScript — verificação de tipos
npm run typecheck

# 4. Testes smoke (utils — sem banco, sem DOM)
npm test

# 5. Build Vite
npm run build
```

---

### Limitações conhecidas (P0-03)


| #   | Limitação                                                                                                                                                                                                              | Como resolver                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | `eslint` e `typescript-eslint` foram adicionados às `devDependencies` da API mas o `package-lock.json` ainda não foi atualizado. O step `npm install` no CI regenera o lock, mas o ideal é commitar o lock atualizado. | Execute `cd apps/api && npm install` localmente e commite o `package-lock.json` gerado.                    |
| 2   | `vitest` e `@vitest/coverage-v8` foram adicionados às `devDependencies` do web mas o `package-lock.json` do web ainda não foi atualizado.                                                                              | Execute `cd apps/web && npm install` localmente e commite o `package-lock.json` gerado.                    |
| 3   | O web não possui testes de componente React (precisam de jsdom/happy-dom).                                                                                                                                             | Adicione `@vitest/browser` ou `jsdom` e crie testes de componente separados quando houver cobertura de UI. |
| 4   | Os testes de integração da API requerem banco PostgreSQL e Redis reais. Em máquinas sem Docker, rode `docker compose -f docker-compose.api-only.yml up -d` antes de `npm test`.                                        | —                                                                                                          |


