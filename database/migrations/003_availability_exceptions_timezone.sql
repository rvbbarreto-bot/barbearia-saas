ALTER TABLE professionals
ADD COLUMN timezone text;

CREATE TABLE professional_time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

ALTER TABLE professional_time_off ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_professional_time_off ON professional_time_off USING (tenant_id = app_tenant_id());

CREATE INDEX idx_professional_time_off_period
  ON professional_time_off(tenant_id, professional_id, starts_at, ends_at)
  WHERE active = true;
