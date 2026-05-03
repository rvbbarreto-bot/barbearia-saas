-- ═══════════════════════════════════════════════════════════════
-- Migration 016 — Recall promocional por serviço, templates e registo
-- • services: recall_kind + janela custom (estética/química)
-- • notification_templates: mensagens por template_key + aprovação
-- • recall_sends: envio/cancelamento e dedupe por agendamento concluído
-- ═══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS recall_kind text
    CHECK (recall_kind IS NULL OR recall_kind IN ('corte', 'barba', 'sobrancelha', 'estetica_quimica'));

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS recall_min_days int
    CHECK (recall_min_days IS NULL OR recall_min_days >= 1);

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS recall_max_days int
    CHECK (recall_max_days IS NULL OR recall_max_days >= 1);

COMMENT ON COLUMN services.recall_kind IS 'Janela predefinida V4; estetica_quimica usa recall_min_days/recall_max_days.';
COMMENT ON COLUMN services.recall_min_days IS 'Obrigatório para estetica_quimica; opcional override para outros.';

DO $$
BEGIN
  ALTER TABLE services ADD CONSTRAINT services_recall_window_order
    CHECK (
      recall_min_days IS NULL OR recall_max_days IS NULL OR recall_min_days <= recall_max_days
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

CREATE TABLE IF NOT EXISTS notification_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_key    text NOT NULL,
  channel         text NOT NULL DEFAULT 'whatsapp'
                    CHECK (channel IN ('whatsapp')),
  body_template   text NOT NULL,
  approval_status text NOT NULL DEFAULT 'draft'
                    CHECK (approval_status IN ('draft', 'approved', 'rejected')),
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, template_key, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_tenant_key
  ON notification_templates (tenant_id, template_key) WHERE active = true;

CREATE TABLE IF NOT EXISTS recall_sends (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id            uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  source_appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id             uuid REFERENCES services(id) ON DELETE SET NULL,
  template_id            uuid REFERENCES notification_templates(id) ON DELETE SET NULL,
  idempotency_key        text NOT NULL,
  sent_at                timestamptz,
  cancelled_at           timestamptz,
  last_error             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_appointment_id),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_recall_sends_tenant_sent ON recall_sends (tenant_id, sent_at DESC);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates FORCE ROW LEVEL SECURITY;

ALTER TABLE recall_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_sends FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_notification_templates ON notification_templates;
CREATE POLICY tenant_isolation_notification_templates ON notification_templates
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_recall_sends ON recall_sends;
CREATE POLICY tenant_isolation_recall_sends ON recall_sends
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DO $$
DECLARE
  tbl text := 'notification_templates';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.' || tbl) AND tgname = tbl || '_set_updated_at'
  ) THEN
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      tbl || '_set_updated_at', tbl
    );
  END IF;
END$$;

DO $$
DECLARE
  tbl text := 'recall_sends';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.' || tbl) AND tgname = tbl || '_set_updated_at'
  ) THEN
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      tbl || '_set_updated_at', tbl
    );
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON notification_templates TO barbearia_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON recall_sends TO barbearia_app;
  END IF;
END$$;

COMMIT;
