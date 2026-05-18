-- Seed opcional: tenant demo lava-rápido (somente se variável de ambiente QA estiver ativa em deploy manual).
-- Para DEV local, aplicar settings no tenant QA existente via script ou PATCH settings.

-- Exemplo de settings (não executa INSERT de tenant — documentação inline):
-- UPDATE tenant_settings
--    SET settings = settings || '{"vertical":"car_wash","car_wash":{"require_vehicle":true}}'::jsonb
--  WHERE tenant_id = '<uuid-tenant-demo>';

SELECT 1;
