-- Origens adicionais para painel operacional (walk-in, admin).
-- ALTER TYPE ADD VALUE não pode ser revertido; valores idempotentes.
ALTER TYPE channel ADD VALUE IF NOT EXISTS 'walk_in';
ALTER TYPE channel ADD VALUE IF NOT EXISTS 'admin';
