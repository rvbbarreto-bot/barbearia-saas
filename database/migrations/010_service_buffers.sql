-- Buffers de calendário (V4 — PDF: buffer_before/buffer_after; modelo físico *_minutes para aderência à coluna duration_minutes).
--
-- · Idempotente em DEV (IF NOT EXISTS, DROP CONSTRAINT IF EXISTS).
-- · Duração de ocupação de agenda efetiva: buffer_before + duration_minutes + buffer_after.

BEGIN;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS buffer_before_minutes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buffer_after_minutes int NOT NULL DEFAULT 0;

ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_buffer_before_chk;

ALTER TABLE services
  ADD CONSTRAINT services_buffer_before_chk CHECK (buffer_before_minutes BETWEEN 0 AND 240);

ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_buffer_after_chk;

ALTER TABLE services
  ADD CONSTRAINT services_buffer_after_chk CHECK (buffer_after_minutes BETWEEN 0 AND 240);

COMMENT ON COLUMN services.buffer_before_minutes IS 'Buffer antes da janela nominal do serviço (minutos; PDF buffer_before).';
COMMENT ON COLUMN services.buffer_after_minutes IS 'Buffer após a janela nominal do serviço (minutos; PDF buffer_after).';

COMMIT;
