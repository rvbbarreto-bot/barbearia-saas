-- ═══════════════════════════════════════════════════════════════
-- Migration 007 — Phase 3: Auth lockout · Appointment events ·
--                          Consents · Calendar blocks · Customers
-- ═══════════════════════════════════════════════════════════════
BEGIN;

-- ── Users: campos para lockout e auditoria de acesso ─────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_count  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until        timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at       timestamptz,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

-- ── Customers: rastrear instância WhatsApp usada para envio ──────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS whatsapp_instance varchar(120);

-- Índice útil para o outbox worker localizar a instância correta
CREATE INDEX IF NOT EXISTS idx_customers_phone_tenant
  ON customers (tenant_id, phone);

-- ── Consents: tabela LGPD de consentimentos ────────────────────
CREATE TABLE IF NOT EXISTS consents (
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

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'consents' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON consents
      USING (tenant_id = app_tenant_id())
      WITH CHECK (tenant_id = app_tenant_id());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_consents_customer ON consents (tenant_id, customer_id, purpose, granted);
CREATE INDEX IF NOT EXISTS idx_consents_channel  ON consents (tenant_id, channel) WHERE granted = true;

-- ── Calendar blocks: RLS (tabela já existe, apenas garantir policy) ─
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calendar_blocks' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON calendar_blocks
      USING (tenant_id = app_tenant_id())
      WITH CHECK (tenant_id = app_tenant_id());
  END IF;
END $$;

-- ── appointment_events: RLS (tabela já existe, apenas garantir policy) ─
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'appointment_events' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON appointment_events
      USING (tenant_id = app_tenant_id())
      WITH CHECK (tenant_id = app_tenant_id());
  END IF;
END $$;

-- ── Índices extras de performance ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appt_events_appointment ON appointment_events (tenant_id, appointment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_users_locked_until       ON users (tenant_id, locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity        ON audit_logs (tenant_id, entity, entity_id, created_at DESC);

-- Conceder permissões para role da aplicação nas novas tabelas
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON consents TO barbearia_app;
  END IF;
END $$;

COMMIT;
