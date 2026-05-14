-- Corrige UUIDs de clientes QA para formato aceito por Zod (RFC 4122 variant).
BEGIN;

DELETE FROM customers
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND phone IN ('5511999990001', '5511999990002');

INSERT INTO customers (id, tenant_id, name, phone, whatsapp_opt_in, is_vip) VALUES
('00000000-0000-4000-8000-000000004031', '00000000-0000-0000-0000-000000000001', 'Cliente QA A', '5511999990001', true, false),
('00000000-0000-4000-8000-000000004032', '00000000-0000-0000-0000-000000000001', 'Cliente QA B', '5511999990002', true, false)
ON CONFLICT (tenant_id, phone) DO NOTHING;

COMMIT;
