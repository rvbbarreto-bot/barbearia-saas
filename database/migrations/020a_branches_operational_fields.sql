-- P0 — Reforço idempotente da tabela `branches` (base criada em 009_phase4_operational_minimum.sql).
-- Ordem lexicográfica (ls … | sort): 020_* < 020a_* < 021_* → esta migration executa ANTES de
-- 021_commission_and_daily_closing.sql, garantindo colunas/índices alinhados ao consolidado V4
-- sem depender de um hipotético 022 posterior.
--
-- Modelo V4: flag operacional continua na coluna `active` (sinônimo funcional de is_active do doc).
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.branches') IS NULL THEN
    RAISE EXCEPTION 'P0-001: tabela branches inexistente — aplique a migration 009 antes de 020a.';
  END IF;
END$$;

-- Campos adicionais (documentação consolidada / operação multi-unidade)
ALTER TABLE branches ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS postal_code text;

-- Timezone padrão Brasil; NOT NULL após backfill
UPDATE branches
SET timezone = 'America/Sao_Paulo'
WHERE timezone IS NULL OR btrim(timezone) = '';

ALTER TABLE branches
  ALTER COLUMN timezone SET DEFAULT 'America/Sao_Paulo';

ALTER TABLE branches
  ALTER COLUMN timezone SET NOT NULL;

-- Código único por tenant quando informado (permite vários NULL)
CREATE UNIQUE INDEX IF NOT EXISTS branches_tenant_code_uq
  ON branches (tenant_id, code)
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_branches_tenant_active
  ON branches (tenant_id, active)
  WHERE active = true;

-- RLS / FORCE já aplicados na 009 — reforço idempotente
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_branches ON branches;
CREATE POLICY tenant_isolation_branches ON branches
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

-- Trigger updated_at (lista da 009 já inclui branches; garante após novas colunas)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.branches'::regclass
      AND tgname = 'branches_set_updated_at'
  ) THEN
    CREATE TRIGGER branches_set_updated_at
    BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON branches TO barbearia_app;
  END IF;
END$$;

COMMIT;
