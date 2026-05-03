# SaaS Barbearia — Especificação Técnica Detalhada
## Documento de Requisitos Baixo Nível

**Versão:** 1.0  
**Data:** 29/04/2026  
**Classificação:** Técnico / Engenharia  
**Autores:** Engenharia de Software, Requisitos e DevOps — Exeq

---

## Índice

1. [Stack Tecnológica](#1-stack-tecnológica)
2. [Modelo de Dados — 21 Tabelas](#2-modelo-de-dados)
3. [Autenticação e Sessões](#3-autenticação-e-sessões)
4. [Controle de Acesso — RBAC](#4-controle-de-acesso--rbac)
5. [API REST — Endpoints](#5-api-rest--endpoints)
6. [Engine de Disponibilidade](#6-engine-de-disponibilidade)
7. [Integração WhatsApp](#7-integração-whatsapp)
8. [Outbox — Envio Assíncrono](#8-outbox--envio-assíncrono)
9. [Row Level Security — RLS](#9-row-level-security--rls)
10. [Requisitos Não-Funcionais](#10-requisitos-não-funcionais)
11. [Códigos de Erro](#11-códigos-de-erro)
12. [Variáveis de Ambiente](#12-variáveis-de-ambiente)
13. [Infra e Deploy](#13-infra-e-deploy)
14. [Requisitos de Qualidade](#14-requisitos-de-qualidade)

---

## 1. Stack Tecnológica

| Camada | Tecnologia | Versão | Justificativa |
|---|---|---|---|
| Runtime | Node.js | 22 LTS | LTS, ESM nativo, performance |
| Framework HTTP | Fastify | 5.x | ~3× mais rápido que Express |
| Linguagem | TypeScript | 5.x | Tipagem estática, segurança |
| ORM/Queries | pg (node-postgres) | 8.x | SQL direto, sem abstração |
| Validação | Zod | 4.x | Schema-first, type-safe |
| Banco de dados | PostgreSQL | 16-alpine | EXCLUDE GIST, RLS, JSONB |
| Cache/Locks | Redis | 7-alpine | Pub/sub, locks distribuídos |
| Automação | n8n | 1.91.3 | Self-hosted, sem vendor lock |
| WhatsApp | Evolution API | latest | Open-source, multi-instância |
| Hashing | bcryptjs | 2.x | Senhas, rounds=12 |
| Auth | @fastify/jwt | — | HS256, access + refresh |
| Criptografia | Node:crypto | built-in | HMAC-SHA256, UUID |
| Containerização | Docker + Compose | 24+ | Multi-stage build |
| CI/CD | GitHub Actions | — | Build, lint, test, audit |

---

## 2. Modelo de Dados

### 2.1 Diagrama de Entidades (ERD simplificado)

```
tenants ──────┬──── users
              ├──── customers ──── consents
              ├──── professionals ─┬── professional_services ──── services
              │                    ├── business_hours
              │                    ├── professional_time_off
              │                    └── professional_recurring_time_off
              ├──── appointments ──── appointment_events
              ├──── calendar_blocks
              ├──── messages ◀──── customers
              ├──── message_outbox
              ├──── webhook_events
              ├──── tenant_integrations
              ├──── user_sessions ──── users
              ├──── conversation_states ──── customers
              ├──── rules
              └──── audit_logs
```

### 2.2 Tabelas Detalhadas

#### `tenants`
| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() | Identificador único |
| legal_name | text | NOT NULL | Razão social |
| trade_name | text | NOT NULL | Nome fantasia |
| slug | citext | UNIQUE (quando não nulo) | URL-friendly identifier |
| document | text | — | CNPJ/CPF |
| contact_email | citext | — | E-mail de contato |
| contact_phone | text | — | Telefone de contato |
| plan_code | text | NOT NULL DEFAULT 'trial' | Código do plano |
| plan_limits | jsonb | NOT NULL DEFAULT '{}' | Limites do plano |
| status | tenant_status | NOT NULL DEFAULT 'trial' | trial/active/suspended/cancelled |
| timezone | text | NOT NULL DEFAULT 'America/Sao_Paulo' | Fuso horário |
| webhook_token | text | NOT NULL | Token para validação de webhooks |
| created_at | timestamptz | NOT NULL DEFAULT now() | — |
| updated_at | timestamptz | NOT NULL DEFAULT now() | Auto-atualizado por trigger |

#### `users`
| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| id | uuid | PK | — |
| tenant_id | uuid | FK → tenants | NULL = platform_admin |
| name | text | NOT NULL | — |
| email | citext | UNIQUE global + UNIQUE por tenant | — |
| password_hash | text | NOT NULL | Bcrypt rounds=12 |
| role | user_role | NOT NULL | Enum de 7 papéis |
| is_active | boolean | NOT NULL DEFAULT true | — |
| failed_login_count | integer | NOT NULL DEFAULT 0 | Tentativas falhadas |
| locked_until | timestamptz | — | Conta bloqueada até esta data |
| last_login_at | timestamptz | — | Último login bem-sucedido |
| password_changed_at | timestamptz | — | Última troca de senha |
| created_at | timestamptz | NOT NULL | — |
| updated_at | timestamptz | NOT NULL | Auto-atualizado |

#### `customers`
| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| id | uuid | PK | — |
| tenant_id | uuid | NOT NULL FK | Tenant obrigatório |
| name | text | — | Pode ser nulo (WhatsApp sem nome) |
| phone | text | NOT NULL, UNIQUE por tenant | — |
| email | citext | — | — |
| whatsapp_opt_in | boolean | NOT NULL DEFAULT false | Consentimento WhatsApp |
| whatsapp_opt_out | boolean | NOT NULL DEFAULT false | Revogação de consentimento |
| whatsapp_instance | varchar(120) | — | Instância Evolution usada |
| last_interaction_at | timestamptz | — | Última mensagem recebida |
| created_at | timestamptz | NOT NULL | — |
| updated_at | timestamptz | NOT NULL | — |

#### `appointments`
| Coluna | Tipo | Restrições | Descrição |
|---|---|---|---|
| id | uuid | PK | — |
| tenant_id | uuid | NOT NULL FK | — |
| customer_id | uuid | NOT NULL FK | — |
| professional_id | uuid | NOT NULL FK | — |
| service_id | uuid | FK (nullable) | — |
| starts_at | timestamptz | NOT NULL | — |
| ends_at | timestamptz | NOT NULL | — |
| period | tstzrange | GENERATED ALWAYS AS tstzrange(starts_at, ends_at, '[)') STORED | Usado no EXCLUDE GIST |
| status | appointment_status | NOT NULL DEFAULT 'draft' | draft/offered/confirmed/cancelled/completed/no_show |
| source | channel | NOT NULL DEFAULT 'whatsapp' | whatsapp/web/manual/api |
| notes | text | — | Observações |
| idempotency_key | text | NOT NULL, UNIQUE por tenant | Evita duplicatas |
| created_at | timestamptz | NOT NULL | — |
| updated_at | timestamptz | NOT NULL | — |
| **CONSTRAINT** | EXCLUDE USING gist | tenant_id=, professional_id=, period&& WHERE status IN ('confirmed','completed','offered') | Impede sobreposição |

#### `message_outbox`
| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK → tenants |
| channel | text | 'whatsapp' (padrão) |
| payload | jsonb | Corpo da mensagem |
| metadata | jsonb | instance_name, phone, etc. |
| status | text | pending/processing/sent/failed/dead |
| attempts | int | Tentativas realizadas |
| max_attempts | int | Limite (default 5) |
| last_error | text | Último erro capturado |
| idempotency_key | text | UNIQUE — evita envio duplicado |
| next_retry_at | timestamptz | Próximo horário de tentativa |
| sent_at | timestamptz | Quando foi enviado com sucesso |

#### `consents` (LGPD)
| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid | PK |
| tenant_id | uuid | FK |
| customer_id | uuid | FK → customers |
| channel | text | whatsapp/web/manual/api |
| purpose | text | transactional/marketing/recall |
| granted | boolean | true = consentiu, false = revogou |
| source | text | Origem do consentimento |
| revoked_at | timestamptz | Quando foi revogado |
| created_at | timestamptz | — |

---

## 3. Autenticação e Sessões

### 3.1 Fluxo de Login

```
POST /auth/login
Body: { email, password, tenant_id }

1. Valida existência do usuário no tenant
2. Verifica is_active = true
3. Verifica locked_until < now()   ← bloqueio por tentativas
4. Compara bcrypt (hash sempre começa com $2a$/$2b$/$2y$)
5. Se falhou: incrementa failed_login_count
   - failed_login_count >= AUTH_MAX_FAILED_ATTEMPTS (default 5)?
     → SET locked_until = now() + AUTH_LOCKOUT_MINUTES (default 15)
6. Se ok: SET failed_login_count = 0, last_login_at = now()
7. Gera access_token (JWT, exp = JWT_EXPIRES_IN = 15m)
8. Gera refresh_token (JWT, exp = JWT_REFRESH_EXPIRES_IN = 7d)
9. Armazena refresh JTI no Redis com TTL
10. Retorna { access_token, refresh_token, user }
```

### 3.2 Estrutura do JWT

```json
{
  "sub": "<user_id>",
  "jti": "<uuid>",
  "tenant_id": "<tenant_id>",
  "role": "manager",
  "email": "user@demo.local",
  "name": "Nome do Usuário",
  "token_type": "access",
  "iat": 1700000000,
  "exp": 1700000900
}
```

### 3.3 Refresh Token — Rotação Segura

```
POST /auth/refresh
Body: { refresh_token }

1. Verifica assinatura JWT
2. Verifica token_type = 'refresh'
3. Verifica JTI no Redis (ainda ativo?)
4. Detecta reuso:
   - JTI já usado → revoga TODA a cadeia (família de tokens)
   - Grava AUTH_REUSE_DETECTED no audit_log
5. Gera novo access_token + novo refresh_token
6. Invalida JTI anterior, ativa novo JTI
```

### 3.4 Reset de Senha

```
POST /auth/forgot-password
Body: { email, tenant_id }

→ Sempre retorna 202 (não revela se e-mail existe)
→ Token: randomBytes(32).toString('hex') = 64 chars hex
→ Armazenado: Redis key "pwreset:<token>" → "<userId>:<tenantId>"
→ TTL: 1800 segundos (30 minutos)

POST /auth/reset-password
Body: { token: string(64), password: string(min 8) }

1. Lê Redis → valida token
2. Atualiza password_hash com bcrypt rounds=12
3. Zera failed_login_count, locked_until
4. Atualiza password_changed_at
5. Deleta token do Redis
```

### 3.5 Revogação de Sessão (Logout)

```
POST /auth/logout

1. Revoga JTI do access_token no Redis (SET com TTL até exp)
2. Se enviado refresh_token no body:
   - Decodifica → revoga toda a cadeia (revokeRefreshChain)
3. Grava AUTH_LOGOUT no audit_log
```

---

## 4. Controle de Acesso — RBAC

### 4.1 Hierarquia de Papéis

| Nível | Role | Descrição |
|---|---|---|
| 7 | `platform_admin` | Acesso total (cross-tenant) |
| 6 | `tenant_owner` | Dono da barbearia |
| 5 | `tenant_admin` | Administrador |
| 4 | `manager` | Gerente |
| 3 | `professional` | Barbeiro |
| 2 | `attendant` | Atendente |
| 1 | `viewer` | Somente leitura |

### 4.2 Matriz de Permissões por Recurso

| Recurso | viewer | attendant | professional | manager | tenant_admin | tenant_owner |
|---|---|---|---|---|---|---|
| Ler agendamentos | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar agendamento | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cancelar agendamento | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Remarcar agendamento | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Concluir agendamento | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| No-show | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Criar calendar_block | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Gerenciar usuários | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Ver audit_logs | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Configurar tenant | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 4.3 Regra do Multi-tenancy no JWT

- O `tenant_id` é extraído **exclusivamente do JWT**
- O header `x-tenant-id` é **completamente ignorado** (anti-spoofing)
- Se o JWT não contiver `tenant_id` → 403 FORBIDDEN

---

## 5. API REST — Endpoints

**Base URL:** `https://api.dominio.com`  
**Prefixo autenticado:** `/api/v1`  
**Content-Type:** `application/json`  
**Auth:** `Authorization: Bearer <access_token>`

### 5.1 Autenticação (sem prefixo /api/v1)

| Método | Endpoint | Body | Auth | Resposta |
|---|---|---|---|---|
| POST | `/auth/login` | `{email, password, tenant_id}` | ❌ | `{access_token, refresh_token, user}` |
| POST | `/auth/refresh` | `{refresh_token}` | ❌ | `{access_token, refresh_token}` |
| POST | `/auth/logout` | `{refresh_token?}` | ✅ | 204 |
| POST | `/auth/forgot-password` | `{email, tenant_id}` | ❌ | 202 |
| POST | `/auth/reset-password` | `{token, password}` | ❌ | 200 |

### 5.2 Perfil do Usuário Logado

| Método | Endpoint | Auth | Role mínima | Resposta |
|---|---|---|---|---|
| GET | `/api/v1/me` | ✅ | viewer | Dados do usuário logado |

### 5.3 Tenants

| Método | Endpoint | Role mínima | Descrição |
|---|---|---|---|
| GET | `/api/v1/tenants` | platform_admin | Lista todos os tenants |
| GET | `/api/v1/tenants/:id` | tenant_admin | Detalhe do tenant |
| POST | `/api/v1/tenants` | platform_admin | Criar tenant |
| PATCH | `/api/v1/tenants/:id` | tenant_owner | Atualizar tenant |

### 5.4 Usuários

| Método | Endpoint | Role mínima | Descrição |
|---|---|---|---|
| GET | `/api/v1/users` | tenant_admin | Listar usuários (paginado) |
| GET | `/api/v1/users/:id` | tenant_admin | Detalhe |
| POST | `/api/v1/users` | tenant_admin | Criar usuário |
| PATCH | `/api/v1/users/:id` | tenant_admin | Atualizar |
| DELETE | `/api/v1/users/:id` | tenant_owner | Desativar |

### 5.5 Clientes

| Método | Endpoint | Role mínima | Descrição |
|---|---|---|---|
| GET | `/api/v1/customers` | attendant | Listar (paginado, com filtros) |
| GET | `/api/v1/customers/:id` | attendant | Detalhe |
| POST | `/api/v1/customers` | attendant | Criar |
| PATCH | `/api/v1/customers/:id` | attendant | Atualizar |
| GET | `/api/v1/customers/:id/consents` | attendant | Listar consentimentos |
| POST | `/api/v1/customers/:id/consents` | attendant | Registrar consentimento |
| PATCH | `/api/v1/customers/:id/consents/:cId/revoke` | attendant | Revogar consentimento |

### 5.6 Profissionais

| Método | Endpoint | Role mínima | Descrição |
|---|---|---|---|
| GET | `/api/v1/professionals` | viewer | Listar |
| GET | `/api/v1/professionals/:id` | viewer | Detalhe |
| POST | `/api/v1/professionals` | manager | Criar |
| PATCH | `/api/v1/professionals/:id` | manager | Atualizar |

### 5.7 Serviços

| Método | Endpoint | Role mínima | Descrição |
|---|---|---|---|
| GET | `/api/v1/services` | viewer | Listar |
| GET | `/api/v1/services/:id` | viewer | Detalhe |
| POST | `/api/v1/services` | manager | Criar |
| PATCH | `/api/v1/services/:id` | manager | Atualizar |

### 5.8 Agendamentos

| Método | Endpoint | Role mínima | Descrição |
|---|---|---|---|
| GET | `/api/v1/appointments` | viewer | Listar (paginado) |
| POST | `/api/v1/appointments` | attendant | Criar |
| PATCH | `/api/v1/appointments/:id/cancel` | attendant | Cancelar |
| PATCH | `/api/v1/appointments/:id/reschedule` | attendant | Remarcar |
| PATCH | `/api/v1/appointments/:id/complete` | professional | Concluir |
| PATCH | `/api/v1/appointments/:id/no-show` | manager | Registrar no-show |
| GET | `/api/v1/appointments/:id/history` | viewer | Histórico de eventos |

**Query params de GET /appointments:**
```
from=<ISO8601>     filtro de data inicio
to=<ISO8601>       filtro de data fim
status=confirmed   filtrar por status
professional_id=   filtrar por profissional
customer_id=       filtrar por cliente
page=1             página (default 1)
limit=20           itens por página (max 100)
```

**Resposta paginada (padrão):**
```json
{
  "data": [...],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

### 5.9 Disponibilidade

| Método | Endpoint | Auth | Descrição |
|---|---|---|---|
| GET | `/api/v1/availability` | ✅ viewer | Horários livres |

**Query params obrigatórios:**
```
professional_id=<uuid>    profissional
service_id=<uuid>         serviço (define duração)
date=2026-01-15           data (YYYY-MM-DD)
timezone=America/Sao_Paulo fuso do cliente
min_advance_minutes=30    mínimo de antecedência (default 30)
max_slots=30              máximo de slots (default 30, max 50)
```

### 5.10 Bloqueios de Agenda

| Método | Endpoint | Role mínima | Descrição |
|---|---|---|---|
| GET | `/api/v1/calendar-blocks` | viewer | Listar bloqueios |
| POST | `/api/v1/calendar-blocks` | manager | Criar bloqueio |
| PATCH | `/api/v1/calendar-blocks/:id` | manager | Atualizar |
| DELETE | `/api/v1/calendar-blocks/:id` | manager | Remover |

### 5.11 Horários, Folgas e Folgas Recorrentes

| Método | Endpoint | Role mínima | Descrição |
|---|---|---|---|
| GET/POST/PATCH/DELETE | `/api/v1/business-hours` | attendant | Horários de funcionamento |
| GET/POST/PATCH/DELETE | `/api/v1/professional-time-off` | attendant | Folgas pontuais |
| GET/POST/PATCH/DELETE | `/api/v1/professional-recurring-time-off` | attendant | Folgas recorrentes |

### 5.12 Auditoria

| Método | Endpoint | Role mínima | Descrição |
|---|---|---|---|
| GET | `/api/v1/audit-logs` | tenant_admin | Log de auditoria paginado |

**Query params:**
```
entity=appointment    filtrar por entidade
action=APPOINTMENT_CANCELLED    filtrar por ação
from=<ISO8601>        data início
to=<ISO8601>          data fim
actor_user_id=<uuid>  filtrar por ator
entity_id=<uuid>      filtrar por entidade específica
page=1 / limit=20
```

### 5.13 Webhooks (sem auth JWT)

| Método | Endpoint | Auth | Descrição |
|---|---|---|---|
| POST | `/webhooks/whatsapp/inbound` | HMAC / Token | Receber mensagem do WhatsApp |

**Headers obrigatórios:**
```
x-webhook-instance: <nome_da_instancia_evolution>
x-hub-signature-256: sha256=<hmac>   (se instância configurada com HMAC)
x-webhook-token: <token>              (fallback quando sem HMAC)
```

### 5.14 Healthcheck

| Método | Endpoint | Auth | Descrição |
|---|---|---|---|
| GET | `/health/live` | ❌ | API está no ar |
| GET | `/health/ready` | ❌ | API + DB + Redis OK |

---

## 6. Engine de Disponibilidade

### 6.1 Algoritmo de Slots Livres

```
ENTRADA: professional_id, service_id, date, timezone, min_advance_minutes, max_slots

1. Buscar horários de funcionamento (business_hours) para o weekday
2. Buscar folgas pontuais (professional_time_off) na data
3. Buscar folgas recorrentes (professional_recurring_time_off) para o weekday
4. Buscar bloqueios manuais (calendar_blocks) que sobrepõem a data
5. Buscar agendamentos existentes com status IN ('confirmed','completed','offered')
6. Calcular bloqueios consolidados (union de 4+5)
7. Gerar slots com base no slot_interval_minutes do business_hours
8. Remover slots que sobrepõem qualquer bloqueio
9. Remover slots com starts_at < now() + min_advance_minutes
10. Limitar resultado a max_slots
11. Retornar lista de { starts_at, ends_at }
```

### 6.2 Proteção Contra Condição de Corrida

- **Redis Lock** por `(tenant_id, professional_id, starts_at, ends_at)` antes de INSERT
- **EXCLUDE USING gist** no PostgreSQL como segunda linha de defesa
- Erro `23P01` (exclusion violation) mapeado para `SLOT_UNAVAILABLE` (409)

---

## 7. Integração WhatsApp

### 7.1 Fluxo de Inbound

```
Evolution API
    │
    ▼ POST /webhooks/whatsapp/inbound
    Headers:
      x-webhook-instance: <instance_key>
      x-hub-signature-256: sha256=<hmac>  ← obrigatório se hmac_secret existir
      x-webhook-token: <token>            ← fallback

1. Resolver tenant via tenant_integrations WHERE config->>'instance_name' = instance_key
2. Se hmac_secret → validar HMAC-SHA256 (timingSafeEqual, usa rawBody)
3. Se não hmac_secret → validar x-webhook-token
4. Deduplicação: INSERT webhook_events ... ON CONFLICT DO NOTHING
5. Upsert customer por (tenant_id, phone)
6. INSERT message (direction='in')
7. Gravar audit_log
8. Retornar { ok: true }
```

### 7.2 Segurança do Webhook

- **HMAC-SHA256** usa o corpo cru da requisição (rawBody capturado antes do parse JSON)
- Comparação com `timingSafeEqual` para evitar timing attacks
- Instância → tenant mapeados pela tabela `tenant_integrations`
- Deduplicação por `(tenant_id, provider, external_message_id)`

### 7.3 Envio de Mensagens (Outbound)

- Todas as mensagens de saída são enfileiradas no `message_outbox`
- O worker processa em background com `FOR UPDATE SKIP LOCKED` (sem duplicatas)
- Retry com backoff exponencial: `2^attempts * 60` segundos
- Após `max_attempts` falhas: status = 'dead'
- Endpoint Evolution API: `POST /message/sendText/{instance}`

---

## 8. Outbox — Envio Assíncrono

### 8.1 Ciclo do Worker

```
setInterval(pollOutbox, OUTBOX_POLL_INTERVAL_MS)

pollOutbox():
  SELECT * FROM message_outbox
   WHERE status IN ('pending','failed')
     AND next_retry_at <= now()
   ORDER BY next_retry_at
   LIMIT OUTBOX_CONCURRENCY
   FOR UPDATE SKIP LOCKED

  Para cada linha:
    SET status = 'processing'
    → processRow(row)

processRow(row):
  TRY:
    POST Evolution API → enviar mensagem
    SET status = 'sent', sent_at = now()
  CATCH:
    attempts++
    SE attempts >= max_attempts:
      SET status = 'dead', last_error = err.message
    SENÃO:
      next_retry = now() + (2^attempts * 60s)
      SET status = 'failed', last_error, next_retry_at
```

### 8.2 Configuração

| Variável | Descrição | Default |
|---|---|---|
| `OUTBOX_POLL_INTERVAL_MS` | Intervalo do polling | 5000 ms |
| `OUTBOX_CONCURRENCY` | Mensagens processadas por ciclo | 5 |

---

## 9. Row Level Security — RLS

### 9.1 Funcionamento

Toda query da aplicação executa dentro de uma conexão configurada com:

```sql
SET LOCAL app.tenant_id = '<tenant_uuid_do_jwt>';
```

A função `app_tenant_id()` lê esse valor e as policies aplicam automaticamente:

```sql
-- Policy em todas as tabelas tenant-scoped
USING (tenant_id = app_tenant_id())
WITH CHECK (tenant_id = app_tenant_id())
```

### 9.2 Tabelas com RLS + FORCE RLS (18 tabelas)

`customers`, `professionals`, `services`, `professional_services`, `business_hours`, `professional_time_off`, `professional_recurring_time_off`, `appointments`, `appointment_events`, `calendar_blocks`, `conversation_states`, `messages`, `message_outbox`, `webhook_events`, `user_sessions`, `rules`, `tenant_integrations`, `consents`

**Tabelas SEM RLS** (acesso controlado pela aplicação): `tenants`, `users`, `audit_logs`

### 9.3 Role de Aplicação

- `barbearia_app` — role com LOGIN, não-owner de nenhuma tabela
- Sempre sujeita ao RLS mesmo com `FORCE ROW LEVEL SECURITY`
- Permissões: `SELECT, INSERT, UPDATE, DELETE` em todas as tabelas públicas

---

## 10. Requisitos Não-Funcionais

### 10.1 Performance

| Métrica | Meta | Mecanismo |
|---|---|---|
| Latência P95 | < 200ms | Connection pool, Redis, índices |
| Throughput | > 300 req/min por tenant | Rate limit configurável |
| Disponibilidade | > 99.5% | Docker healthcheck, restart always |
| Startup da API | < 25s | Multi-stage build, dist/ pré-compilado |

### 10.2 Segurança

| Requisito | Implementação |
|---|---|
| Senhas | bcrypt rounds=12, obrigatório formato `$2x$` |
| Tokens JWT | HS256, secret mínimo 32 chars, access 15m / refresh 7d |
| Lockout | 5 tentativas → bloqueio 15 min (configurável) |
| CORS | Origin restrito via `CORS_ORIGIN` (nunca `*` em produção) |
| Helmet | Headers de segurança HTTP ativados |
| Rate limit global | 500 req/min por IP |
| Rate limit por tenant | 300 req/min por tenant (Redis sliding window) |
| Rate limit de auth | Login: 10/min, Refresh: 20/min, Logout: 30/min |
| HMAC | SHA-256, timingSafeEqual, corpo cru da requisição |
| Audit log | Toda mutação registrada com actor, before, after, IP |
| TLS | Obrigatório em produção via Traefik + Let's Encrypt |

### 10.3 Conformidade LGPD

| Requisito | Implementação |
|---|---|
| Consentimento | Tabela `consents` por canal e propósito |
| Opt-out | Campo `whatsapp_opt_out` em `customers` |
| Audit trail | `audit_logs` imutável com IP |
| Minimização | Somente campos necessários coletados |
| Revogação | `PATCH /consents/:id/revoke` com data e hora |

### 10.4 Monitoramento

| Endpoint | Verificação |
|---|---|
| `GET /health/live` | API está respondendo |
| `GET /health/ready` | Conectividade DB + Redis OK |

**Logs:** JSON estruturado, com `request_id` (UUID) em todos os logs e respostas de erro.

### 10.5 Backup

| Aspecto | Configuração |
|---|---|
| Ferramenta | `pg_dump` gzipado |
| Frequência | Diária (via cron no container) |
| Retenção | 60 dias |
| Verificação | Integridade via `gzip -t` |
| Localização | Volume Docker dedicado |

---

## 11. Códigos de Erro

Todas as respostas de erro seguem o padrão:
```json
{
  "error": "CODIGO_DO_ERRO",
  "message": "Mensagem legível para o desenvolvedor",
  "request_id": "uuid-da-requisicao"
}
```

| Código HTTP | error | Situação |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body/query inválido (Zod) |
| 400 | `NO_CHANGES` | PATCH sem campos para atualizar |
| 400 | `INVALID_PERIOD` | ends_at <= starts_at |
| 400 | `INVALID_RESET_TOKEN` | Token de reset inválido/expirado |
| 401 | `UNAUTHORIZED` | Token JWT ausente ou inválido |
| 401 | `SESSION_REVOKED` | Sessão revogada (logout ou reuso) |
| 401 | `INVALID_CREDENTIALS` | E-mail ou senha incorretos |
| 401 | `REFRESH_TOKEN_REUSED` | Refresh token reutilizado (detect reuse) |
| 401 | `INVALID_WEBHOOK_TOKEN` | Token de webhook inválido |
| 401 | `WEBHOOK_SIGNATURE_INVALID` | HMAC inválido |
| 403 | `FORBIDDEN` | Papel insuficiente para a ação |
| 403 | `TENANT_MISSING` | JWT sem tenant_id |
| 403 | `USER_INACTIVE` | Usuário desativado |
| 404 | `NOT_FOUND` | Recurso não encontrado |
| 404 | `APPOINTMENT_NOT_FOUND` | Agendamento não encontrado |
| 404 | `CUSTOMER_NOT_FOUND` | Cliente não encontrado |
| 404 | `BLOCK_NOT_FOUND` | Calendar block não encontrado |
| 404 | `CONSENT_NOT_FOUND` | Consentimento não encontrado |
| 404 | `WEBHOOK_INSTANCE_UNKNOWN` | Instância Evolution não cadastrada |
| 409 | `SLOT_UNAVAILABLE` | Horário ocupado (conflito de agendamento) |
| 409 | `APPOINTMENT_CANCELLED` | Tentar remarcar agendamento cancelado |
| 409 | `INVALID_STATUS_TRANSITION` | Transição de status inválida |
| 409 | `DUPLICATE` | Conflito de chave única |
| 429 | `ACCOUNT_LOCKED` | Conta bloqueada por tentativas |
| 429 | `TENANT_RATE_LIMIT` | Limite de requisições por minuto excedido |
| 429 | `TOO_MANY_REQUESTS` | Rate limit global atingido |
| 500 | `INTERNAL_ERROR` | Erro não tratado |
| 500 | `PASSWORD_HASH_INVALID` | Hash de senha em formato inválido |

---

## 12. Variáveis de Ambiente

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `NODE_ENV` | ❌ | `development` | Ambiente |
| `PORT` | ❌ | `3000` | Porta da API |
| `DATABASE_URL` | ✅ | — | String de conexão PostgreSQL |
| `JWT_SECRET` | ✅ | — | Secret JWT (mín. 32 chars) |
| `JWT_EXPIRES_IN` | ❌ | `15m` | Expiração do access token |
| `JWT_REFRESH_EXPIRES_IN` | ❌ | `7d` | Expiração do refresh token |
| `REDIS_URL` | ✅ | — | URL do Redis |
| `AUTH_RATE_LIMIT_WINDOW` | ❌ | `1 minute` | Janela do rate limit de auth |
| `AUTH_LOGIN_RATE_LIMIT_MAX` | ❌ | `10` | Max logins por janela por IP |
| `AUTH_REFRESH_RATE_LIMIT_MAX` | ❌ | `20` | Max refreshes por janela |
| `AUTH_LOGOUT_RATE_LIMIT_MAX` | ❌ | `30` | Max logouts por janela |
| `AUTH_MAX_FAILED_ATTEMPTS` | ❌ | `5` | Tentativas antes do lockout |
| `AUTH_LOCKOUT_MINUTES` | ❌ | `15` | Duração do lockout em minutos |
| `TENANT_DEFAULT_RPM` | ❌ | `300` | Rate limit por tenant (req/min) |
| `CORS_ORIGIN` | ❌ | `*` | Origins permitidas (separadas por vírgula) |
| `OUTBOX_POLL_INTERVAL_MS` | ❌ | `5000` | Intervalo do worker de outbox (ms) |
| `OUTBOX_CONCURRENCY` | ❌ | `5` | Mensagens por ciclo do worker |
| `EVOLUTION_API_URL` | ❌ | — | URL da Evolution API |
| `EVOLUTION_API_KEY` | ❌ | — | Chave da Evolution API |

---

## 13. Infra e Deploy

### 13.1 Serviços Docker

| Serviço | Imagem | Portas expostas | Healthcheck |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | Somente interno | `pg_isready` |
| `redis` | `redis:7-alpine` | Somente interno | `redis-cli ping` |
| `api` | Build local (multi-stage) | `3000` (interno) | `GET /health/ready` |
| `n8n` | `n8nio/n8n:1.91.3` | Via Traefik | — |
| `backup` | `postgres:16-alpine` | — | — |

### 13.2 Dockerfile — Multi-Stage Build

```dockerfile
# Stage 1: instala dependências de desenvolvimento
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: compila TypeScript
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: imagem final mínima, sem dev deps, usuário não-root
FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nodeuser
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
USER nodeuser
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
```

### 13.3 CI/CD — GitHub Actions

**Trigger:** Push e Pull Request para `main`

| Job | Passos |
|---|---|
| `build-and-test` | npm ci → tsc → vitest (coverage) → migrations → seed |
| `security-scan` | npm audit (vulnerabilidades críticas/high) |

**Serviços no CI:** PostgreSQL 16 + Redis 7 (containers de teste)

---

## 14. Requisitos de Qualidade

### 14.1 Testes Implementados

| Tipo | Cobertura | Ferramentas |
|---|---|---|
| Unitários | auth/service, session, rbac, locks, slots | Vitest + mocks |
| Integração | Routes, auth flows, business_hours | Vitest + banco real |
| Concorrência | EXCLUDE GIST (agendamento simultâneo) | Via CI |

### 14.2 Critérios de Aceite por Funcionalidade

**Agendamento:**
- [ ] Não é possível criar dois agendamentos no mesmo horário para o mesmo profissional (EXCLUDE GIST)
- [ ] Disponibilidade exclui horários bloqueados por calendar_blocks, time_off e business_hours
- [ ] Agendamento com `starts_at` < now() + 30min é rejeitado (min_advance_minutes)
- [ ] Idempotency_key evita criação duplicada

**Autenticação:**
- [ ] 5 tentativas falhadas bloqueiam a conta por 15 min
- [ ] Reuso de refresh_token revoga toda a família de tokens
- [ ] Token de reset de senha expira em 30 minutos
- [ ] Logout revoga access e refresh imediatamente

**Multi-tenancy:**
- [ ] Tenant A nunca enxerga dados do Tenant B (RLS)
- [ ] `x-tenant-id` header é ignorado — somente JWT define o tenant

**Webhook WhatsApp:**
- [ ] HMAC inválido → 401 (mesmo com token correto)
- [ ] Mensagem duplicada (mesmo external_message_id) → ignora silenciosamente
- [ ] Instância não cadastrada → 404

**LGPD:**
- [ ] Consentimento registrado antes de enviar mensagens de marketing
- [ ] Opt-out sincroniza `whatsapp_opt_out = true` no customer
- [ ] Revogação grava `revoked_at` e `granted = false`

---

*Documento gerado em 29/04/2026 — Exeq Tecnologia*  
*Para visão gerencial, consultar: `DOC_ALTO_NIVEL_GERENCIAL.md`*
