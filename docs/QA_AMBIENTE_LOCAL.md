# Ambiente local integrado — QA (Barbearia SaaS)

Este documento é a referência oficial para o time de QA (e DevOps) reproduzir **portal + API + PostgreSQL + Redis + n8n** sem tentativa e erro.

---

## 1. Resumo das URLs (oficiais)


| Serviço                                      | Modo Docker Compose (`docker compose up`)                                   | Modo desenvolvimento npm                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Portal web**                               | `http://localhost:3001` (NGINX estático no container `web`)                 | `http://localhost:5173` (Vite; se a porta estiver ocupada, o Vite usa a seguinte, ex. `5174`) |
| **API**                                      | `http://localhost:3000`                                                     | `http://localhost:3000`                                                                       |
| **GET /health**                              | `http://localhost:3000/health`                                              | idem                                                                                          |
| **GET /health/ready** (Postgres **e** Redis) | `http://localhost:3000/health/ready`                                        | idem                                                                                          |
| **GET /database/health** (só Postgres)       | `http://localhost:3000/database/health`                                     | idem                                                                                          |
| **Swagger / OpenAPI UI**                     | `http://localhost:3000/docs` (desativado se `NODE_ENV=production`)          | idem                                                                                          |
| **n8n**                                      | `http://localhost:5679` — mapeamento `**5679` (host) → `5678` (container)** | Não aplicável sem Docker                                                                      |
| **Evolution API** (opcional, PS-08.4)        | `http://localhost:8081` — `docker compose --profile evolution` + `qa-evolution-up.ps1` | Não aplicável sem profile evolution                                                           |


**Esclarecimento importante:** `localhost:3001` **no Docker** é o **portal**, não a API. A API é sempre `**3000`** neste projeto.

---

## 2. Pré-requisitos

- Docker Desktop + Docker Compose v2 **ou**
- Node.js 22+ e npm 10+ **para** desenvolvimento só com npm (é necessário Postgres e Redis acessíveis).

---

## 3. Variáveis de ambiente — qual ficheiro?


| Ficheiro                   | Uso                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**.env` na raiz do repo** | Docker Compose (`docker-compose.yml` usa `env_file: .env` na API) e referência principal para a stack.                                                                                            |
| `**apps/web/.env.local`**  | Opcional — `VITE_DEFAULT_TENANT_ID`, feature flags. O frontend **não** usa `VITE_API_URL`; em dev o Vite faz proxy de `/api`, `/auth`, `/health` para `http://localhost:3000` (`vite.config.ts`). |


**Nunca commite** `.env` nem `.env.local`.

Copiar modelo:

```powershell
cd <raiz-do-repo-barbearia-saas>
Copy-Item .env.example .env
# Editar .env — substituir todos os <PLACEHOLDER> ou usar valores de exemplo seguros indicados no próprio .env.example
```

---

## 4. PostgreSQL — senha no `.env` vs volume já criado

O Postgres **só define a password no primeiro inicialização** do volume (`postgres_data`).  
Se alterar `POSTGRES_PASSWORD` no `.env` depois disso, o container pode falhar com `password authentication failed for user ...` até alinhar:

**Reset oficial do ambiente local (apaga dados Postgres/Redis/n8n locais):**

```powershell
docker compose down -v
docker compose up -d --build
```

> **Aviso:** `-v` remove volumes nomeados — perde dados de desenvolvimento nessa máquina.

---

## 5. Login na API — `tenant_id` opcional

`POST /auth/login` aceita apenas `{ "email", "password" }`. Se existir **um único** utilizador ativo com esse e-mail, o tenant é inferido. Se existirem **vários** (multi-tenant), a API devolve **400** `TENANT_REQUIRED` e o utilizador deve indicar o UUID em **Tenant (opcional)** no portal.

O front-end **não envia** a chave `tenant_id` quando o campo está vazio (em vez de `""`).

---

## 5.1 Tenants na API — listagem vs tenant atual

| Rota | Quem pode chamar | Notas |
|------|------------------|--------|
| `GET /api/v1/tenants` (e `POST /api/v1/tenants`) | **`platform_admin`** | Lista / cria tenants globalmente. **Não exige** `x-tenant-id`. **`tenant_owner`** recebe **403**. |
| `GET /api/v1/tenants/current` | **`tenant_admin`** ou superior (inclui **`tenant_owner`**) | Devolve o tenant do contexto (`JWT` + `x-tenant-id`). Uso recomendado para QA com `admin@demo.local`. |
| `GET /api/v1/tenants/{tenantId}` | Mínimo **`tenant_admin`**; o UUID na rota deve ser o do token (salvo `platform_admin`) | Mesmo payload que `/current` quando o UUID coincide. |

**Seed QA — utilizador `platform_admin`:** `platform.admin@demo.local` / `admin12345` (ver `100_platform_admin_qa_seed.sql` e `MASSA_DE_DADOS.md`). **`GET`/`POST /api/v1/tenants`** não precisam de `x-tenant-id`. Para **rotas tenant-scoped** com este utilizador, enviar **`x-tenant-id`** (senão **401** `TENANT_REQUIRED`).

| Comportamento | Resultado HTTP esperado |
|---------------|-------------------------|
| `tenant_owner` + `GET /api/v1/tenants` | **403** |
| `platform_admin` + `GET /api/v1/tenants` (sem `x-tenant-id`) | **200** |
| `platform_admin` + `GET /api/v1/tenants` (com `x-tenant-id`, opcional) | **200** |
| `tenant_owner` + `GET /api/v1/tenants/current` | **200** (próprio tenant) |
| `tenant_owner` + `GET /api/v1/tenants/{outroUuid}` | **403** |

---

## 6. Ordem recomendada de execução

### Opção A — Stack completa com Docker (recomendada para QA integrado)

1. Copiar `.env.example` → `.env` e preencher variáveis **obrigatórias** (ver secção 7).
2. Na raiz: `docker compose config` (validação).
3. Na raiz: `docker compose up -d --build`.
4. Verificar: `docker compose ps` (serviços `healthy`).
5. Testar URLs da tabela na secção 1.
6. Abrir n8n em `http://localhost:5679`, importar workflows em `n8n/workflows/` (ver `QA_PACKAGE_BARBEARIA/03_N8N_WORKFLOWS/`).

**Nota:** Na primeira subida, o Postgres pode aplicar scripts em `database/migrations` via volume `docker-entrypoint-initdb.d` apenas em volume **vazio**. Se já existir volume antigo com schema desatualizado, consulte `README.md` / `migrate.sh` para alinhar migrações.

### Compose vs desenvolvimento npm (`DATABASE_URL`)

O serviço `api` no `docker-compose.yml` define `**DATABASE_URL` e `REDIS_URL` via `environment`**, construídas com os hosts internos `postgres` e `redis`. Assim, mesmo que o seu `.env` na máquina aponte para `localhost` (útil para `npm run dev` na API), o container da API **continua a usar a base correta dentro da rede Docker** — evitando falhas dos workers e healthcheck.

### Resolução de conflitos de nome de container

Se `docker compose up` falhar com *Conflict … container name "/barbearia-postgres"*, há um contentor órfão. Na raiz do projeto:

```powershell
docker rm -f barbearia-postgres
docker compose down
docker compose up -d --build
```

### Pedidos HTTP no PowerShell

Use `curl.exe` (não o alias `curl` → `Invoke-WebRequest`), por exemplo:  
`curl.exe -s http://localhost:3000/health`

### Opção B — Portal e API em npm (hot reload)

1. Subir Postgres + Redis (por exemplo só estes serviços via Compose, ou instalação local).
2. Configurar `.env` na **raiz** com `DATABASE_URL` e `REDIS_URL` apontando para **localhost** (atenção: no Compose padrão Redis expõe `**6380:6379`** → usar porta **6380** no host).
3. Terminal 1 — API:

```powershell
cd apps\api
npm install
npm run dev
```

1. Terminal 2 — Portal:

```powershell
cd apps\web
npm install
npm run dev
```

1. Abrir o URL que o Vite imprimir (tipicamente `http://localhost:5173`).

### Raiz do monorepo — scripts npm úteis

Na **raiz** existe agora `package.json` com atalhos:

```powershell
npm run dev          # mensagem a orientar para dev:web / dev:api
npm run dev:web
npm run dev:api
npm run compose:config
npm run compose:up
```

---

## 7. Variáveis obrigatórias (checklist)

### Para a API subir (`apps/api` / `env.ts`)


| Variável       | Regra                                                          |
| -------------- | -------------------------------------------------------------- |
| `DATABASE_URL` | Obrigatória — URL Postgres (`postgresql://` ou `postgres://`). |
| `JWT_SECRET`   | Obrigatória — mínimo **32** caracteres.                        |
| `REDIS_URL`    | Obrigatória — URL Redis (com password se Redis exige AUTH).    |
| `PORT`         | Opcional — default **3000**.                                   |
| `API_PORT`     | Opcional — se definida e `PORT` vazia, equivale a `PORT`.      |


### Para `docker compose` interpretar o ficheiro (sem erro `:?`)

O `docker-compose.yml` exige valores definidos para interpolação em **postgres**, **redis** e **n8n**:


| Variável                  | Finalidade                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`       | Password do utilizador Postgres do stack.                                                                                   |
| `REDIS_PASSWORD`          | `requirepass` do Redis.                                                                                                     |
| `JWT_SECRET`              | API (via `.env`).                                                                                                           |
| `DATABASE_URL`            | API — dentro do Compose use host `postgres`, porta `5432`.                                                                  |
| `REDIS_URL`               | API — dentro do Compose use host `redis`, porta `6379`, password acima.                                                     |
| `N8N_ENCRYPTION_KEY`      | Instância n8n.                                                                                                              |
| `N8N_BASIC_AUTH_PASSWORD` | Login UI n8n.                                                                                                               |
| `N8N_WEBHOOK_TOKEN`       | Enviado aos workflows; **default no compose** igual ao seed demo (`demo_webhook_token_change_me`) se não definir no `.env`. |


### Integrações opcionais (fluxos WhatsApp / IA)


| Variável                                  | Quando                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` | Opcionais na API — apenas se integração Evolution estiver configurada. |
| `OPENAI_API_KEY`                          | Opcional — só para nós de IA no n8n (credencial pode ser só no n8n).   |


---

## 8. Healthchecks — interpretação

- `**/health`** — processo vivo; não testa base nem Redis.
- `**/health/ready**` — `SELECT 1` em Postgres **e** `PING` em Redis; **503** se algum falhar.
- `**/database/health`** — apenas Postgres (útil para diagnóstico rápido).

Exemplo (PowerShell):

```powershell
Invoke-WebRequest -Uri http://localhost:3000/health -UseBasicParsing
Invoke-WebRequest -Uri http://localhost:3000/database/health -UseBasicParsing
Invoke-WebRequest -Uri http://localhost:3000/health/ready -UseBasicParsing
```

---

## 9. Front-end ↔ API (CORS e URL)

- Em desenvolvimento, `apps/web/src/lib/api.ts` usa `baseURL: '/'`.
- O Vite encaminha `/api`, `/auth`, `/health` para `http://localhost:3000`.
- `**VITE_API_URL` não é utilizado** pelo cliente atual — não é esperado erro por essa variável.
- `CORS_ORIGIN` na API deve incluir as origens do portal em dev **e** no Compose (ex.: `http://localhost:5173`, `http://localhost:5174`, `http://localhost:3001`). O `.env.example` lista várias origens separadas por vírgula.

---

## 10. Migrações e massa de dados

- Scripts SQL: `database/migrations/` (aplicados na primeira inicialização do volume Postgres ou via `./migrate.sh`).
- **Seed QA automático no Docker:** `database/migrations/099_demo_seed_qa.sql` insere tenant demo, admin, profissionais e serviços quando o volume está vazio.
- Seeds manuais / referência: `database/seeds/`.
- Detalhes e credenciais: `README.md`, `QA_PACKAGE_BARBEARIA/04_MASSA_DE_DADOS/`.

---

## 11. Pacote QA (Postman + n8n)

Estrutura: `QA_PACKAGE_BARBEARIA/` na raiz — coleções Postman, instruções n8n e cenários.

---

## 12. Segurança

- `.env.example` e artefactos QA devem conter apenas **placeholders** ou valores **claramente fictícios** (`change-me-`*, `demo_webhook_token_change_me`).
- Scan recomendado: `docker run --rm -v ${PWD}:/repo ghcr.io/gitleaks/gitleaks:v8.24.3 detect --source=/repo --verbose --redact` (na raiz).

---

## Declaração de âmbito

Ambiente **DEV/QA local** — não representa produção, piloto comercial nem GA.