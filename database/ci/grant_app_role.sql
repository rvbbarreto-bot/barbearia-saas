-- Role de aplicação sem superuser (CI e testes de integração com RLS real).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app') THEN
    CREATE ROLE barbearia_app WITH LOGIN PASSWORD 'barbearia_test_password' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE barbearia_saas_test TO barbearia_app;
GRANT USAGE ON SCHEMA public TO barbearia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO barbearia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO barbearia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO barbearia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO barbearia_app;
