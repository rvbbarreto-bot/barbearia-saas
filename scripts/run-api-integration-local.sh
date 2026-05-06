#!/usr/bin/env bash
# Sobe Postgres 16 + Redis 7 (Docker), aplica migrations, corre integração API.
# Uso: ./scripts/run-api-integration-local.sh   [--keep-alive]  [--skip-seed]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/artifacts/devqa-07"
mkdir -p "$ART"
ID="$(openssl rand -hex 5 2>/dev/null || echo local$$)"
LOG="$ART/integration-${ID}.log"
PG_NAME="bb-int-pg-${ID}"
RD_NAME="bb-int-rd-${ID}"
PG_PORT=$((55430 + RANDOM % 150))
RD_PORT=$((56380 + RANDOM % 150))

log() { echo "$(date -Iseconds) $*" | tee -a "$LOG"; }

cleanup() {
  if [[ "${KEEP_ALIVE:-0}" != "1" ]]; then
    docker rm -f "$PG_NAME" "$RD_NAME" 2>/dev/null || true
    log "Contentores removidos (KEEP_ALIVE=1 para manter)."
  else
    log "KEEP_ALIVE=1 — contentores $PG_NAME $RD_NAME mantidos."
  fi
  log "Log: $LOG"
}
trap cleanup EXIT

KEEP_ALIVE=0
APPLY_SEED=0
for a in "$@"; do
  case "$a" in
    --keep-alive) KEEP_ALIVE=1 ;;
    --apply-seed) APPLY_SEED=1 ;;
  esac
done

log "=== DEV/QA-05 API integration harness ==="
log "Postgres $PG_NAME :$PG_PORT | Redis $RD_NAME :$RD_PORT"

docker run -d --name "$PG_NAME" \
  -e POSTGRES_USER=barbearia \
  -e POSTGRES_PASSWORD=barbearia_test_password \
  -e POSTGRES_DB=barbearia_saas_test \
  -p "${PG_PORT}:5432" \
  postgres:16-alpine >/dev/null

docker run -d --name "$RD_NAME" -p "${RD_PORT}:6379" redis:7-alpine >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$PG_NAME" pg_isready -U barbearia -d barbearia_saas_test >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Role barbearia_app (migration 006) — RLS não aplica ao superuser `barbearia`.
export DATABASE_URL="postgres://barbearia_app:barbearia_app_dev_password@127.0.0.1:${PG_PORT}/barbearia_saas_test"
export REDIS_URL="redis://127.0.0.1:${RD_PORT}"
export JWT_SECRET='devqa03-integration-secret-32chars-minimum-ok'
export NODE_ENV=test
export PORT=3999
export RECALL_ENABLED=true
export PIX_REAL_PROVIDER_ENABLED=false
export WAITLIST_SLOT_NOTIFY_ENABLED=false
export WAITLIST_SWEEP_ENABLED=false
export CORS_ORIGIN='*'
export OUTBOX_POLL_INTERVAL_MS=60000
export OUTBOX_CONCURRENCY=1

log "Aplicar migrations…"
for f in $(ls "$ROOT/database/migrations/"*.sql 2>/dev/null | sort); do
  log "  $(basename "$f")"
  docker exec -i "$PG_NAME" psql -U barbearia -d barbearia_saas_test -v ON_ERROR_STOP=1 <"$f" >>"$LOG" 2>&1
done

if [[ "$APPLY_SEED" -eq 1 ]]; then
  log "Aplicar seed…"
  docker exec -i "$PG_NAME" psql -U barbearia -d barbearia_saas_test -v ON_ERROR_STOP=1 <"$ROOT/database/seeds/001_demo.sql" >>"$LOG" 2>&1
fi

cd "$ROOT/apps/api"
npm run typecheck 2>&1 | tee -a "$LOG"
npm run lint 2>&1 | tee -a "$LOG"
npm run test:unit 2>&1 | tee -a "$LOG"

npm run test -- \
  src/infra/db/tenant-context.integration.test.ts \
  src/modules/branches/branches.rls.integration.test.ts \
  src/modules/waitlist/waitlist.integration.test.ts \
  src/modules/customers/customers.integration.test.ts \
  src/modules/professionals/professionals.integration.test.ts \
  src/modules/recall/recall.integration.test.ts \
  src/modules/appointments/appointments.integration.test.ts \
  src/modules/availability/availability.integration.test.ts \
  src/modules/integrations/integrations-outbound.integration.test.ts \
  src/modules/finance/finance.service.integration.test.ts \
  src/modules/commission/commission.service.integration.test.ts \
  src/modules/users/users.isolation.integration.test.ts \
  src/modules/audit/audit_logs.isolation.integration.test.ts \
  2>&1 | tee -a "$LOG"

log "node scripts/audit-tenant-context.mjs"
node "$ROOT/scripts/audit-tenant-context.mjs" 2>&1 | tee -a "$LOG"

log "=== Harness concluído com sucesso ==="
