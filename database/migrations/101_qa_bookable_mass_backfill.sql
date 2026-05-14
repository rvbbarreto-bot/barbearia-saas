-- Backfill massa QA em bases que já rodaram 099 antigo (sem professional_services / clientes fixos).
-- Idempotente. Rodar via migrate.sh ou manualmente após deploy.

BEGIN;

-- Garantir serviços ativos com IDs estáveis quando possível (por nome no tenant demo)
INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active) VALUES
('00000000-0000-4000-8000-000000004021', '00000000-0000-0000-0000-000000000001', 'Corte masculino', 30, 5000, true),
('00000000-0000-4000-8000-000000004022', '00000000-0000-0000-0000-000000000001', 'Barba', 30, 3500, true),
('00000000-0000-4000-8000-000000004023', '00000000-0000-0000-0000-000000000001', 'Corte + Barba', 60, 8000, true)
ON CONFLICT (tenant_id, name) DO UPDATE
SET active = true;

INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in, is_vip) VALUES
('00000000-0000-4000-8000-000000004031', '00000000-0000-0000-0000-000000000001', 'Cliente QA A', '5511999990001', true, false),
('00000000-0000-4000-8000-000000004032', '00000000-0000-0000-0000-000000000001', 'Cliente QA B', '5511999990002', true, false)
ON CONFLICT (tenant_id, phone) DO UPDATE
SET name = EXCLUDED.name, whatsapp_opt_in = true;

INSERT INTO professional_services (tenant_id, professional_id, service_id)
SELECT p.tenant_id, p.id, s.id
FROM professionals p
JOIN services s ON s.tenant_id = p.tenant_id
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.active = true
  AND s.active = true
ON CONFLICT DO NOTHING;

INSERT INTO business_hours (tenant_id, professional_id, weekday, starts_at, ends_at, slot_interval_minutes, active)
SELECT
  p.tenant_id,
  p.id,
  d.weekday,
  '09:00:00'::time,
  '18:00:00'::time,
  30,
  true
FROM professionals p
CROSS JOIN (VALUES (1), (2), (3), (4), (5), (6)) AS d(weekday)
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND p.active = true
  AND NOT EXISTS (
    SELECT 1 FROM business_hours bh
    WHERE bh.tenant_id = p.tenant_id AND bh.professional_id = p.id AND bh.weekday = d.weekday
  );

INSERT INTO users (tenant_id, name, email, password_hash, role, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Atendente Demo',
  'atendente@demo.local',
  '$2b$10$yeVnSfPaHFmBAG3wrKlGFe5p64O0yYj3SU5nIrsCfUngqp/hcocba',
  'attendant',
  true
)
ON CONFLICT (tenant_id, email) DO UPDATE SET role = EXCLUDED.role, is_active = true;

COMMIT;
