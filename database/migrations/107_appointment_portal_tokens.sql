-- Portal tokenizado: acesso público read-only + confirm/cancel com token de uso único limitado no tempo.
CREATE TABLE IF NOT EXISTS appointment_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_portal_tokens_appointment_fk
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT appointment_portal_tokens_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_appointment_portal_tokens_lookup
  ON appointment_portal_tokens (token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointment_portal_tokens_tenant_appt
  ON appointment_portal_tokens (tenant_id, appointment_id);

ALTER TABLE appointment_portal_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointment_portal_tokens_tenant_isolation ON appointment_portal_tokens
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
