-- P2.1 — Trilha operacional normalizada (eventos críticos; sem segredos em metadata).
-- Idempotente: IF NOT EXISTS em tabela e policies.

CREATE TABLE IF NOT EXISTS operational_audit_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type       text NOT NULL,
  entity_id         uuid,
  event_type        text NOT NULL,
  actor_user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role        text,
  source            text NOT NULL DEFAULT 'api',
  request_id        text,
  correlation_id    text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operational_audit_tenant_created
  ON operational_audit_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_audit_tenant_event
  ON operational_audit_events (tenant_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_audit_entity
  ON operational_audit_events (tenant_id, entity_type, entity_id, created_at DESC);

ALTER TABLE operational_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_audit_events FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'operational_audit_events' AND policyname = 'tenant_isolation_operational_audit_select'
  ) THEN
    CREATE POLICY tenant_isolation_operational_audit_select ON operational_audit_events
      FOR SELECT USING (tenant_id = app_tenant_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'operational_audit_events' AND policyname = 'tenant_isolation_operational_audit_insert'
  ) THEN
    CREATE POLICY tenant_isolation_operational_audit_insert ON operational_audit_events
      FOR INSERT WITH CHECK (tenant_id = app_tenant_id());
  END IF;
END $$;

GRANT SELECT, INSERT ON operational_audit_events TO barbearia_app;
