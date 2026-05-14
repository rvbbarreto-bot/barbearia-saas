# Relatório formal de entrega — Cenário A (platform vs tenant)

**Versão:** 2026-05-10 · **Componente:** API (`apps/api`)

---

## 1. Resumo executivo

| Critério PO | Estado |
|-------------|--------|
| `GET /api/v1/tenants` com `platform_admin` **sem** `x-tenant-id` → **200** | **Corrigido no código-fonte** |
| `GET /api/v1/tenants` com `tenant_owner` → **403** | **Mantido** |
| `GET /api/v1/tenants/current` com `tenant_owner` → **200** | **Mantido** |
| Rotas tenant-scoped exigem contexto (`401` `TENANT_REQUIRED` se ausente) | **Mantido** |
| Documentação OpenAPI / Postman / QA_PACKAGE | **Atualizado** |
| Testes automatizados (unit + integração Fastify mock) | **100% aprovados** no comando oficial |
| Cobertura Vitest (ficheiros `tenant.ts` + `tenants/service.ts`) | **≥ 78%** (última corrida: **>97%** statements) |

**Nota operacional:** Se o ambiente Docker ainda devolver **`TENANT_REQUIRED`** neste endpoint, é quase sempre **imagem da API desatualizada**. É **obrigatório** reconstruir e subir de novo: `docker compose build api` e `docker compose up -d api` (ou stack completa), para que o `dist/` no contentor inclua o bypass em `tenantMiddleware`.

Após recriar contentores Postgres, confirmar que **`DATABASE_URL` / `POSTGRES_*` no `.env`** coincidem com o utilizador e palavra-passe efetivos do contentor (senão a API falha health/auth antes mesmo do teste de tenants).

---

## 2. Causa raiz do `TENANT_REQUIRED` para `platform_admin`

O hook global **`tenantMiddleware`** (`server.ts`) aplicava a regra **“JWT.tenant_id ou header `x-tenant-id`”** a **todas** as rotas autenticadas. Para utilizadores **`platform_admin`** com **`tenant_id` null** e **`GET /api/v1/tenants`**, não havia tenant resolvido → **401** com corpo **`TENANT_REQUIRED`** (comportamento pensado para rotas **tenant-scoped**, não para listagem global).

Ou seja: **ordem/classificação incorreta** — rota de **plataforma** tratada pelo mesmo gate que rotas de **tenant**.

---

## 3. Correção implementada

**Ficheiro:** `apps/api/src/middlewares/tenant.ts`

- **`isPlatformTenantsCollectionRoute`**: apenas **`GET`** ou **`POST`** no path **`/api/v1/tenants`** (não inclui `/tenants/current` nem `/tenants/{id}`).
- Para **`role === 'platform_admin'`** nesse path: **não** exige tenant; `request.tenantId` fica **undefined**; resposta segue para **`requireRole('platform_admin')`** na rota.
- **`getEffectiveRequestPathname`**: usa `request.url` com fallback a **`request.raw.url`**, normalização de query e **leading slash**, para consistência atrás de proxies/clients.
- Mantém **403** `TENANT_MISMATCH` se existirem **JWT.tenant_id** e **`x-tenant-id`** **ambos** definidos e divergentes.

**Rotas tenant-scoped** (serviços, clientes, `/tenants/current`, etc.): **inalteradas** — continuam a precisar de contexto de tenant.

---

## 4. Ficheiros alterados (lista)

| Ficheiro | Alteração |
|----------|-----------|
| `apps/api/src/middlewares/tenant.ts` | Bypass platform + path efetivo |
| `apps/api/src/middlewares/tenant.test.ts` | Regressão + `tenant_owner` sem contexto |
| `apps/api/src/modules/tenants/tenants.routes.integration.test.ts` | `platform_admin` sem header; query string |
| `apps/api/src/modules/tenants/service.test.ts` | Cobertura serviço |
| `apps/api/vitest.config.ts` | Cobertura focada + limiar ≥78% |
| `apps/api/src/openapi/spec.ts` | `GET`/`POST /tenants` sem `tenantHeader` obrigatório |
| Postman / `QA_PACKAGE_BARBEARIA/*` / `docs/QA_AMBIENTE_LOCAL.md` | Comportamento oficial |
| `QA_PACKAGE_BARBEARIA/06_EVIDENCIAS/VERIFY_SCENARIO_A.ps1` | Script de verificação PO |

---

## 5. Regra final RBAC (resumo)

| Rota | Escopo | `x-tenant-id` |
|------|--------|----------------|
| `GET` / `POST /api/v1/tenants` | **Plataforma** (`platform_admin`) | **Não obrigatório** |
| Demais `/api/v1/*` | **Tenant** | **Obrigatório** se JWT não trouxer `tenant_id` utilizável |

---

## 6. Testes automatizados executados

```powershell
cd apps/api
npx vitest run --exclude 'src/**/*.integration.test.ts'
```

**Resultado:** todos os testes unitários **passam** (última execução: **128** testes).

**Integração (Fastify inject, tenants + middleware):**

```powershell
npx vitest run src/middlewares/tenant.test.ts src/modules/tenants/tenants.routes.integration.test.ts src/modules/tenants/service.test.ts
```

Inclui obrigatoriamente: **`platform_admin` + `GET /api/v1/tenants` sem `x-tenant-id` → 200**.

**Cobertura (âmbito configurado em `vitest.config.ts`):**

```powershell
npx vitest run --coverage --exclude 'src/**/*.integration.test.ts'
```

Última corrida agregada nos ficheiros incluídos: **≥ 78%** em todas as métricas (threshold cumprido).

**Integração com Postgres real (`*.integration.test.ts`):** depende de `DATABASE_URL` / rede Docker; não faz parte do gate local sem serviços.

---

## 7. Testes manuais / curl

Script reproduzível: **`QA_PACKAGE_BARBEARIA/06_EVIDENCIAS/VERIFY_SCENARIO_A.ps1`**

Passos manuais equivalentes estão em **`QA_PACKAGE_BARBEARIA/06_EVIDENCIAS/CURLS_TENANTS_QA.md`**.

**Antes de testar:** garantir API com **imagem reconstruída** após pull do código (senão o sintoma `TENANT_REQUIRED` mantém-se por bundle antigo).

---

## 8. Regra documentada: `platform_admin` em rota tenant-scoped sem contexto

Se **`tenant_id`** no JWT é **null** e **não** há **`x-tenant-id`**, o **`tenantMiddleware`** responde **401** `TENANT_REQUIRED`. Isto aplica-se a **`GET /api/v1/services`**, **`/me`**, etc. É o comportamento esperado; a listagem global **`GET /api/v1/tenants`** é a **exceção** explícita acima.

---

## 9. Riscos e pendências

| Item | Gravidade |
|------|-----------|
| Ambiente Docker sem **rebuild** da imagem `api` após correção | **Alta** — falsos negativos no teste 6 PO |
| Integração DB completa sem stack Docker | **Média** — testes `*.integration.test.ts` ignorados no gate local |
| Aceite PO portal / n8n / evidências `down -v` | **Bloqueante** para “go-live” funcional global (fora deste documento) |

---

## 10. Parecer final da fábrica

Com o **código atual no repositório**, testes automatizados a **passar 100%** no âmbito definido e cobertura **≥ 78%** nos módulos configurados:

**APTO PARA QA** — **Cenário A** (RBAC `GET /api/v1/tenants` sem `x-tenant-id` para `platform_admin`), desde que o **contentor da API seja reconstruído** antes da validação manual do PO.
