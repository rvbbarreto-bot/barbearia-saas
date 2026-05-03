-- Liga utilizadores `professional` aos registos em `professionals` (tenant demo).
-- Requer migration `011_user_professional_link.sql` aplicada.
-- Idempotente: ON CONFLICT em (tenant_id, email); UPDATE por slug.

INSERT INTO users (tenant_id, name, email, password_hash, role, is_active)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Fred Barbeiro',
    'fred.barbeiro@demo.local',
    '$2b$10$yeVnSfPaHFmBAG3wrKlGFe5p64O0yYj3SU5nIrsCfUngqp/hcocba',
    'professional',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'João Barbeiro',
    'joao.barbeiro@demo.local',
    '$2b$10$yeVnSfPaHFmBAG3wrKlGFe5p64O0yYj3SU5nIrsCfUngqp/hcocba',
    'professional',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Robson Barbeiro',
    'robson.barbeiro@demo.local',
    '$2b$10$yeVnSfPaHFmBAG3wrKlGFe5p64O0yYj3SU5nIrsCfUngqp/hcocba',
    'professional',
    true
  )
ON CONFLICT (tenant_id, email) DO UPDATE
SET
  role       = EXCLUDED.role,
  name       = EXCLUDED.name,
  is_active  = true,
  updated_at = now();

UPDATE users u
SET professional_id = p.id,
    updated_at       = now()
FROM professionals p
WHERE u.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.tenant_id = u.tenant_id
  AND u.email = 'fred.barbeiro@demo.local'
  AND p.slug = 'fred';

UPDATE users u
SET professional_id = p.id,
    updated_at       = now()
FROM professionals p
WHERE u.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.tenant_id = u.tenant_id
  AND u.email = 'joao.barbeiro@demo.local'
  AND p.slug = 'joao';

UPDATE users u
SET professional_id = p.id,
    updated_at       = now()
FROM professionals p
WHERE u.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.tenant_id = u.tenant_id
  AND u.email = 'robson.barbeiro@demo.local'
  AND p.slug = 'robson';
