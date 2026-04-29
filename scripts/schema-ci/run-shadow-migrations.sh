#!/usr/bin/env bash
# scripts/schema-ci/run-shadow-migrations.sh
#
# Spins up a fresh shadow Postgres (or uses one provided via env) and runs
# every migration in apps/backend/migrations in order. Used by both the
# schema-CI gate and the nightly ghost-detection job.
#
# Two modes:
#   1. Caller-provided DB (CI / docker-compose):
#        SHADOW_PG_CONNECTION_STRING="postgresql://..." run-shadow-migrations.sh
#   2. Local docker mode (developer machine, optional):
#        run-shadow-migrations.sh --local-docker
#      Boots a `postgres:18-alpine` container on port 55432, runs
#      migrations, and prints the connection string.
#
# Always prints the final connection string on the LAST line of stdout so
# callers can capture it: CONN=$(run-shadow-migrations.sh | tail -1)
#
# Exits non-zero if migrations fail. Migration runner is the same
# `node-pg-migrate` invocation used in render.yaml, so behavior matches
# prod.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND_DIR="$ROOT/apps/backend"

MODE="ci"
if [[ "${1:-}" == "--local-docker" ]]; then
  MODE="local-docker"
fi

if [[ "$MODE" == "local-docker" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "[run-shadow-migrations] --local-docker requires Docker; not found." >&2
    exit 65
  fi
  CONTAINER_NAME="schema-ci-shadow-pg"
  PORT=55432

  # Tear down any leftover container quietly, then start fresh.
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker run -d \
    --name "$CONTAINER_NAME" \
    -e POSTGRES_USER=shadow \
    -e POSTGRES_PASSWORD=shadow \
    -e POSTGRES_DB=shadow \
    -p "$PORT:5432" \
    postgres:18-alpine >/dev/null

  # Wait for ready.
  for i in $(seq 1 30); do
    if docker exec "$CONTAINER_NAME" pg_isready -U shadow >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  SHADOW_PG_CONNECTION_STRING="postgresql://shadow:shadow@localhost:$PORT/shadow"
  echo "[run-shadow-migrations] Local shadow PG up on port $PORT" >&2
elif [[ -z "${SHADOW_PG_CONNECTION_STRING:-}" ]]; then
  echo "[run-shadow-migrations] SHADOW_PG_CONNECTION_STRING is required (or pass --local-docker)" >&2
  exit 64
fi

# node-pg-migrate uses APP_PG_CONNECTION_STRING from env.
export APP_PG_CONNECTION_STRING="$SHADOW_PG_CONNECTION_STRING"

# Run migrations using the same script + ignore-pattern as render.yaml.
# We invoke node-pg-migrate directly through npm so any future migrate
# script update in package.json is picked up automatically.
echo "[run-shadow-migrations] Running migrations against shadow DB..." >&2
(
  cd "$BACKEND_DIR"
  npm run --silent migrate 2>&1 | sed 's/^/[migrate] /' >&2
)

# Sanity check: how many migrations registered?
COUNT=$(psql "$SHADOW_PG_CONNECTION_STRING" -tAc "SELECT count(*) FROM pgmigrations;" | tr -d '[:space:]')
echo "[run-shadow-migrations] $COUNT migrations registered in pgmigrations" >&2

# Print final connection string for the caller to capture.
echo "$SHADOW_PG_CONNECTION_STRING"
