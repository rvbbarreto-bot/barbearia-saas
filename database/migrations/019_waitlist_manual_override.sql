-- Waitlist, VIP cliente, encaixe manual (excluído do GiST de sobreposição).
BEGIN;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_vip boolean NOT NULL DEFAULT false;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS manual_override_reason text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS manual_override_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS manual_override_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN appointments.manual_override IS 'true = encaixe autorizado (manager/admin); não entra no GiST de overlap.';
COMMENT ON COLUMN appointments.manual_override_reason IS 'Motivo obrigatório informado pelo actor em encaixe manual.';

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id          uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_id           uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  professional_id      uuid REFERENCES professionals(id) ON DELETE SET NULL,
  preferred_date_from  date NOT NULL,
  preferred_date_to    date NOT NULL,
  shift_preference     text NOT NULL DEFAULT 'any'
                         CHECK (shift_preference IN ('morning', 'afternoon', 'evening', 'any')),
  /** Prioridade por sinal/política (operador ou integração). */
  deposit_priority     boolean NOT NULL DEFAULT false,
  status               text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'cancelled', 'converted')),
  metadata             jsonb NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (preferred_date_to >= preferred_date_from)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_active_lookup
  ON waitlist_entries (tenant_id, status, service_id, professional_id)
  WHERE status = 'active';

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_waitlist_entries ON waitlist_entries;
CREATE POLICY tenant_isolation_waitlist_entries ON waitlist_entries
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DO $$
DECLARE
  tbl text := 'waitlist_entries';
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON waitlist_entries TO barbearia_app;
  END IF;
END$$;

-- GiST: ignorar linhas com manual_override (encaixe autorizado pode sobrepor).
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_no_time_overlap;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_time_overlap
    EXCLUDE USING gist (
      tenant_id WITH =,
      professional_id WITH =,
      period WITH &&
    )
    WHERE (
      COALESCE(manual_override, false) = false
      AND status IN (
        'offered', 'hold', 'awaiting_confirmation', 'awaiting_payment', 'confirmed',
        'checked_in', 'in_service', 'completed', 'no_show_pending'
      )
    );

COMMIT;
