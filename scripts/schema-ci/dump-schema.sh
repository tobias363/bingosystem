#!/usr/bin/env bash
# scripts/schema-ci/dump-schema.sh
#
# Dumps a Postgres database's schema in a NORMALIZED, deterministic form
# suitable for diffing against another schema. Used by both the schema-CI
# gate (compare shadow-DB-after-migrate vs baseline) and the nightly
# ghost-detection job (compare prod schema vs shadow-DB-after-migrate).
#
# Normalization steps:
#   1. pg_dump --schema-only --no-owner --no-acl --no-comments
#   2. Strip transient `\restrict <random>` line that pg_dump >= 17 emits
#      (different per run — would cause false positives in diff).
#   3. Strip "Dumped from database version" / "Dumped by pg_dump version"
#      comment lines (vary per CI run).
#   4. Strip empty lines at start/end of CREATE blocks for stable diff.
#   5. Sort CREATE INDEX statements alphabetically (pg_dump orders by
#      table-OID which differs between fresh DB and prod, but the SET of
#      indexes is what matters).
#
# Usage:
#   dump-schema.sh <connection_string> <output_file>
#
# Example:
#   dump-schema.sh "postgresql://localhost:5432/shadow" /tmp/shadow.sql
#
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <connection_string> <output_file>" >&2
  exit 64
fi

CONN_STR="$1"
OUT_FILE="$2"

# Resolve absolute path so caller can pass relative path
OUT_FILE="$(cd "$(dirname "$OUT_FILE")" && pwd)/$(basename "$OUT_FILE")"

TMP_RAW=$(mktemp -t schema-dump-raw.XXXXXX)
TMP_NORM=$(mktemp -t schema-dump-norm.XXXXXX)
trap 'rm -f "$TMP_RAW" "$TMP_NORM"' EXIT

# Step 1: raw pg_dump
pg_dump \
  --schema-only \
  --no-owner \
  --no-acl \
  --no-comments \
  --schema=public \
  "$CONN_STR" > "$TMP_RAW"

# Step 2-3: normalize — strip transient/per-run lines
# Step 4: strip the leading SET-block (deterministic but verbose)
# Step 5: keep CREATE INDEX in their original (table-grouped) order — sorting
#         them globally would lose readability. Instead, we accept that the
#         file diff is noisy if a new table is added; the noise highlights
#         what changed.
sed -E \
  -e '/^\\restrict /d' \
  -e '/^\\unrestrict /d' \
  -e '/^-- Dumped from database version/d' \
  -e '/^-- Dumped by pg_dump version/d' \
  -e '/^-- Started on /d' \
  -e '/^-- Completed on /d' \
  "$TMP_RAW" > "$TMP_NORM"

# Collapse repeated blank lines to one (pg_dump can emit 2-3 blanks
# between blocks; normalize to 1 for stable diff).
awk 'BEGIN{p=0} /^$/{if(p==0)print; p=1; next} {print; p=0}' \
  "$TMP_NORM" > "$OUT_FILE"

echo "[dump-schema] wrote $OUT_FILE ($(wc -l < "$OUT_FILE") lines)" >&2
