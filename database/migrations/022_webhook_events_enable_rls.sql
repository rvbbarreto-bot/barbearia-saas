-- DEV/QA-05: webhook_events was created in 005 without ENABLE RLS; 006 only applied FORCE.
-- Without ENABLE, relrowsecurity stays false. Align with other tenant-scoped tables.

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'webhook_events' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON webhook_events
      USING      (tenant_id = app_tenant_id())
      WITH CHECK (tenant_id = app_tenant_id());
  END IF;
END $$;
