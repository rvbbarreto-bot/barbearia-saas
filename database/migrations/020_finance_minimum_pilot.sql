-- Financeiro mínimo (piloto): preço do serviço, sinal, saldo, liquidação e relatório diário.
-- Fechamento de caixa (cash_closings) fora deste escopo.
BEGIN;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_show_marked_at timestamptz;

COMMENT ON COLUMN appointments.completed_at IS 'Preenchido ao passar a completed (relatório diário).';
COMMENT ON COLUMN appointments.cancelled_at IS 'Preenchido ao cancelar.';
COMMENT ON COLUMN appointments.no_show_marked_at IS 'Preenchido ao registar no-show.';

CREATE TABLE IF NOT EXISTS appointment_financials (
  tenant_id                     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id                uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_price_cents           int NOT NULL CHECK (service_price_cents >= 0),
  deposit_paid_cents            int NOT NULL DEFAULT 0 CHECK (deposit_paid_cents >= 0),
  discount_cents                int NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  discount_reason               text,
  discount_applied_by_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  balance_payment_method        text CHECK (
    balance_payment_method IS NULL OR balance_payment_method IN ('cash', 'pix', 'debit', 'credit', 'other')
  ),
  balance_collected_cents       int NOT NULL DEFAULT 0 CHECK (balance_collected_cents >= 0),
  deposit_recorded_at         timestamptz,
  settled_at                    timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, appointment_id),
  CHECK (deposit_paid_cents + discount_cents <= service_price_cents)
);

COMMENT ON TABLE appointment_financials IS 'Snapshot por agendamento: sinal conciliado com saldo (piloto).';
COMMENT ON COLUMN appointment_financials.discount_reason IS 'Obrigatório na API quando discount_cents > 0 (gerente/dono).';

CREATE INDEX IF NOT EXISTS idx_appointment_financials_settled_day
  ON appointment_financials (tenant_id, settled_at)
  WHERE settled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointment_financials_deposit_day
  ON appointment_financials (tenant_id, deposit_recorded_at)
  WHERE deposit_recorded_at IS NOT NULL;

ALTER TABLE appointment_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_financials FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_appointment_financials ON appointment_financials;
CREATE POLICY tenant_isolation_appointment_financials ON appointment_financials
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DO $$
DECLARE
  tbl text := 'appointment_financials';
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON appointment_financials TO barbearia_app;
  END IF;
END$$;

COMMIT;
