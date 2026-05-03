-- ═══════════════════════════════════════════════════════════════
-- Migration 005 — Phase 1:  btree_gist · EXCLUDE GIST · RLS pleno
--                           calendar_blocks · appointment_events
--                           message_outbox · webhook_events
--                           user_sessions
-- ═══════════════════════════════════════════════════════════════
BEGIN;

-- ── btree_gist: necessário para EXCLUDE USING gist com timestamptz ──
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Substituir índice único pelo EXCLUDE GIST (evita sobreposição) ──
DROP INDEX IF EXISTS appointments_no_overlap_confirmed;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS period tstzrange
    GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_no_time_overlap;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_time_overlap
    EXCLUDE USING gist (
      tenant_id   WITH =,
      professional_id WITH =,
      period      WITH &&
    )
    WHERE (status IN ('confirmed', 'completed', 'offered'));

-- ── calendar_blocks: bloqueios manuais de agenda ────────────────────
CREATE TABLE IF NOT EXISTS calendar_blocks (
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

ALTER TABLE calendar_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_blocks FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON calendar_blocks
  USING      (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

CREATE INDEX IF NOT EXISTS idx_calendar_blocks_period
  ON calendar_blocks (tenant_id, professional_id, starts_at, ends_at);

-- ── appointment_events: histórico de mudanças de status ────────────
CREATE TABLE IF NOT EXISTS appointment_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id uuid        NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  event_type     text        NOT NULL,
  actor_user_id  uuid        REFERENCES users(id) ON DELETE SET NULL,
  payload        jsonb       NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE appointment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON appointment_events
  USING      (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

CREATE INDEX IF NOT EXISTS idx_appt_events_lookup
  ON appointment_events (tenant_id, appointment_id, created_at);

-- ── message_outbox: fila de mensagens para envio assíncrono ────────
CREATE TABLE IF NOT EXISTS message_outbox (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel         text        NOT NULL DEFAULT 'whatsapp',
  payload         jsonb       NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','processing','sent','failed','dead')),
  attempts        int         NOT NULL DEFAULT 0,
  max_attempts    int         NOT NULL DEFAULT 5,
  last_error      text,
  idempotency_key text,
  next_retry_at   timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

ALTER TABLE message_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON message_outbox
  USING      (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON message_outbox (next_retry_at, status)
  WHERE status IN ('pending', 'failed');

-- ── webhook_events: idempotência de eventos externos ───────────────
CREATE TABLE IF NOT EXISTS webhook_events (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider            text        NOT NULL,
  external_message_id text        NOT NULL,
  payload_sha256      text        NOT NULL,
  processed_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, external_message_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup
  ON webhook_events (tenant_id, provider, external_message_id);

-- ── user_sessions: controle de refresh tokens ativos ───────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jti         text        NOT NULL UNIQUE,
  parent_jti  text,
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON user_sessions
  USING      (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

CREATE INDEX IF NOT EXISTS idx_user_sessions_jti    ON user_sessions (jti);
CREATE INDEX IF NOT EXISTS idx_user_sessions_parent ON user_sessions (parent_jti) WHERE parent_jti IS NOT NULL;

-- ── Reforçar policies existentes com WITH CHECK ─────────────────────
-- (garante que INSERT/UPDATE também valide tenant_id)
DO $$ BEGIN

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'tenant_isolation') THEN
    DROP POLICY IF EXISTS tenant_customers ON customers;
    CREATE POLICY tenant_isolation ON customers
      USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'professionals' AND policyname = 'tenant_isolation') THEN
    DROP POLICY IF EXISTS tenant_professionals ON professionals;
    CREATE POLICY tenant_isolation ON professionals
      USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'services' AND policyname = 'tenant_isolation') THEN
    DROP POLICY IF EXISTS tenant_services ON services;
    CREATE POLICY tenant_isolation ON services
      USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'appointments' AND policyname = 'tenant_isolation') THEN
    DROP POLICY IF EXISTS tenant_appointments ON appointments;
    CREATE POLICY tenant_isolation ON appointments
      USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'tenant_isolation') THEN
    DROP POLICY IF EXISTS tenant_messages ON messages;
    CREATE POLICY tenant_isolation ON messages
      USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
  END IF;

END $$;

COMMIT;
