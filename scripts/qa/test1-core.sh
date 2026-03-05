#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[test1-core] Branch: $(git rev-parse --abbrev-ref HEAD)"
echo "[test1-core] Commit: $(git rev-parse --short HEAD)"

echo "[test1-core] 1/4 Typecheck"
npm --prefix backend run check

echo "[test1-core] 2/4 Build"
npm --prefix backend run build

echo "[test1-core] 3/4 Core tests"
./backend/node_modules/.bin/tsx --test \
  backend/src/game/BingoEngine.test.ts \
  backend/src/launch/CandyLaunchTokenStore.test.ts

if [[ -n "${CANDY_API_BASE_URL:-}" && -n "${CANDY_TEST_ACCESS_TOKEN:-}" ]]; then
  echo "[test1-core] 4/4 API contract smoke on ${CANDY_API_BASE_URL}"

  launch_payload='{}'
  launch_response="$(curl -sS -X POST "${CANDY_API_BASE_URL%/}/api/games/candy/launch-token" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${CANDY_TEST_ACCESS_TOKEN}" \
    -d "$launch_payload")"

  launch_token="$(node -e '
const input = process.argv[1];
const parsed = JSON.parse(input);
if (!parsed.ok || !parsed.data || !parsed.data.launchToken) process.exit(1);
process.stdout.write(String(parsed.data.launchToken));
' "$launch_response")"

  resolve_response="$(curl -sS -X POST "${CANDY_API_BASE_URL%/}/api/games/candy/launch-resolve" \
    -H "Content-Type: application/json" \
    -d "{\"launchToken\":\"${launch_token}\"}")"

  node -e '
const parsed = JSON.parse(process.argv[1]);
if (!parsed.ok || !parsed.data || !parsed.data.accessToken) process.exit(1);
' "$resolve_response"

  second_resolve_response="$(curl -sS -X POST "${CANDY_API_BASE_URL%/}/api/games/candy/launch-resolve" \
    -H "Content-Type: application/json" \
    -d "{\"launchToken\":\"${launch_token}\"}")"

  node -e '
const parsed = JSON.parse(process.argv[1]);
if (parsed.ok) process.exit(1);
if (!parsed.error || parsed.error.code !== "INVALID_LAUNCH_TOKEN") process.exit(1);
' "$second_resolve_response"

  echo "[test1-core] API contract smoke PASS"
else
  echo "[test1-core] 4/4 API contract smoke SKIPPED (set CANDY_API_BASE_URL + CANDY_TEST_ACCESS_TOKEN)"
fi

echo "[test1-core] PASS"
