-- ═══════════════════════════════════════════════════════════════════════════════
-- SaaS Barbearia — Schema Completo
-- Criação do banco do zero (todas as migrations consolidadas)
-- Gerado em: 2026-04-29
-- ═══════════════════════════════════════════════════════════════════════════════
-- Execução:
--   psql -U postgres -d barbearia_saas -f schema_completo.sql
-- OU via Docker:
--   docker exec -i <container_postgres> psql -U barbearia -d barbearia_saas < schema_completo.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. EXTENSÕES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid, gen_random_bytes
CREATE EXTENSION IF NOT EXISTS citext;      -- e-mails case-insensitive
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- EXCLUDE USING gist com timestamptz

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. TIPOS ENUMERADOS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TYPE tenant_status AS ENUM (
  'trial',
  'active',
  'suspended',
  'cancelled'
);

CREATE TYPE user_role AS ENUM (
  'platform_admin',   -- administrador da plataforma (cross-tenant)
  'tenant_owner',     -- dono da barbearia
  'tenant_admin',     -- admin da barbearia
  'manager',          -- gerente
  'professional',     -- barbeiro/profissional
  'attendant',        -- atendente
  'viewer'            -- visualizador (somente leitura)
);

CREATE TYPE appointment_status AS ENUM (
  'draft',
  'offered',
  'confirmed',
  'cancelled',
  'completed',
  'no_show'
);

CREATE TYPE channel AS ENUM (
  'whatsapp',
  'web',
  'manual',
  'api'
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. FUNÇÃO AUXILIAR DE TENANT (RLS)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Lê o tenant_id injetado via SET LOCAL na conexão do pool.
-- Nunca aceita tenant_id de header HTTP — somente do JWT autenticado.

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('app.tenant_id', true), '')::uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. TABELAS PRINCIPAIS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ── 4.1 Tenants (barbearias cadastradas na plataforma) ──────────────────────
CREATE TABLE tenants (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name    text          NOT NULL,
  trade_name    text          NOT NULL,
  slug          citext        UNIQUE,
  document      text,
  contact_email citext,
  contact_phone text,
  plan_code     text          NOT NULL DEFAULT 'trial',
  plan_limits   jsonb         NOT NULL DEFAULT '{}',
  status        tenant_status NOT NULL DEFAULT 'trial',
  timezone      text          NOT NULL DEFAULT 'America/Sao_Paulo',
  webhook_token text          NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_status ON tenants (status);
CREATE UNIQUE INDEX tenants_slug_uq ON tenants (slug) WHERE slug IS NOT NULL;

-- ── 4.2 Usuários ─────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        REFERENCES tenants(id) ON DELETE CASCADE,
  name                text        NOT NULL,
  email               citext      NOT NULL,
  password_hash       text        NOT NULL,
  role                user_role   NOT NULL,
  is_active           boolean     NOT NULL DEFAULT true,
  failed_login_count  integer     NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  last_login_at       timestamptz,
  password_changed_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email),                          -- e-mail único globalmente
  UNIQUE (tenant_id, email)                -- e-mail único por tenant
);

CREATE INDEX idx_users_tenant_email_active ON users (tenant_id, email, is_active);
CREATE INDEX idx_users_locked_until
  ON users (tenant_id, locked_until)
  WHERE locked_until IS NOT NULL;

-- ── 4.3 Integrações do tenant (WhatsApp / Evolution API etc.) ───────────────
CREATE TABLE tenant_integrations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider         text        NOT NULL,
  config           jsonb       NOT NULL DEFAULT '{}',
  encrypted_secret text,
  hmac_secret      text,        -- gerado com encode(gen_random_bytes(32),'hex')
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

-- ── 4.4 Clientes (consumidores da barbearia) ─────────────────────────────────
CREATE TABLE customers (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                text,
  phone               text        NOT NULL,
  email               citext,
  whatsapp_opt_in     boolean     NOT NULL DEFAULT false,
  whatsapp_opt_out    boolean     NOT NULL DEFAULT false,
  whatsapp_instance   varchar(120),          -- instância Evolution usada para envio
  last_interaction_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);

CREATE INDEX idx_customers_tenant_phone ON customers (tenant_id, phone);

-- ── 4.5 Profissionais (barbeiros / funcionários) ─────────────────────────────
CREATE TABLE professionals (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                 text        NOT NULL,
  slug                 text        NOT NULL,
  phone                text,
  timezone             text,
  active               boolean     NOT NULL DEFAULT true,
  calendar_provider    text        DEFAULT 'internal',
  external_calendar_id text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- ── 4.6 Serviços oferecidos ───────────────────────────────────────────────────
CREATE TABLE services (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  duration_minutes int         NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  price_cents      int         NOT NULL DEFAULT 0,
  active           boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- ── 4.7 Vínculo profissional ↔ serviço ───────────────────────────────────────
CREATE TABLE professional_services (
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  service_id      uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (professional_id, service_id)
);

CREATE INDEX idx_prof_services_lookup
  ON professional_services (tenant_id, service_id, professional_id);

-- ── 4.8 Horário de funcionamento ─────────────────────────────────────────────
CREATE TABLE business_hours (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  professional_id       uuid    REFERENCES professionals(id) ON DELETE CASCADE,
  weekday               int     NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at             time    NOT NULL,
  ends_at               time    NOT NULL,
  slot_interval_minutes int     NOT NULL DEFAULT 30,
  active                boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_business_hours_lookup
  ON business_hours (tenant_id, professional_id, weekday)
  WHERE active = true;

-- ── 4.9 Folgas pontuais do profissional ──────────────────────────────────────
CREATE TABLE professional_time_off (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  professional_id uuid        NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  reason          text,
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX idx_professional_time_off_period
  ON professional_time_off (tenant_id, professional_id, starts_at, ends_at)
  WHERE active = true;

-- ── 4.10 Folgas recorrentes (ex: toda terça 12h-13h) ──────────────────────────
CREATE TABLE professional_recurring_time_off (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  professional_id uuid    NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  weekday         int     NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at       time    NOT NULL,
  ends_at         time    NOT NULL,
  reason          text,
  active          boolean NOT NULL DEFAULT true,
  valid_from      date,
  valid_until     date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);

CREATE INDEX idx_professional_recurring_time_off_lookup
  ON professional_recurring_time_off (tenant_id, professional_id, weekday, active);

-- ── 4.11 Bloqueios manuais de agenda ─────────────────────────────────────────
CREATE TABLE calendar_blocks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  professional_id uuid        REFERENCES professionals(id) ON DELETE CASCADE,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  kind            text        NOT NULL DEFAULT 'manual'
                              CHECK (kind IN ('time_off','break','holiday','maintenance','manual')),
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX idx_calendar_blocks_period
  ON calendar_blocks (tenant_id, professional_id, starts_at, ends_at);

-- ── 4.12 Agendamentos ────────────────────────────────────────────────────────
CREATE TABLE appointments (
  id                        uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid               NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id               uuid               NOT NULL REFERENCES customers(id),
  professional_id           uuid               NOT NULL REFERENCES professionals(id),
  service_id                uuid               REFERENCES services(id),
  starts_at                 timestamptz        NOT NULL,
  ends_at                   timestamptz        NOT NULL,
  -- tstzrange gerado automaticamente — usado pelo EXCLUDE GIST
  period                    tstzrange          GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  status                    appointment_status NOT NULL DEFAULT 'draft',
  source                    channel            NOT NULL DEFAULT 'whatsapp',
  external_calendar_event_id text,
  notes                     text,
  idempotency_key           text               NOT NULL,
  created_at                timestamptz        NOT NULL DEFAULT now(),
  updated_at                timestamptz        NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (tenant_id, idempotency_key),
  -- Impede sobreposição de horário no nível do banco (sem condição de corrida)
  EXCLUDE USING gist (
    tenant_id       WITH =,
    professional_id WITH =,
    period          WITH &&
  ) WHERE (status IN ('confirmed', 'completed', 'offered'))
);

CREATE INDEX idx_appointments_tenant_period    ON appointments (tenant_id, starts_at, ends_at);
CREATE INDEX idx_appointments_professional      ON appointments (tenant_id, professional_id, starts_at);
CREATE INDEX idx_appointments_customer          ON appointments (tenant_id, customer_id, starts_at);
CREATE INDEX idx_appointments_status            ON appointments (tenant_id, status) WHERE status NOT IN ('cancelled','completed','no_show');

-- ── 4.13 Histórico de eventos do agendamento ─────────────────────────────────
CREATE TABLE appointment_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id uuid        NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  event_type     text        NOT NULL,
  actor_user_id  uuid        REFERENCES users(id) ON DELETE SET NULL,
  payload        jsonb       NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_appt_events_appointment
  ON appointment_events (tenant_id, appointment_id, created_at);

-- ── 4.14 Estados de conversa (bot WhatsApp) ──────────────────────────────────
CREATE TABLE conversation_states (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  state_key   text        NOT NULL,
  payload     jsonb       NOT NULL DEFAULT '{}',
  expires_at  timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, state_key)
);

-- ── 4.15 Mensagens (in/out WhatsApp) ─────────────────────────────────────────
CREATE TABLE messages (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id         uuid        REFERENCES customers(id),
  direction           text        NOT NULL CHECK (direction IN ('in', 'out')),
  channel             channel     NOT NULL DEFAULT 'whatsapp',
  external_message_id text,
  body                text,
  payload             jsonb       NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_customer ON messages (tenant_id, customer_id, created_at DESC);

-- ── 4.16 Fila de mensagens de saída (outbox pattern) ─────────────────────────
CREATE TABLE message_outbox (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel         text        NOT NULL DEFAULT 'whatsapp',
  payload         jsonb       NOT NULL,
  metadata        jsonb       NOT NULL DEFAULT '{}',  -- ex: instance_name, phone
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','processing','sent','failed','dead')),
  attempts        int         NOT NULL DEFAULT 0,
  max_attempts    int         NOT NULL DEFAULT 5,
  last_error      text,
  idempotency_key text        UNIQUE,
  next_retry_at   timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbox_pending
  ON message_outbox (next_retry_at, status)
  WHERE status IN ('pending', 'failed');

-- ── 4.17 Deduplicação de eventos de webhook ───────────────────────────────────
CREATE TABLE webhook_events (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider            text        NOT NULL,
  external_message_id text        NOT NULL,
  payload_sha256      text        NOT NULL,
  processed_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, external_message_id)
);

CREATE INDEX idx_webhook_events_lookup
  ON webhook_events (tenant_id, provider, external_message_id);

-- ── 4.18 Sessões de refresh token ────────────────────────────────────────────
CREATE TABLE user_sessions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jti        text        NOT NULL UNIQUE,
  parent_jti text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_sessions_jti    ON user_sessions (jti);
CREATE INDEX idx_user_sessions_parent ON user_sessions (parent_jti) WHERE parent_jti IS NOT NULL;

-- ── 4.19 Consentimentos LGPD ─────────────────────────────────────────────────
CREATE TABLE consents (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel     text        NOT NULL CHECK (channel IN ('whatsapp','web','manual','api')),
  purpose     text        NOT NULL CHECK (purpose IN ('transactional','marketing','recall')),
  granted     boolean     NOT NULL DEFAULT true,
  source      text,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consents_customer ON consents (tenant_id, customer_id, purpose, granted);
CREATE INDEX idx_consents_channel  ON consents (tenant_id, channel) WHERE granted = true;

-- ── 4.20 Regras de negócio configuráveis ──────────────────────────────────────
CREATE TABLE rules (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_type  text        NOT NULL,
  config     jsonb       NOT NULL DEFAULT '{}',
  active     boolean     NOT NULL DEFAULT true,
  version    int         NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rule_type, version)
);

-- ── 4.21 Log de auditoria ─────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        REFERENCES tenants(id) ON DELETE SET NULL,
  actor_user_id uuid        REFERENCES users(id) ON DELETE SET NULL,
  action        text        NOT NULL,
  entity        text        NOT NULL,
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  ip            inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_entity
  ON audit_logs (tenant_id, entity, entity_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor
  ON audit_logs (tenant_id, actor_user_id, created_at DESC);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. TRIGGERS — atualização automática de updated_at
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenants_set_updated_at
  BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER professionals_set_updated_at
  BEFORE UPDATE ON professionals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER services_set_updated_at
  BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER appointments_set_updated_at
  BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER conversation_states_set_updated_at
  BEFORE UPDATE ON conversation_states FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER message_outbox_set_updated_at
  BEFORE UPDATE ON message_outbox FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. ROW LEVEL SECURITY — ENABLE + FORCE + POLICIES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Todas as tabelas com dados de tenant ficam protegidas.
-- A policy usa app_tenant_id() que é injetado pela aplicação via SET LOCAL.
-- FORCE RLS garante que até o owner da tabela fica sujeito à policy.

ALTER TABLE customers                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE services                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_services           ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_time_off           ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_recurring_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_blocks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_states             ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_outbox                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_integrations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents                        ENABLE ROW LEVEL SECURITY;

ALTER TABLE customers                       FORCE ROW LEVEL SECURITY;
ALTER TABLE professionals                   FORCE ROW LEVEL SECURITY;
ALTER TABLE services                        FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_services           FORCE ROW LEVEL SECURITY;
ALTER TABLE business_hours                  FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_time_off           FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_recurring_time_off FORCE ROW LEVEL SECURITY;
ALTER TABLE appointments                    FORCE ROW LEVEL SECURITY;
ALTER TABLE appointment_events              FORCE ROW LEVEL SECURITY;
ALTER TABLE calendar_blocks                 FORCE ROW LEVEL SECURITY;
ALTER TABLE conversation_states             FORCE ROW LEVEL SECURITY;
ALTER TABLE messages                        FORCE ROW LEVEL SECURITY;
ALTER TABLE message_outbox                  FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_events                  FORCE ROW LEVEL SECURITY;
ALTER TABLE user_sessions                   FORCE ROW LEVEL SECURITY;
ALTER TABLE rules                           FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_integrations             FORCE ROW LEVEL SECURITY;
ALTER TABLE consents                        FORCE ROW LEVEL SECURITY;

-- Policies (USING = SELECT/UPDATE/DELETE; WITH CHECK = INSERT/UPDATE)
CREATE POLICY tenant_isolation ON customers
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON professionals
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON services
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON professional_services
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON business_hours
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON professional_time_off
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON professional_recurring_time_off
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON appointments
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON appointment_events
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON calendar_blocks
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON conversation_states
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON messages
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON message_outbox
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON webhook_events
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON user_sessions
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON rules
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON tenant_integrations
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

CREATE POLICY tenant_isolation ON consents
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. ROLE DE APLICAÇÃO (não-owner — sujeita ao RLS)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- barbearia_app é a role usada pela API em produção.
-- NÃO é owner de nenhuma tabela — por isso fica 100% sujeita ao RLS.
-- Trocar a senha abaixo antes do deploy!

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app') THEN
    CREATE ROLE barbearia_app LOGIN PASSWORD 'TROQUE_ESTA_SENHA_ANTES_DO_DEPLOY';
  END IF;
END$$;

GRANT CONNECT ON DATABASE barbearia_saas TO barbearia_app;
GRANT USAGE ON SCHEMA public TO barbearia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO barbearia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO barbearia_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO barbearia_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO barbearia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO barbearia_app;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. VERIFICAÇÃO FINAL
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
DECLARE
  tabela text;
  total_tabelas int := 0;
  total_rls int := 0;
BEGIN
  FOR tabela IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  LOOP
    total_tabelas := total_tabelas + 1;
  END LOOP;

  SELECT COUNT(*) INTO total_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = true;

  RAISE NOTICE '✅ Schema criado com sucesso!';
  RAISE NOTICE '   Total de tabelas : %', total_tabelas;
  RAISE NOTICE '   Tabelas com RLS  : %', total_rls;
END$$;

COMMIT;
