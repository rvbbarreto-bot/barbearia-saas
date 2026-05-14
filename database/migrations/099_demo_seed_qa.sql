-- Seed demo QA — aplicado no primeiro boot do Postgres via docker-entrypoint-initdb.d
-- Idempotente (ON CONFLICT / DO NOTHING onde aplicável).
-- Credenciais: ver QA_PACKAGE_BARBEARIA/04_MASSA_DE_DADOS e docs/QA_AMBIENTE_LOCAL.md
-- UUIDs fixos (tenant ...0001): profissionais ...4011-4013, serviços ...4021-4023, clientes ...4031-4032 (RFC variant v4)

INSERT INTO tenants (id, legal_name, trade_name, document, plan_code, status)
VALUES ('00000000-0000-0000-0000-000000000001','Demo Barbearia Ltda','Barão da Navalha','00000000000100','premium','active')
ON CONFLICT (id) DO NOTHING;

UPDATE tenants
SET webhook_token = 'demo_webhook_token_change_me'
WHERE id = '00000000-0000-0000-0000-000000000001';

INSERT INTO users (tenant_id, name, email, password_hash, role, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Admin Demo',
  'admin@demo.local',
  '$2b$10$yeVnSfPaHFmBAG3wrKlGFe5p64O0yYj3SU5nIrsCfUngqp/hcocba',
  'tenant_owner',
  true
)
ON CONFLICT (tenant_id, email) DO NOTHING;

INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, active) VALUES
('00000000-0000-4000-8000-000000004021', '00000000-0000-0000-0000-000000000001', 'Corte masculino', 30, 5000, true),
('00000000-0000-4000-8000-000000004022', '00000000-0000-0000-0000-000000000001', 'Barba', 30, 3500, true),
('00000000-0000-4000-8000-000000004023', '00000000-0000-0000-0000-000000000001', 'Corte + Barba', 60, 8000, true)
ON CONFLICT (tenant_id, name) DO UPDATE
SET active = true, duration_minutes = EXCLUDED.duration_minutes, price_cents = EXCLUDED.price_cents;

INSERT INTO professionals (id, tenant_id, name, slug, active) VALUES
('00000000-0000-4000-8000-000000004011', '00000000-0000-0000-0000-000000000001', 'Fred', 'fred', true),
('00000000-0000-4000-8000-000000004012', '00000000-0000-0000-0000-000000000001', 'João', 'joao', true),
('00000000-0000-4000-8000-000000004013', '00000000-0000-0000-0000-000000000001', 'Robson', 'robson', true)
ON CONFLICT (tenant_id, slug) DO UPDATE
SET name = EXCLUDED.name, active = true;

UPDATE professionals
SET timezone = 'America/Sao_Paulo'
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

-- Vínculo profissional ↔ serviço (obrigatório para POST /appointments — loadBookableService)
INSERT INTO professional_services (tenant_id, professional_id, service_id)
SELECT
  '00000000-0000-0000-0000-000000000001',
  p.id,
  s.id
FROM professionals p
CROSS JOIN services s
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND s.tenant_id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;

-- Clientes QA (fluxo feliz + conflito/remarcação)
INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in, is_vip) VALUES
('00000000-0000-4000-8000-000000004031', '00000000-0000-0000-0000-000000000001', 'Cliente QA A', '5511999990001', true, false),
('00000000-0000-4000-8000-000000004032', '00000000-0000-0000-0000-000000000001', 'Cliente QA B', '5511999990002', true, false)
ON CONFLICT (tenant_id, phone) DO UPDATE
SET name = EXCLUDED.name, whatsapp_opt_in = true;

-- Horário comercial (seg–sáb 09:00–18:00) para disponibilidade / documentação QA
INSERT INTO business_hours (tenant_id, professional_id, weekday, starts_at, ends_at, slot_interval_minutes, active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  p.id,
  d.weekday,
  '09:00:00'::time,
  '18:00:00'::time,
  30,
  true
FROM professionals p
CROSS JOIN (VALUES (1), (2), (3), (4), (5), (6)) AS d(weekday)
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM business_hours bh
    WHERE bh.tenant_id = p.tenant_id AND bh.professional_id = p.id AND bh.weekday = d.weekday
  );

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
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Atendente Demo',
    'atendente@demo.local',
    '$2b$10$yeVnSfPaHFmBAG3wrKlGFe5p64O0yYj3SU5nIrsCfUngqp/hcocba',
    'attendant',
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

-- Evolution: instância demo (inbound CT-093 + routing outbound) — `tenants.webhook_token` já definido acima
INSERT INTO tenant_integrations (tenant_id, provider, config, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'whatsapp_evolution',
  '{"instance_name":"demo-qa-inbound"}'::jsonb,
  true
)
ON CONFLICT (tenant_id, provider) DO UPDATE
SET config = EXCLUDED.config, is_active = EXCLUDED.is_active;
