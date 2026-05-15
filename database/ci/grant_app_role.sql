-- Role de aplicação sem superuser (CI: alinha senha com DATABASE_URL do workflow).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app') THEN
    CREATE ROLE barbearia_app WITH LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE barbearia_app WITH LOGIN PASSWORD 'barbearia_test_password' NOSUPERUSER NOBYPASSRLS;

GRANT CONNECT ON DATABASE barbearia_saas_test TO barbearia_app;
GRANT USAGE ON SCHEMA public TO barbearia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO barbearia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO barbearia_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO barbearia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO barbearia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO barbearia_app;
