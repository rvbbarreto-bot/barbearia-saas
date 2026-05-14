-- Utilizador platform_admin para QA (lista GET /api/v1/tenants).
-- Idempotente: aplica em volumes novos (initdb) e em bases existentes via migrate.sh.
-- Credenciais: QA_PACKAGE_BARBEARIA/04_MASSA_DE_DADOS/MASSA_DE_DADOS.md
-- JWT sem tenant_id: nas chamadas à API enviar x-tenant-id com UUID do tenant demo.

INSERT INTO users (tenant_id, name, email, password_hash, role, is_active)
VALUES (
  NULL,
  'Platform Admin QA',
  'platform.admin@demo.local',
  '$2b$10$yeVnSfPaHFmBAG3wrKlGFe5p64O0yYj3SU5nIrsCfUngqp/hcocba',
  'platform_admin',
  true
)
ON CONFLICT (email) DO UPDATE SET
  name            = EXCLUDED.name,
  role            = EXCLUDED.role,
  tenant_id       = EXCLUDED.tenant_id,
  password_hash   = EXCLUDED.password_hash,
  is_active       = true,
  updated_at      = now();
