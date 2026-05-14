# Evidência operacional — stack local (engenharia)

Data de colheita: **2026-05-09**. Ambiente: Docker Compose na máquina de desenvolvimento (não substitui relatório formal do QA humano).

## 1) `docker compose config`

Executado com sucesso (YAML válido; serviços `api`, `postgres`, `redis`, `web`, `n8n` resolvidos).

## 2) `docker compose ps`

Todos os serviços reportados como **healthy**:

| NAME | STATUS |
|------|--------|
| barbearia-api | Up (healthy), porta 3000 |
| barbearia-web | Up (healthy), porta 3001 |
| barbearia-postgres | Up (healthy) |
| barbearia-redis | Up (healthy) |
| barbearia-n8n | Up (healthy), host 5679 → 5678 |

> **Nota PO:** não foi executado `docker compose down -v` nesta colheita para não apagar o volume de um ambiente partilhado; para aceite final, o QA deve anexar saída de **`down -v` → `up -d --build` → `ps`** no ambiente dedicado.

## 3) Health HTTP

| URL | Status |
|-----|--------|
| `GET http://localhost:3000/health` | **200** |
| `GET http://localhost:3000/database/health` | **200** |
| `GET http://localhost:3000/health/ready` | **200** |

## 4) Tenants — RBAC (API real, sem colar tokens)

Após aplicar `100_platform_admin_qa_seed.sql` na base em execução:

| Cenário | Resultado |
|---------|-------------|
| `POST /auth/login` `platform.admin@demo.local` (sem `tenant_id`) | **200**; `user.role` = `platform_admin`, `user.tenant_id` = `null` |
| `GET /api/v1/tenants` com Bearer do platform + `x-tenant-id: 00000000-0000-0000-0000-000000000001` | **200** (corpo JSON com lista) |
| `GET /api/v1/tenants` com Bearer do `admin@demo.local` (`tenant_owner`) | **403** |

## 5) Pendências para aceite funcional final (PO)

- Prints do portal: login, dashboard (No-show), fluxos criar / confirmar / remarcar / cancelar, refresh.
- `docker compose down -v` + subida limpa com captura de logs.
- n8n: URL aberta + fluxo mínimo documentado.
