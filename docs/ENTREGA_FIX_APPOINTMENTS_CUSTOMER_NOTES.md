# Relatório técnico — correção GET /api/v1/appointments (column c.notes does not exist)

**Data:** 2026-05-13  
**Workflow QA bloqueado:** SaaS Barbearia - QA - 02B Auth Login Protected Endpoints  
**Status fábrica:** Aprovado internamente — APTO PARA QA (retomada do workflow 02B)

---

## 1. Resumo executivo

| Item | Detalhe |
|------|---------|
| **Correção** | Removida referência inválida `c.notes` nas queries de listagem e detalhe de agendamentos |
| **Causa raiz** | Query SQL referenciava coluna inexistente em `customers`; `notes` existe apenas em `appointments` |
| **Endpoint impactado** | `GET /api/v1/appointments` (e `GET /api/v1/appointments/:id` pelo mesmo SQL) |
| **Opção aplicada** | **Opção B** — ajuste de query (sem nova migration) |
| **Status final** | HTTP **200** em ambiente Docker com API reconstruída |

---

## 2. Causa raiz

### Por que a API referenciava `c.notes`

Em `listAppointments` e `getAppointmentById` (`apps/api/src/modules/appointments/service.ts`), o SELECT incluía:

```sql
c.notes AS customer_notes
```

com alias `c` = tabela `customers`.

### Schema real

Em `database/migrations/001_init.sql`:

- **`customers`**: `id`, `tenant_id`, `name`, `phone`, `email`, flags WhatsApp, timestamps — **sem coluna `notes`**
- **`appointments`**: possui `notes text` (notas do agendamento, já expostas via `a.*`)

Não há migration que adicione `notes` em `customers`. Restrições operacionais de cliente estão em `customer_restrictions` (migration `015`), já expostas na query como `customer_requires_deposit` e `customer_manual_booking_only`.

### Classificação

**Falha de query / desalinhamento código ↔ schema** (não migration ausente para `customers.notes`).

### Ambientes afetados

Qualquer ambiente com migrations aplicadas desde o zero — incluindo `docker compose down -v` + `up`. O erro **não** depende de seed; ocorre na primeira listagem de appointments.

---

## 3. Arquivos alterados

| Arquivo | Finalidade |
|---------|------------|
| `apps/api/src/modules/appointments/service.ts` | Substituído `c.notes AS customer_notes` por `NULL::text AS customer_notes` em `listAppointments` e `getAppointmentById` |
| `apps/api/src/modules/appointments/appointments-list-query.test.ts` | Testes de regressão: SQL não referencia `c.notes`; mantém campo `customer_notes` no shape da resposta |

**Sem alteração** em migrations, contratos OpenAPI, Postman, auth, tenant middleware, n8n ou workers.

---

## 4. Migrations

**Nenhuma migration nova.**

Justificativa: `customers.notes` não faz parte do domínio versionado. Notas de agendamento continuam em `appointments.notes` (`a.notes` via `a.*`). Observações operacionais de cliente usam `customer_restrictions` e flags já retornadas na listagem.

---

## 5. Testes executados

| Comando | Resultado |
|---------|-----------|
| `npm run test:unit` (apps/api) | **130** testes, **0** falhas |
| `npm run typecheck` (apps/api) | OK |
| `npm run lint` (apps/api) | 0 erros (warnings pré-existentes) |
| `npm run build` (via Docker build api) | OK |
| `docker compose build api` + `docker compose up -d api` | Imagem reconstruída, container **healthy** |

Testes de integração com Postgres (`*.integration.test.ts`) não foram obrigatórios nesta rodada local (requerem `DATABASE_URL` no host); o smoke HTTP abaixo valida o endpoint real.

---

## 6. Evidências mínimas (ambiente local)

### `docker compose ps`

Todos **healthy**: api, n8n, postgres, redis, web.

### Health

- `GET http://localhost:3000/health` → **200**
- `GET http://localhost:3000/health/ready` → **200**

### Auth

- `POST /auth/login` — `admin@demo.local` / `admin12345` → **200**, `access_token` gerado (mascarado)

### Endpoints protegidos (tenant `00000000-0000-0000-0000-000000000001`, header `x-tenant-id`)

| Endpoint | HTTP |
|----------|------|
| `GET /api/v1/services` | **200** |
| `GET /api/v1/professionals` | **200** |
| `GET /api/v1/customers` | **200** |
| `GET /api/v1/appointments` | **200** |

Corpo de appointments (sem seed de agendamentos):

```json
{"data":[],"total":0,"page":1,"limit":20}
```

---

## 7. Risco de regressão

| Área | Risco | Mitigação |
|------|-------|-----------|
| **Customers** | Nenhum | Não altera tabela nem rotas de customers |
| **Appointments create/update** | Baixo | Apenas SELECT de list/detail |
| **n8n / workers / outbox** | Nenhum | Sem alteração |
| **Multi-tenant** | Nenhum | Filtros `a.tenant_id` inalterados |
| **Portal web** | Baixo | `customer_notes` opcional no tipo; alertas por texto em notas deixam de disparar, mas flags `customer_manual_booking_only` / `customer_requires_deposit` cobrem o caso estruturado |

Testes que comprovam ausência de regressão na query: `appointments-list-query.test.ts`; suite unitária completa **130/130**.

---

## 8. Próximos pontos de atenção

1. Se o produto exigir **notas livres por cliente** no futuro, criar migration `ALTER TABLE customers ADD COLUMN notes text` e passar a popular `customer_notes` na query (Opção A) — hoje não há requisito de domínio nem API de escrita.
2. Revisar `apps/web/src/features/agenda/appointmentAlerts.ts`: fallbacks por substring em `customer_notes` são redundantes com `customer_restrictions` quando os dados vêm estruturados.
3. Após `git pull`, QA deve **`docker compose build api`** antes de repetir o workflow 02B.

---

## 9. Status final da entrega

| Campo | Valor |
|-------|-------|
| **Parecer fábrica** | **APTO PARA QA** (retomada workflow 02B) |
| **Branch** | `master` (working tree local; commit pendente de push pelo time) |
| **Commit base** | `3c1cfa0` + alterações desta correção |

**Critérios PO atendidos nesta correção:**

1. `GET /api/v1/appointments` deixa de retornar HTTP 500  
2. Erro `column c.notes does not exist` eliminado  
3. Correção versionada no repositório (código + teste)  
4. Migrations inalteradas — banco limpo continua consistente  
5. Smoke Docker com API reconstruída  
6. Endpoints já aprovados no workflow 02B mantêm **200**  
7. Testes automatizados unitários **100%** passando  
