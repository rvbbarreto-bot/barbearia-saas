-- Fase 2: colunas ausentes, triggers updated_at, HMAC por instância,
--          metadata no outbox, role app, groundwork para FORCE RLS.

-- ── Tenants: campos de gestão e plano ─────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug citext;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email citext;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_limits jsonb NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_uq ON tenants(slug) WHERE slug IS NOT NULL;

-- ── Users: segurança e rastreamento ──────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count int NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

-- ── Professionals: updated_at obrigatório ────────────────────────────────────
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ── Services: updated_at ──────────────────────────────────────────────────────
ALTER TABLE services ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ── Trigger universal set_updated_at ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('tenants'),('users'),('customers'),('professionals'),
                  ('services'),('appointments'),('conversation_states'),
                  ('message_outbox') LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
       WHERE tgname = t || '_set_updated_at'
         AND tgrelid = t::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
        t || '_set_updated_at', t
      );
    END IF;
  END LOOP;
END$$;

-- ── tenant_integrations: HMAC secret por instância ───────────────────────────
ALTER TABLE tenant_integrations ADD COLUMN IF NOT EXISTS hmac_secret text;
-- Ao gerar um novo tenant/integração, preencher com: encode(gen_random_bytes(32),'hex')

-- ── message_outbox: metadata do provedor ─────────────────────────────────────
ALTER TABLE message_outbox ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

-- ── Role de aplicação (não-owner, sujeito ao RLS) ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app') THEN
    CREATE ROLE barbearia_app LOGIN PASSWORD 'barbearia_app_dev_password';
  END IF;
END$$;

-- Nome do DB varia (ex.: barbearia_saas vs barbearia_saas_test no CI)
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO barbearia_app', current_database());
END$$;
GRANT USAGE ON SCHEMA public TO barbearia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO barbearia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO barbearia_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO barbearia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO barbearia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO barbearia_app;

-- ── FORCE ROW LEVEL SECURITY nas tabelas operacionais ────────────────────────
-- Aplica as policies também para a role dona das tabelas (barbearia_app vai operar
-- como não-owner, mas o owner também fica sujeito por segurança).
ALTER TABLE customers                  FORCE ROW LEVEL SECURITY;
ALTER TABLE professionals              FORCE ROW LEVEL SECURITY;
ALTER TABLE services                   FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_services      FORCE ROW LEVEL SECURITY;
ALTER TABLE business_hours             FORCE ROW LEVEL SECURITY;
ALTER TABLE appointments               FORCE ROW LEVEL SECURITY;
ALTER TABLE conversation_states        FORCE ROW LEVEL SECURITY;
ALTER TABLE messages                   FORCE ROW LEVEL SECURITY;
ALTER TABLE rules                      FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_integrations        FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_time_off      FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_recurring_time_off FORCE ROW LEVEL SECURITY;
ALTER TABLE calendar_blocks            FORCE ROW LEVEL SECURITY;
ALTER TABLE appointment_events         FORCE ROW LEVEL SECURITY;
ALTER TABLE message_outbox             FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_events             FORCE ROW LEVEL SECURITY;
-- consents: tabela criada na migration 007 — FORCE RLS aplicado lá
ALTER TABLE user_sessions              FORCE ROW LEVEL SECURITY;

-- ── Índice para listing de tenants via slug ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- ── professional_services: índice de lookup para availability ─────────────────
CREATE INDEX IF NOT EXISTS idx_prof_services_lookup
  ON professional_services(tenant_id, service_id, professional_id);
