#!/usr/bin/env bash
# scripts/schema-ci/snapshot.sh
#
# Refreshes apps/backend/schema/baseline.sql by running all
# migrations against a fresh shadow Postgres and dumping the resulting
# schema. Run this whenever you intentionally change the schema (added a
# migration, edited an existing one) so the schema-CI gate doesn't fail.
#
# Local usage (requires Docker):
#   npm run schema:snapshot
#
# CI doesn't call this — CI calls run-shadow-migrations.sh + dump-schema.sh
# + diff-schema.sh against the existing baseline.
#
# Usage:
#   snapshot.sh                       # uses --local-docker
#   SHADOW_PG_CONNECTION_STRING=...   # uses caller-provided shadow DB
#   snapshot.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BASELINE="$ROOT/apps/backend/schema/baseline.sql"

# Boot shadow DB (or use caller-provided).
if [[ -z "${SHADOW_PG_CONNECTION_STRING:-}" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "[snapshot] Docker not found. Install Docker, or set" >&2
    echo "  SHADOW_PG_CONNECTION_STRING=postgresql://... before running." >&2
    exit 65
  fi
  CONN=$("$SCRIPT_DIR/run-shadow-migrations.sh" --local-docker | tail -1)
else
  CONN=$("$SCRIPT_DIR/run-shadow-migrations.sh" | tail -1)
fi

# Dump → baseline.
"$SCRIPT_DIR/dump-schema.sh" "$CONN" "$BASELINE"

# If we booted the local docker, tear down.
if [[ -z "${SHADOW_PG_CONNECTION_STRING:-}" ]]; then
  docker rm -f schema-ci-shadow-pg >/dev/null 2>&1 || true
fi

echo "" >&2
echo "[snapshot] Updated $BASELINE" >&2
echo "  Lines: $(wc -l < "$BASELINE")" >&2
echo "  Next: review with 'git diff apps/backend/schema/baseline.sql'" >&2
echo "        and commit if the changes match your migration intent." >&2
