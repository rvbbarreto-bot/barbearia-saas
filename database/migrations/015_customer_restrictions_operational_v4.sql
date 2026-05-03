-- V4: restrições de cliente (sinal / só humano) após reincidência de no-show.
BEGIN;

CREATE TABLE IF NOT EXISTS customer_restrictions (
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id        uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  requires_deposit   boolean NOT NULL DEFAULT false,
  manual_booking_only boolean NOT NULL DEFAULT false,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_restrictions_tenant ON customer_restrictions (tenant_id);

ALTER TABLE customer_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_restrictions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_customer_restrictions ON customer_restrictions;
CREATE POLICY tenant_isolation_customer_restrictions ON customer_restrictions
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON customer_restrictions TO barbearia_app;
  END IF;
END$$;

COMMIT;
