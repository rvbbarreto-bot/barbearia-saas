-- GAP-03: usuario viewer para regressivo RBAC somente-leitura (idempotente)
INSERT INTO users (tenant_id, name, email, password_hash, role, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Viewer Demo',
  'viewer@demo.local',
  '$2b$10$yeVnSfPaHFmBAG3wrKlGFe5p64O0yYj3SU5nIrsCfUngqp/hcocba',
  'viewer',
  true
)
ON CONFLICT (tenant_id, email) DO UPDATE
SET
  role       = EXCLUDED.role,
  name       = EXCLUDED.name,
  is_active  = true,
  updated_at = now();
