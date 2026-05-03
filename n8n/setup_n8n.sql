-- === N8N BARBEARIA SETUP ===

-- 1. API Key para acesso programático
INSERT INTO public.user_api_keys (id, "userId", label, "apiKey", "createdAt", "updatedAt", audience)
VALUES (
  'barbearia-key-001',
  'b94848a8-c6a0-4da9-8cad-be2f068291fb',
  'barbearia-saas',
  'n8n-barbearia-key-2026-secret',
  NOW(),
  NOW(),
  'public-api'
)
ON CONFLICT (id) DO UPDATE SET "apiKey" = EXCLUDED."apiKey", "updatedAt" = NOW();

-- 2. Variáveis globais
-- API_BASE_URL: URL da API acessível de dentro do evo_n8n
-- Agora que conectamos à rede barbearia-saas_default, podemos usar o nome do container
INSERT INTO public.variables (id, key, type, value)
VALUES
  ('var-api-base-url',       'API_BASE_URL',        'string', 'http://barbearia-api:3000'),
  ('var-evolution-api-url',  'EVOLUTION_API_URL',   'string', 'http://evolution_api:8080'),
  ('var-evolution-api-key',  'EVOLUTION_API_KEY',   'string', '123456'),
  ('var-default-tenant-id',  'DEFAULT_TENANT_ID',   'string', '00000000-0000-0000-0000-000000000001'),
  ('var-default-tenant-slug','DEFAULT_TENANT_SLUG',  'string', 'barbearia-demo')
ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value;

SELECT 'API KEY:' as tipo, "apiKey" as valor FROM public.user_api_keys WHERE id = 'barbearia-key-001';
SELECT 'VARS:' as tipo, key, value FROM public.variables WHERE key LIKE '%BARBEARIA%' OR key IN ('API_BASE_URL','EVOLUTION_API_URL','EVOLUTION_API_KEY','DEFAULT_TENANT_ID','DEFAULT_TENANT_SLUG');
