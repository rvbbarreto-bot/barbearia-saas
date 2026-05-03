-- ═══════════════════════════════════════════════════════════════
-- Migration 009 — Phase 4: modelo operacional mínimo V4
-- • appointment_status extendido · EXCLUDE atualizado ao conjunto ocupante V4
-- • tenant_settings, branches (multi‑unidade), categorias/serviço variantes
-- • holidays (tenant / branch), holds, histórico de status, lembretes, suporte
-- • RLS, índices de disponibilidade, auditoria (updated_at onde cabível)
-- • Políticas WITH CHECK onde faltava (professional_time_off*, professional_services*)
-- ═══════════════════════════════════════════════════════════════
-- Postgres: novos rótulos de enum só podem ser usados após COMMIT.
-- Esta secção corre fora da transação explícita seguinte (cada DDL auto-commit).
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'hold';
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'awaiting_confirmation';
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'awaiting_payment';
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'checked_in';
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'in_service';
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'no_show_pending';
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'rescheduled';
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'expired';

BEGIN;

-- ── 2. Sobreposição temporal (deve ficar espelhada em código: slot‑blocking list)
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_no_time_overlap;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_time_overlap
    EXCLUDE USING gist (
      tenant_id WITH =,
      professional_id WITH =,
      period WITH &&
    )
    WHERE (
      status IN (
        'offered', 'hold', 'awaiting_confirmation', 'awaiting_payment', 'confirmed',
        'checked_in', 'in_service', 'completed', 'no_show_pending'
      )
    );

-- ── 3. Branches ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        citext,
  timezone    text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS branches_slug_uq ON branches (tenant_id, slug) WHERE slug IS NOT NULL;

-- ── 4. tenant_settings ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id  uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  settings   jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 5. Serviços: categorias e variantes ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

ALTER TABLE services ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES service_categories(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS service_variants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_id       uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name             text NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  price_cents      int NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, service_id, name)
);

CREATE INDEX IF NOT EXISTS idx_service_variants_service ON service_variants (tenant_id, service_id) WHERE active = true;

-- ── 6. Feriados ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_holidays (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  observe_on   date NOT NULL,
  name         text NOT NULL,
  recurring    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, observe_on, name)
);

CREATE TABLE IF NOT EXISTS branch_holidays (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  observe_on   date NOT NULL,
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, observe_on, name)
);

-- ── 7. Agendamentos: multi‑unidade e auditoria opcional ────────────────────────
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN appointments.branch_id IS 'Opcional até suportar filial em todas rotas.';
COMMENT ON COLUMN appointments.created_by_user_id IS 'Opcional · preenchimento futuro pela API.';
COMMENT ON COLUMN appointments.updated_by_user_id IS 'Opcional · preenchimento futuro pela API.';

DROP INDEX IF EXISTS idx_appointments_availability_blocked;

CREATE INDEX idx_appointments_availability_blocked
  ON appointments (tenant_id, professional_id, starts_at, ends_at)
  WHERE status IN (
    'offered', 'hold', 'awaiting_confirmation', 'awaiting_payment', 'confirmed',
    'checked_in', 'in_service', 'completed', 'no_show_pending'
  );

-- ── 8. appointment_holds (reserva temporária; anti‑overlap apenas holds ativos)
CREATE TABLE IF NOT EXISTS appointment_holds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  professional_id  uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  service_id       uuid REFERENCES services(id) ON DELETE SET NULL,
  customer_id      uuid REFERENCES customers(id) ON DELETE SET NULL,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  period           tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  expires_at       timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'released', 'expired', 'converted')),
  idempotency_key  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

DROP INDEX IF EXISTS appointment_holds_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS appointment_holds_idempotency
  ON appointment_holds (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

DROP INDEX IF EXISTS idx_appointment_holds_active_ttl;
CREATE INDEX IF NOT EXISTS idx_appointment_holds_active_ttl
  ON appointment_holds (tenant_id, professional_id, expires_at) WHERE status = 'active';

ALTER TABLE appointment_holds DROP CONSTRAINT IF EXISTS appointment_holds_no_overlap_active;

ALTER TABLE appointment_holds
  ADD CONSTRAINT appointment_holds_no_overlap_active
    EXCLUDE USING gist (
      tenant_id WITH =,
      professional_id WITH =,
      period WITH &&
    )
    WHERE (status::text = 'active');

-- ── 9. Histórico de status (SECURITY DEFINER: gravação independente das policies de sessão app)
CREATE TABLE IF NOT EXISTS appointment_status_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id      uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  previous_status     appointment_status,
  new_status          appointment_status NOT NULL,
  changed_at          timestamptz NOT NULL DEFAULT now(),
  changed_by_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  payload             jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_appt_status_hist_appt ON appointment_status_history (tenant_id, appointment_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_appt_status_hist_tenant_day ON appointment_status_history (tenant_id, changed_at DESC);

CREATE OR REPLACE FUNCTION trg_append_appointment_status_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO appointment_status_history (tenant_id, appointment_id, previous_status, new_status)
    VALUES (NEW.tenant_id, NEW.id, NULL, NEW.status);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO appointment_status_history (tenant_id, appointment_id, previous_status, new_status)
    VALUES (NEW.tenant_id, NEW.id, OLD.status, NEW.status);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_status_hist_trg ON appointments;
CREATE TRIGGER appointments_status_hist_trg
  AFTER INSERT OR UPDATE OF status ON appointments
  FOR EACH ROW EXECUTE FUNCTION trg_append_appointment_status_history();

-- ── 10. Lembretes / tickets de suporte ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_type        text NOT NULL,
  run_at          timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  payload         jsonb NOT NULL DEFAULT '{}',
  appointment_id  uuid REFERENCES appointments(id) ON DELETE SET NULL,
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_jobs_poll
  ON notification_jobs (tenant_id, run_at, status) WHERE status IN ('pending', 'processing');

CREATE TABLE IF NOT EXISTS support_tickets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id         uuid REFERENCES customers(id) ON DELETE SET NULL,
  subject             text NOT NULL,
  body                text,
  status              text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  priority            text NOT NULL DEFAULT 'normal'
                          CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  channel             text NOT NULL DEFAULT 'whatsapp',
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_by_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON support_tickets (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_holidays_observe ON tenant_holidays (tenant_id, observe_on);
CREATE INDEX IF NOT EXISTS idx_branch_holidays_observe ON branch_holidays (tenant_id, branch_id, observe_on);

-- ── 11. calendar_blocks: updated_at + trigger ────────────────────────────────
ALTER TABLE calendar_blocks ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ── 12. Policies WITH CHECK onde faltava ────────────────────────────────────
DROP POLICY IF EXISTS tenant_professional_time_off ON professional_time_off;
DROP POLICY IF EXISTS tenant_isolation_prof_time_off ON professional_time_off;

CREATE POLICY tenant_isolation_prof_time_off ON professional_time_off
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_professional_recurring_time_off ON professional_recurring_time_off;
DROP POLICY IF EXISTS tenant_isolation_prof_recurring_time_off ON professional_recurring_time_off;

CREATE POLICY tenant_isolation_prof_recurring_time_off ON professional_recurring_time_off
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_prof_services ON professional_services;

DROP POLICY IF EXISTS tenant_isolation_prof_services ON professional_services;

CREATE POLICY tenant_isolation_prof_services ON professional_services
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

-- ── 13. RLS (novas tabelas de negócio) ───────────────────────────────────────
ALTER TABLE branches                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches                     FORCE ROW LEVEL SECURITY;

ALTER TABLE tenant_settings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings              FORCE ROW LEVEL SECURITY;

ALTER TABLE service_categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories           FORCE ROW LEVEL SECURITY;

ALTER TABLE service_variants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_variants             FORCE ROW LEVEL SECURITY;

ALTER TABLE tenant_holidays              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_holidays              FORCE ROW LEVEL SECURITY;

ALTER TABLE branch_holidays              ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_holidays              FORCE ROW LEVEL SECURITY;

ALTER TABLE appointment_holds            ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_holds            FORCE ROW LEVEL SECURITY;

ALTER TABLE appointment_status_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_status_history    FORCE ROW LEVEL SECURITY;

ALTER TABLE notification_jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_jobs             FORCE ROW LEVEL SECURITY;

ALTER TABLE support_tickets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets               FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_branches ON branches;
CREATE POLICY tenant_isolation_branches ON branches
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_tenant_settings ON tenant_settings;
CREATE POLICY tenant_isolation_tenant_settings ON tenant_settings
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_svc_cat ON service_categories;
CREATE POLICY tenant_isolation_svc_cat ON service_categories
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_svc_variants ON service_variants;
CREATE POLICY tenant_isolation_svc_variants ON service_variants
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_tenant_holidays ON tenant_holidays;
CREATE POLICY tenant_isolation_tenant_holidays ON tenant_holidays
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_branch_holidays ON branch_holidays;
CREATE POLICY tenant_isolation_branch_holidays ON branch_holidays
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_appt_holds ON appointment_holds;
CREATE POLICY tenant_isolation_appt_holds ON appointment_holds
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_appt_status_hist ON appointment_status_history;
CREATE POLICY tenant_isolation_appt_status_hist ON appointment_status_history
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_notification_jobs ON notification_jobs;
CREATE POLICY tenant_isolation_notification_jobs ON notification_jobs
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_support_tickets ON support_tickets;
CREATE POLICY tenant_isolation_support_tickets ON support_tickets
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

-- ── 14. Triggers updated_at (extends migration 006) ─────────────────────────
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'branches','tenant_settings','service_categories','service_variants',
    'tenant_holidays','branch_holidays','appointment_holds','notification_jobs',
    'support_tickets','calendar_blocks'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = to_regclass('public.' || tbl)
        AND tgname = tbl || '_set_updated_at'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
        tbl || '_set_updated_at',
        tbl
      );
    END IF;
  END LOOP;
END$$;

-- ── 15. Permissões app role ─────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON branches TO barbearia_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_settings TO barbearia_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON service_categories TO barbearia_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON service_variants TO barbearia_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_holidays TO barbearia_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON branch_holidays TO barbearia_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON appointment_holds TO barbearia_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON appointment_status_history TO barbearia_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON notification_jobs TO barbearia_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON support_tickets TO barbearia_app;
  END IF;
END$$;

COMMIT;
