#!/usr/bin/env bash
# Backup diário do PostgreSQL — restaure com: psql $DB_URL < arquivo.sql.gz | gunzip
set -euo pipefail

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_DB:=barbearia_saas}"
: "${POSTGRES_USER:=barbearia}"
: "${PGPASSWORD:?Variável PGPASSWORD não definida}"
: "${BACKUP_DIR:=/backups}"
: "${RETENTION_DAYS:=30}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] Iniciando dump: $BACKUP_FILE"

pg_dump \
  -h "$POSTGRES_HOST" \
  -p "$POSTGRES_PORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-password \
  --format=plain \
  --no-owner \
  --no-acl \
  | gzip -9 > "$BACKUP_FILE"

echo "[backup] Dump concluído: $(du -sh "$BACKUP_FILE" | cut -f1)"

# Limpeza de backups antigos
find "$BACKUP_DIR" -name "${POSTGRES_DB}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[backup] Backups anteriores a ${RETENTION_DAYS} dias removidos."

# Teste de integridade mínima
ROWS=$(gunzip -c "$BACKUP_FILE" | grep -c "INSERT INTO\|COPY " || true)
echo "[backup] Linhas de dados no dump: $ROWS"
if [[ $ROWS -lt 1 ]]; then
  echo "[backup] AVISO: dump parece vazio!"
  exit 1
fi

echo "[backup] Concluído com sucesso: $BACKUP_FILE"
