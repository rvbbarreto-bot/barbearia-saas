-- Comissões (regras + lançamentos) e fechamento diário consolidado por tenant/unidade/profissional.
BEGIN;

CREATE TABLE IF NOT EXISTS commission_rules (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id               uuid REFERENCES branches(id) ON DELETE CASCADE,
  professional_id       uuid REFERENCES professionals(id) ON DELETE CASCADE,
  service_id              uuid REFERENCES services(id) ON DELETE CASCADE,
  rule_kind               text NOT NULL CHECK (rule_kind IN ('percent', 'fixed_cents')),
  percent_basis_points    int CHECK (
    percent_basis_points IS NULL OR (percent_basis_points >= 0 AND percent_basis_points <= 10000)
  ),
  fixed_cents             int CHECK (fixed_cents IS NULL OR fixed_cents >= 0),
  priority                int NOT NULL DEFAULT 0,
  active                  boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (rule_kind = 'percent' AND percent_basis_points IS NOT NULL AND fixed_cents IS NULL)
    OR (rule_kind = 'fixed_cents' AND fixed_cents IS NOT NULL AND percent_basis_points IS NULL)
  )
);

COMMENT ON TABLE commission_rules IS 'Escopo: branch_id/professional_id/service_id nulos = wildcard ao nível do tenant.';
COMMENT ON COLUMN commission_rules.percent_basis_points IS 'Percentual em basis points (10000 = 100%).';

CREATE INDEX IF NOT EXISTS idx_commission_rules_tenant_active
  ON commission_rules (tenant_id) WHERE active = true;

CREATE TABLE IF NOT EXISTS commission_entries (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id          uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  professional_id         uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  branch_id               uuid REFERENCES branches(id) ON DELETE SET NULL,
  service_id              uuid REFERENCES services(id) ON DELETE SET NULL,
  commission_rule_id      uuid REFERENCES commission_rules(id) ON DELETE SET NULL,
  base_amount_cents       int NOT NULL CHECK (base_amount_cents >= 0),
  commission_cents        int NOT NULL CHECK (commission_cents >= 0),
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, appointment_id)
);

COMMENT ON TABLE commission_entries IS 'Gerado apenas quando appointment fica completed; cancel/no-show não dispara criação.';

CREATE INDEX IF NOT EXISTS idx_commission_entries_tenant_prof_status
  ON commission_entries (tenant_id, professional_id, status);

CREATE INDEX IF NOT EXISTS idx_commission_entries_tenant_created
  ON commission_entries (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS cash_closings (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id                    uuid REFERENCES branches(id) ON DELETE SET NULL,
  professional_id              uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  closing_date                 date NOT NULL,
  appointments_completed_count int NOT NULL DEFAULT 0 CHECK (appointments_completed_count >= 0),
  revenue_service_cents        bigint NOT NULL DEFAULT 0 CHECK (revenue_service_cents >= 0),
  commission_pending_cents     bigint NOT NULL DEFAULT 0 CHECK (commission_pending_cents >= 0),
  commission_approved_cents    bigint NOT NULL DEFAULT 0 CHECK (commission_approved_cents >= 0),
  commission_paid_cents        bigint NOT NULL DEFAULT 0 CHECK (commission_paid_cents >= 0),
  computed_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE cash_closings IS 'Snapshot derivado: recomputável por data (timezone tenant); uma linha por profissional/unidade/dia.';

CREATE UNIQUE INDEX IF NOT EXISTS cash_closings_slot_uq ON cash_closings (
  tenant_id,
  closing_date,
  professional_id,
  COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE INDEX IF NOT EXISTS idx_cash_closings_tenant_date ON cash_closings (tenant_id, closing_date DESC);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['commission_rules', 'commission_entries', 'cash_closings']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      tbl, tbl
    );
  END LOOP;
END$$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['commission_rules', 'commission_entries', 'cash_closings']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.' || tbl) AND tgname = tbl || '_set_updated_at'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
        tbl || '_set_updated_at', tbl
      );
    END IF;
  END LOOP;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON commission_rules TO barbearia_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON commission_entries TO barbearia_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON cash_closings TO barbearia_app;
  END IF;
END$$;

COMMIT;
