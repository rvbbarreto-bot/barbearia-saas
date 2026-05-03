-- ═══════════════════════════════════════════════════════════════
-- 008 — message_outbox hardening
--       • Adiciona customer_id, correlation_id, provider_response
--       • Corrige UNIQUE idempotency_key → tenant-scoped
--       • Corrige índice de polling (inclui 'processing' para recovery)
--       • Elimina possibilidade de status 'sending' (CHECK já correto)
-- ═══════════════════════════════════════════════════════════════
BEGIN;

-- ── 1. customer_id (rastreabilidade por cliente) ─────────────────────────────
ALTER TABLE message_outbox
  ADD COLUMN IF NOT EXISTS customer_id uuid
    REFERENCES customers(id) ON DELETE SET NULL;

-- ── 2. correlation_id (rastreabilidade cross-serviço) ────────────────────────
ALTER TABLE message_outbox
  ADD COLUMN IF NOT EXISTS correlation_id text;

-- ── 3. provider_response (resposta bruta da Evolution/outro provider) ─────────
ALTER TABLE message_outbox
  ADD COLUMN IF NOT EXISTS provider_response jsonb;

-- ── 4. Corrigir UNIQUE idempotency_key → tenant-scoped ───────────────────────
--    Antes: UNIQUE (idempotency_key)  — global, não permite mesmo key em tenants diferentes
--    Depois: índice parcial (tenant_id, idempotency_key) WHERE NOT NULL
ALTER TABLE message_outbox
  DROP CONSTRAINT IF EXISTS message_outbox_idempotency_key_key;

DROP INDEX IF EXISTS idx_outbox_idempotency;

--    Re-execução segura: IF NOT EXISTS (evita erro "relation already exists" após COMMIT anterior).
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_idempotency
  ON message_outbox (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 5. Índice de polling atualizado ──────────────────────────────────────────
--    Inclui 'processing' para reprocessar mensagens travadas após crash do worker.
--    DROP garante que versão antiga (idx_outbox_pending) e esta própria sejam
--    substituídas corretamente em qualquer re-execução (idempotência).
DROP INDEX IF EXISTS idx_outbox_pending;
DROP INDEX IF EXISTS idx_outbox_poll;

CREATE INDEX IF NOT EXISTS idx_outbox_poll
  ON message_outbox (next_retry_at, attempts, status)
  WHERE status IN ('pending', 'processing');

-- ── 6. Índice de lookup por tenant + correlation_id (dashboards, auditoria) ──
CREATE INDEX IF NOT EXISTS idx_outbox_correlation
  ON message_outbox (tenant_id, correlation_id)
  WHERE correlation_id IS NOT NULL;

-- ── 7. Índice de lookup por customer (histórico de mensagens) ─────────────────
CREATE INDEX IF NOT EXISTS idx_outbox_customer
  ON message_outbox (tenant_id, customer_id)
  WHERE customer_id IS NOT NULL;

COMMIT;
