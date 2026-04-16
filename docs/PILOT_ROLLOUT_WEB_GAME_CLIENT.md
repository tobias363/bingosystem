# Pilot Rollout Checklist: Web Game Client

**Date:** 2026-04-14
**Scope:** Gradual rollout of PixiJS web game client alongside existing Unity WebGL client

---

## Feature Flag System

The web game client is gated by a feature flag system in `lobby.js` (`shouldUseWebClient()`). Three activation paths exist, evaluated in order:

### 1. Database flag (production rollout)

```
game.settings.clientEngine === 'web'
```

Set via admin panel or direct DB update on the `app_games` table. This is the primary rollout mechanism — flip per game slug to migrate traffic.

**How to enable:**
```sql
UPDATE app_games
SET settings = jsonb_set(COALESCE(settings, '{}'), '{clientEngine}', '"web"')
WHERE slug = 'game_2';
```

**How to rollback:**
```sql
UPDATE app_games
SET settings = settings - 'clientEngine'
WHERE slug = 'game_2';
```

### 2. URL parameter (testing/QA)

```
?webClient=<slug|game_N|all>
```

Examples:
- `?webClient=game_2` — web client for Game 2 (Rocket Bingo) only
- `?webClient=game_1` — web client for Game 1 (Classic Bingo) only
- `?webClient=all` — web client for all games

This override is checked in `lobby.js` and works regardless of database settings. Intended for developer/QA testing before production flag flip.

### 3. Unity fallback

If the web client fails to load (network error, JS exception), `loadWebGame()` automatically falls back to loading the Unity build:

```js
catch (err) {
  console.error('[lobby] Failed to load web game client:', err);
  if (webContainer) webContainer.style.display = 'none';
  webGameLoading = false;
  loadUnityAndStartGame(game);  // ← automatic fallback
  return;
}
```

---

## Rollout Phases

### Phase 0: Internal testing (current)

- [x] Web client builds and type-checks (`npm -w @spillorama/game-client run check`)
- [x] Web client Vite-builds to `backend/public/web/games/` (`npm -w @spillorama/game-client run build`)
- [x] Feature flag `?webClient=all` activates web client for all games
- [x] Games 1, 2, 3, 5 render correctly in web client
- [x] Socket.IO integration tests pass (15/15 — BIN-340)
- [x] Performance benchmark documented (BIN-346)

### Phase 1: Staging smoke test

Before flipping the database flag, verify on staging environment:

| # | Check | Status |
|---|-------|--------|
| 1 | Deploy backend with web client build artifacts in `/web/games/` | |
| 2 | Open staging lobby, append `?webClient=all` | |
| 3 | Click each game tile (1, 2, 3, 5) — web client loads, not Unity | |
| 4 | Verify socket connects (check browser console for `[Game*] Socket connected`) | |
| 5 | Join room, arm bet, start game with 2+ players | |
| 6 | Draw numbers, mark tickets, submit LINE/BINGO claims | |
| 7 | Chat send/receive works | |
| 8 | Lucky number selection works | |
| 9 | Disconnect/reconnect preserves game state | |
| 10 | Game end → lobby transition is clean (no orphan containers) | |
| 11 | Remove `?webClient` param — games load via Unity (flag off = Unity) | |
| 12 | Wallet balance updates after game round (win/loss reflected) | |
| 13 | Spillvett compliance checks block gameplay appropriately (paused, excluded, limits) | |

### Phase 2: Single-game pilot (recommended start: Game 2)

Game 2 (Rocket Bingo) is the simplest game (3x5 grid, no mini-games, no chat) and the first game built for the web client. Start here.

| # | Action | Owner |
|---|--------|-------|
| 1 | Flip `clientEngine = 'web'` for `game_2` slug in staging DB | Admin |
| 2 | Verify Game 2 loads as web client without URL param | QA |
| 3 | Verify Games 1, 3, 5 still load as Unity | QA |
| 4 | Run 10+ complete game rounds with real wallet transactions | QA |
| 5 | Monitor server logs for socket errors | Ops |
| 6 | Monitor browser console for JS errors (telemetry) | Dev |
| 7 | If stable for 24h, flip `clientEngine = 'web'` in production | Admin |
| 8 | Monitor production for 48h before proceeding to next game | Ops |

### Phase 3: Expand to remaining games

Roll out one game at a time, waiting 24–48h between each:

1. Game 2 (Rocket Bingo) — simplest, pilot
2. Game 3 (Monster Bingo) — similar to Game 2
3. Game 5 (Spillorama Bingo) — more complex patterns
4. Game 1 (Classic Bingo) — most complex, chat + mini-games (mini-games deferred)

### Phase 4: Unity deprecation

After all games are stable on web client for 1+ week:

| # | Action |
|---|--------|
| 1 | Remove Unity build from `backend/public/web/Build/` (~40 MB) |
| 2 | Remove Unity loader script references from `index.html` |
| 3 | Remove `loadUnityAndStartGame()` and Unity-related code from `lobby.js` |
| 4 | Remove Unity fallback in `loadWebGame()` |
| 5 | Remove `clientEngine` feature flag check (web is default) |

---

## Rollback Procedure

If issues are found after production flag flip:

**Immediate (< 1 minute):**
```sql
-- Remove web client flag → reverts to Unity
UPDATE app_games
SET settings = settings - 'clientEngine'
WHERE slug = 'game_2';
```

No server restart required. Next page load uses Unity. Active web sessions continue until user navigates away.

**If web build artifacts are corrupted:**
The Unity fallback in `loadWebGame()` catches load failures and automatically routes to Unity. Users see a brief flash but gameplay is uninterrupted.

---

## Monitoring Checklist

| Signal | Where | Threshold |
|--------|-------|-----------|
| JS errors | Browser console / telemetry | 0 errors per session |
| Socket disconnects | Server logs (`socket_disconnect`) | < 5% of sessions |
| Socket reconnects | Server logs (`socket_reconnect`) | < 10% of sessions |
| Game start failures | Server logs (`game:start` errors) | 0 |
| Claim validation failures | Server logs (`claim:submit` errors) | Expected (invalid claims) |
| Load time | Browser Performance API | < 2s on 4G |
| Bundle cache hit ratio | CDN/server logs | > 90% after first load |

---

## Files Involved

| File | Role |
|------|------|
| `backend/public/web/lobby.js` | Feature flag evaluation (`shouldUseWebClient`) |
| `backend/public/web/games/main.js` | Web client entry point |
| `backend/public/web/games/chunks/` | Code-split game controllers + PixiJS |
| `backend/public/web/Build/` | Unity WebGL build (fallback) |
| `backend/src/platform/PlatformService.ts` | `app_games.settings` schema (stores `clientEngine`) |
| `packages/game-client/vite.config.ts` | Build config, output paths |
