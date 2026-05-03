CREATE TABLE professional_recurring_time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  reason text,
  active boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);

ALTER TABLE professional_recurring_time_off ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_professional_recurring_time_off
  ON professional_recurring_time_off
  USING (tenant_id = app_tenant_id());

CREATE INDEX idx_professional_recurring_time_off_lookup
  ON professional_recurring_time_off(tenant_id, professional_id, weekday, active);
