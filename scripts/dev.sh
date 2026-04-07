#!/usr/bin/env bash
set -euo pipefail

# ── Lokal utvikling: Start candy-backend + candy-web med hot-reload ──
# Bruk: ./scripts/dev.sh
#
# Backend:  http://localhost:4000        (Express + Socket.IO)
# Frontend: http://localhost:4174        (Vite dev server)
#
# Frontend kobler automatisk til backend via VITE_CANDY_API_BASE_URL.
# Begge har hot-reload — endre kode og se resultatet umiddelbart.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/opt/homebrew/bin:$PATH"

# Sjekk at node finnes
if ! command -v node &>/dev/null; then
  echo "❌ Node.js ikke funnet. Installer via: brew install node"
  exit 1
fi

# Kill eventuelle eksisterende prosesser på port 4000 og 4174
for port in 4000 4174; do
  pid=$(lsof -nP -iTCP:$port -sTCP:LISTEN -t 2>/dev/null || true)
  if [[ -n "$pid" ]]; then
    echo "⚠️  Stopper eksisterende prosess på port $port (PID $pid)"
    kill -9 "$pid" 2>/dev/null || true
    sleep 0.3
  fi
done

# Installer avhengigheter om nødvendig
if [[ ! -d "$ROOT/backend/node_modules" ]]; then
  echo "📦 Installerer backend-avhengigheter..."
  (cd "$ROOT/backend" && npm install)
fi
if [[ ! -d "$ROOT/candy-web/node_modules" ]]; then
  echo "📦 Installerer frontend-avhengigheter..."
  (cd "$ROOT/candy-web" && npm install)
fi

echo ""
echo "🚀 Starter lokal utvikling..."
echo "   Backend:  http://localhost:4000"
echo "   Frontend: http://localhost:4174"
echo ""
echo "   Ctrl+C for å stoppe begge."
echo ""

# Start backend i bakgrunnen
(cd "$ROOT/backend" && node node_modules/.bin/tsx watch src/index.ts) &
BACKEND_PID=$!

# Vent litt slik at backend rekker å starte
sleep 2

# Start frontend med backend-URL satt
(cd "$ROOT/candy-web" && VITE_CANDY_API_BASE_URL=http://127.0.0.1:4000 node node_modules/.bin/vite --host 127.0.0.1 --port 4174) &
FRONTEND_PID=$!

# Cleanup ved Ctrl+C
cleanup() {
  echo ""
  echo "🛑 Stopper..."
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  wait 2>/dev/null || true
  echo "✅ Stoppet."
}
trap cleanup EXIT INT TERM

# Vent på begge
wait
