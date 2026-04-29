#!/usr/bin/env bash
# scripts/schema-ci/diff-schema.sh
#
# Diffs two pg_dump outputs (or any two SQL schema files) and reports
# differences in a CI-friendly way. Used by both the schema-CI gate and
# the nightly ghost-detection job.
#
# Behavior:
#   - Exits 0 if files are byte-identical.
#   - Exits 1 if files differ. Prints unified-diff (max ±300 lines of
#     context to keep CI logs readable).
#   - Exits >=64 on usage errors.
#
# Usage:
#   diff-schema.sh <expected.sql> <actual.sql> [--label-expected NAME] [--label-actual NAME]
#
# Examples:
#   # Schema-CI: shadow DB after migrations vs committed baseline
#   diff-schema.sh apps/backend/schema/baseline.sql /tmp/shadow.sql \
#     --label-expected "baseline" --label-actual "shadow-after-migrate"
#
#   # Ghost-detection: shadow DB vs prod
#   diff-schema.sh /tmp/shadow.sql /tmp/prod.sql \
#     --label-expected "shadow-after-migrate" --label-actual "prod"
#
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <expected.sql> <actual.sql> [--label-expected NAME] [--label-actual NAME]" >&2
  exit 64
fi

EXPECTED="$1"
ACTUAL="$2"
shift 2

LABEL_EXPECTED="expected"
LABEL_ACTUAL="actual"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --label-expected) LABEL_EXPECTED="$2"; shift 2 ;;
    --label-actual)   LABEL_ACTUAL="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 64 ;;
  esac
done

if [[ ! -f "$EXPECTED" ]]; then
  echo "[diff-schema] Expected file not found: $EXPECTED" >&2
  exit 65
fi
if [[ ! -f "$ACTUAL" ]]; then
  echo "[diff-schema] Actual file not found: $ACTUAL" >&2
  exit 65
fi

if cmp -s "$EXPECTED" "$ACTUAL"; then
  echo "[diff-schema] OK: $LABEL_EXPECTED == $LABEL_ACTUAL"
  exit 0
fi

echo "" >&2
echo "============================================================" >&2
echo "[diff-schema] SCHEMA DIVERGENCE DETECTED" >&2
echo "  $LABEL_EXPECTED: $EXPECTED ($(wc -l < "$EXPECTED") lines)" >&2
echo "  $LABEL_ACTUAL:   $ACTUAL ($(wc -l < "$ACTUAL") lines)" >&2
echo "============================================================" >&2
echo "" >&2

# Print unified diff with limited context. If diff is huge, GitHub Actions
# log can get truncated; -U 3 keeps it usable but readable.
diff -U 3 \
  --label "$LABEL_EXPECTED" \
  --label "$LABEL_ACTUAL" \
  "$EXPECTED" "$ACTUAL" || true

echo "" >&2
echo "============================================================" >&2
echo "[diff-schema] To resolve:" >&2
echo "  1. If the change is intentional: refresh the baseline:" >&2
echo "       npm run schema:snapshot" >&2
echo "     and commit the updated apps/backend/schema/baseline.sql." >&2
echo "  2. If the change is unintentional: add the SQL to a new migration" >&2
echo "     file in apps/backend/migrations/ rather than mutating prod by hand." >&2
echo "  3. See docs/operations/SCHEMA_CI_RUNBOOK.md for details." >&2
echo "============================================================" >&2

exit 1
