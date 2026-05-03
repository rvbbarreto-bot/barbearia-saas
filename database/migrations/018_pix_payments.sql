-- Cobranças Pix (PSP) associadas a agendamentos em awaiting_payment
BEGIN;

CREATE TABLE IF NOT EXISTS pix_payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id        uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  hold_id               uuid REFERENCES appointment_holds(id) ON DELETE SET NULL,
  amount_cents          int NOT NULL CHECK (amount_cents > 0),
  currency              text NOT NULL DEFAULT 'BRL',
  status                text NOT NULL DEFAULT 'payment_pending'
                          CHECK (status IN (
                            'payment_pending',
                            'payment_paid',
                            'payment_expired',
                            'refunded',
                            'failed'
                          )),
  provider              text NOT NULL DEFAULT 'mock',
  provider_charge_id    text NOT NULL,
  copy_paste            text NOT NULL,
  qr_payload            text,
  expires_at            timestamptz NOT NULL,
  idempotency_key       text,
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, appointment_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS pix_payments_tenant_idempotency_active
  ON pix_payments (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pix_payments_provider_charge
  ON pix_payments (tenant_id, provider_charge_id);

CREATE INDEX IF NOT EXISTS idx_pix_payments_pending_expiry
  ON pix_payments (tenant_id, expires_at)
  WHERE status = 'payment_pending';

ALTER TABLE pix_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pix_payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_pix_payments ON pix_payments;
CREATE POLICY tenant_isolation_pix_payments ON pix_payments
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DO $$
DECLARE
  tbl text := 'pix_payments';
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON pix_payments TO barbearia_app;
  END IF;
END$$;

COMMIT;
