-- Ligação opcional utilizador ↔ profissional (ex.: barbeiro vê a própria agenda no painel).
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES professionals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_tenant_professional
  ON users (tenant_id, professional_id)
  WHERE professional_id IS NOT NULL;

COMMENT ON COLUMN users.professional_id IS 'Quando preenchido, o utilizador com role professional está associado a este registo em professionals.';

COMMIT;
