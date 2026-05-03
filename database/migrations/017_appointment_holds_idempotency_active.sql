-- Idempotência só para holds ativos: após expirar/converter, a mesma chave pode ser reutilizada.
BEGIN;

DROP INDEX IF EXISTS appointment_holds_idempotency;

CREATE UNIQUE INDEX IF NOT EXISTS appointment_holds_idempotency_active
  ON appointment_holds (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status = 'active';

COMMIT;
