#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
#  migrate.sh — Aplica migrations em ordem no banco de dados
#
#  Uso:
#    ./migrate.sh                       # aplica todas as migrations
#    ./migrate.sh --seed                # aplica migrations + seed demo
#    ./migrate.sh --dry-run             # lista migrations sem aplicar
#
#  Variáveis de ambiente necessárias (lidas do .env ou exportadas):
#    POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
#    O banco deve estar acessível em localhost:5432 (ou via Docker Compose).
#
#  Sem psql local (mesma tabela _migrations, via docker compose exec):
#    npm run db:migrate
#    (implementação: scripts/migrate-docker.mjs)
# ─────────────────────────────────────────────────────────────────────────────
set -e

SEED=false
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --seed)    SEED=true ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

# Carregar .env se existir e variáveis não estiverem definidas
if [ -f ".env" ]; then
  # shellcheck disable=SC1091
  set -a
  . ./.env
  set +a
fi

DB_USER="${POSTGRES_USER:-barbearia}"
DB_NAME="${POSTGRES_DB:-barbearia_saas}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
export PGPASSWORD="${POSTGRES_PASSWORD}"

if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "ERRO: POSTGRES_PASSWORD nao definido. Configure no .env ou exporte a variavel." >&2
  exit 1
fi

MIGRATIONS_DIR="./database/migrations"
SEEDS_DIR="./database/seeds"

echo "=== Barbearia SaaS — Migrations ==="
echo "Banco  : $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
echo "Diret. : $MIGRATIONS_DIR"
echo ""

# Verificar conectividade
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
  echo "ERRO: nao foi possivel conectar ao banco. Verifique se o postgres esta rodando." >&2
  exit 1
fi

# Criar tabela de controle de migrations se nao existir
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
  CREATE TABLE IF NOT EXISTS _migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
" > /dev/null

# Aplicar migrations em ordem
APPLIED=0
SKIPPED=0

for FILE in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
  FILENAME=$(basename "$FILE")

  ALREADY=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT COUNT(*) FROM _migrations WHERE filename = '$FILENAME'")

  if [ "$ALREADY" = "1" ]; then
    echo "  SKIP  $FILENAME (ja aplicada)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [ "$DRY_RUN" = "true" ]; then
    echo "  DRY   $FILENAME"
    continue
  fi

  echo "  APPLY $FILENAME ..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$FILE"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
    "INSERT INTO _migrations (filename) VALUES ('$FILENAME') ON CONFLICT DO NOTHING;" > /dev/null
  APPLIED=$((APPLIED + 1))
  echo "  OK    $FILENAME"
done

echo ""
echo "Migrations: $APPLIED aplicadas, $SKIPPED ja existentes."

# Aplicar seed demo se solicitado
if [ "$SEED" = "true" ] && [ "$DRY_RUN" = "false" ]; then
  SEED_FILE="$SEEDS_DIR/001_demo.sql"
  if [ -f "$SEED_FILE" ]; then
    echo ""
    echo "Aplicando seed demo: $SEED_FILE ..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SEED_FILE" || \
      echo "AVISO: seed pode ter falhado (dados ja existem?)."
    echo "OK  seed demo aplicado."
  else
    echo "AVISO: $SEED_FILE nao encontrado."
  fi
fi

echo ""
echo "Concluido."
