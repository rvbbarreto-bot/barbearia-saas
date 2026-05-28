# Correção — Login 502 Bad Gateway (stack local Docker)

**Data:** 2026-05-18  
**Sintoma:** UI `localhost:3001/login` → `POST /auth/login` → **502** (nginx), mensagem *"Erro ao conectar"*.

---

## 1. Causa raiz

| Camada | Diagnóstico |
|--------|-------------|
| **Browser** | `POST http://localhost:3001/auth/login` → 502, `Server: nginx` |
| **Proxy** | `apps/web/nginx.conf` encaminha `/auth/` → `http://api:3000` (correto) |
| **API** | Container `barbearia-api` em crash loop / unhealthy |
| **Infra** | **`barbearia-postgres` e `barbearia-redis` parados** (`Exited`) |

Sem Postgres/Redis, a API:

1. Não passa no healthcheck de dependências de forma estável.
2. Workers de background (`notification-jobs`, `hold-expiry`, `pix-expiry`, `lateness`) faziam `pool.query` **sem try/catch** no início do sweep → **exceção não tratada** → processo Node encerrava.
3. Nginx devolvia **502** porque o upstream `api:3000` não respondia.

Logs típicos:

```text
Error: getaddrinfo ENOTFOUND postgres
Error: getaddrinfo EAI_AGAIN redis
```

---

## 2. Correção aplicada

### 2.1 Operacional (imediata)

Subir dependências e recriar API:

```bash
docker compose up -d postgres redis
# aguardar healthy
docker compose up -d --build api
docker compose ps   # postgres, redis, api healthy; web healthy
```

### 2.2 Código (resiliência)

- Novo helper: `apps/api/src/infra/workers/safe-sweep.ts`
- Sweeps envolvidos passam por `runSweepSafely()`:
  - `notificationJobs/worker.ts`
  - `appointments/holds.worker.ts`
  - `appointments/lateness.service.ts`
  - `payments/pix.worker.ts`
- Teste unitário: `apps/api/src/infra/workers/safe-sweep.test.ts`

Com isso, indisponibilidade temporária de DB **não derruba** o processo HTTP da API.

---

## 3. Evidências de teste (fábrica)

### 3.1 Estado dos containers (pós-correção)

```
barbearia-postgres   Up (healthy)   :5432
barbearia-redis      Up (healthy)   :6380
barbearia-api        Up (healthy)   :3000
barbearia-web        Up (healthy)   :3001
```

### 3.2 Health API

```http
GET http://localhost:3000/health/ready
→ 200 {"status":"ok"}
```

### 3.3 Login (mesmo caminho da UI — via nginx :3001)

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/auth/login" -Method POST `
  -ContentType "application/json" `
  -Body (@{ email = "admin@demo.local"; password = "admin12345" } | ConvertTo-Json)
```

**Resultado:** `200` — `access_token`, `refresh_token`, `user.role = tenant_owner`, `user.tenant_id = 00000000-0000-0000-0000-000000000001`.

### 3.4 Teste unitário

```bash
cd apps/api && npm run test:unit -- src/infra/workers/safe-sweep.test.ts
# 1 passed
```

---

## 4. Credenciais demo (local)

| Campo | Valor |
|-------|--------|
| URL | http://localhost:3001/login |
| E-mail | `admin@demo.local` |
| Senha | `admin12345` (seed `database/seeds/001_demo.sql`) |
| Tenant (opcional) | vazio — JWT já traz `tenant_id` demo |

---

## 5. Checklist PO/QA

- [ ] `docker compose ps` — postgres, redis, api, web **healthy**
- [ ] Login na UI sem 502
- [ ] Após `docker compose stop postgres`, API **permanece up** (só workers logam erro; login pode falhar até DB voltar)

---

## 6. Parecer fábrica

**Corrigido** para stack local padrão: subir postgres+redis e rebuild API.  
**Melhoria de código** evita crash da API quando DB cai, reduzindo 502 intermitente no nginx.
