-- Handoff / conversas: atribuição, motivo V4, encerramento com solução.
BEGIN;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS resolution_notes text;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS handoff_reason_code text;

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant_open
  ON support_tickets (tenant_id, status, updated_at DESC)
  WHERE status IN ('open', 'in_progress', 'waiting_customer');

COMMIT;
