#!/usr/bin/env bash
set -euo pipefail

# ── Deploy candy-game til produksjon ──
# Bruk: ./scripts/deploy.sh
#
# Hva skriptet gjør:
# 1. Kjører tester
# 2. Bygger candy-web (React) → frontend/web/
# 3. Bygger backend (TypeScript) → backend/dist/
# 4. Committer og pusher til main → Render auto-deployer
#
# Forutsetning: Alle endringer er testet lokalt med ./scripts/dev.sh

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/opt/homebrew/bin:$PATH"

echo "🔍 Steg 1: Kjører tester..."
(cd "$ROOT/backend" && node node_modules/.bin/tsx --test src/**/*.test.ts)
echo "✅ Alle tester bestått."
echo ""

echo "🔨 Steg 2: Bygger candy-web..."
(cd "$ROOT/candy-web" && node node_modules/.bin/vite build)
echo "✅ Frontend bygget."
echo ""

echo "📦 Steg 3: Kopierer build til frontend/web/..."
rm -rf "$ROOT/frontend/web"
cp -r "$ROOT/candy-web/dist" "$ROOT/frontend/web"
echo "✅ Frontend-assets oppdatert."
echo ""

echo "🔨 Steg 4: Bygger backend..."
(cd "$ROOT/backend" && node node_modules/.bin/tsc -p tsconfig.json)
echo "✅ Backend bygget."
echo ""

echo "📋 Steg 5: Git status..."
cd "$ROOT"
git status --short

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Bygg ferdig! Neste steg:"
echo ""
echo "  git add -A"
echo "  git commit -m 'feat(BIN-134): <beskrivelse>'"
echo "  git push origin main"
echo ""
echo "  Render deployer automatisk etter push."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
