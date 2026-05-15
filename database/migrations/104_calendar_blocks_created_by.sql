-- P2.1 — Rastreabilidade de quem criou o bloqueio manual (alinhado ao conceito professional_time_blocks).

ALTER TABLE calendar_blocks ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_blocks_created_by ON calendar_blocks (created_by) WHERE created_by IS NOT NULL;
