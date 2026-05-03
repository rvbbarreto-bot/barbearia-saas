INSERT INTO tenants (id, legal_name, trade_name, document, plan_code, status)
VALUES ('00000000-0000-0000-0000-000000000001','Demo Barbearia Ltda','Barão da Navalha','00000000000100','premium','active');

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

INSERT INTO services (tenant_id, name, duration_minutes, price_cents) VALUES
('00000000-0000-0000-0000-000000000001','Corte masculino',30,5000),
('00000000-0000-0000-0000-000000000001','Barba',30,3500),
('00000000-0000-0000-0000-000000000001','Corte + Barba',60,8000);

INSERT INTO professionals (tenant_id, name, slug) VALUES
('00000000-0000-0000-0000-000000000001','Fred','fred'),
('00000000-0000-0000-0000-000000000001','João','joao'),
('00000000-0000-0000-0000-000000000001','Robson','robson');

UPDATE professionals
SET timezone = 'America/Sao_Paulo'
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
