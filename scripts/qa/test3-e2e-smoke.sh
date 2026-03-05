#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CANDY_API_BASE_URL:-}" ]]; then
  echo "[test3-e2e] Missing CANDY_API_BASE_URL"
  exit 1
fi

if [[ -z "${CANDY_TEST_ACCESS_TOKEN:-}" ]]; then
  echo "[test3-e2e] Missing CANDY_TEST_ACCESS_TOKEN"
  exit 1
fi

BASE_URL="${CANDY_API_BASE_URL%/}"

echo "[test3-e2e] Health check"
health_response="$(curl -sS "${BASE_URL}/health")"
node -e '
const parsed = JSON.parse(process.argv[1]);
if (!parsed.ok) process.exit(1);
' "$health_response"

echo "[test3-e2e] Launch token issue"
launch_response="$(curl -sS -X POST "${BASE_URL}/api/games/candy/launch-token" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CANDY_TEST_ACCESS_TOKEN}" \
  -d '{}')"

launch_token="$(node -e '
const parsed = JSON.parse(process.argv[1]);
if (!parsed.ok || !parsed.data || !parsed.data.launchToken) process.exit(1);
process.stdout.write(String(parsed.data.launchToken));
' "$launch_response")"

echo "[test3-e2e] Launch resolve (first consume)"
resolve_response="$(curl -sS -X POST "${BASE_URL}/api/games/candy/launch-resolve" \
  -H "Content-Type: application/json" \
  -d "{\"launchToken\":\"${launch_token}\"}")"

node -e '
const parsed = JSON.parse(process.argv[1]);
if (!parsed.ok) process.exit(1);
if (!parsed.data || !parsed.data.accessToken || !parsed.data.hallId || !parsed.data.walletId) process.exit(1);
' "$resolve_response"

echo "[test3-e2e] Launch resolve (second consume should fail)"
resolve_again_response="$(curl -sS -X POST "${BASE_URL}/api/games/candy/launch-resolve" \
  -H "Content-Type: application/json" \
  -d "{\"launchToken\":\"${launch_token}\"}")"

node -e '
const parsed = JSON.parse(process.argv[1]);
if (parsed.ok) process.exit(1);
if (!parsed.error || parsed.error.code !== "INVALID_LAUNCH_TOKEN") process.exit(1);
' "$resolve_again_response"

echo "[test3-e2e] PASS"
