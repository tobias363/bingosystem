# Game1AutoDrawTickService

**File:** `apps/backend/src/game/Game1AutoDrawTickService.ts` (360 LOC)
**Owner-area:** game-runtime
**Last reviewed:** 2026-04-30

## Purpose

Global 1-second tick service that drives automatic ball-draws for all running scheduled Spill 1 games — finds games whose `last_drawn_at + seconds <= now()` and triggers `Game1DrawEngineService.drawNext()` per game. Decouples scheduling rhythm from manual master action.

It exists because scheduled Spill 1 uses fixed-interval auto-draw (PM-decision 2026-04-21: "hver kule kommer med akuratt samme mellomrom"); the master operator can pause/resume via `Game1MasterControlService` but does NOT manually trigger each draw. This service runs as a `JobScheduler` task and uses Postgres `FOR UPDATE SKIP LOCKED` to coordinate across Node instances safely.

## Public API

```typescript
export class Game1AutoDrawTickService {
  constructor(opts: Game1AutoDrawTickServiceOptions)

  // Run one tick — finds eligible games, triggers drawNext per game
  async tick(): Promise<Game1AutoDrawTickResult>
}

export interface Game1AutoDrawTickServiceOptions {
  pool: Pool
  schema?: string
  drawEngine: Game1DrawEngineService
  defaultSeconds?: number       // default 5 if ticket_config missing
  forceSecondsOverride?: number // global env-var override (AUTO_DRAW_INTERVAL_MS)
}

export interface Game1AutoDrawTickResult {
  checked: number
  drawsTriggered: number
  skippedNotDue: number
  errors: number
  errorMessages?: string[]   // up to 10 first error messages
}
```

## Dependencies

**Calls (downstream):**
- `pg.Pool.connect` + `client.query("BEGIN" / "COMMIT" / "ROLLBACK")` + `SELECT ... FOR UPDATE SKIP LOCKED` on `app_game1_scheduled_games sg JOIN app_game1_game_state gs`.
- `Game1DrawEngineService.drawNext(scheduledGameId)` — actual draw.
- Logger — `log.warn` per-game error, `log.debug` per-tick summary.

**Called by (upstream):**
- `apps/backend/src/jobs/game1AutoDrawTick.ts` — JobScheduler-driven runner that calls `tick()` every second.
- `apps/backend/src/index.ts` — wires the runner to scheduler at boot.
- `apps/backend/src/util/schedulerSetup.ts` — scheduler setup helper.

## Invariants

- Cross-instance safety via `FOR UPDATE SKIP LOCKED` on `app_game1_game_state` — multiple Node instances can run the same tick concurrently without double-draws. The lock is released BEFORE `drawNext` is called so `drawNext`'s own row-lock TX doesn't deadlock.
- In-process safety via `currentlyProcessing: Set<string>` (HIGH-7 fix) — within a single Node prosess, overlapping tick-promises don't both call `drawNext` for the same gameId. Released in `finally` regardless of success/failure.
- Per-game error isolation — if `drawNext` throws for one game, the tick continues for other games; the error is captured in `result.errorMessages` (up to 10) and counted in `result.errors`.
- Schema name is validated against `^[a-z_][a-z0-9_]*$` at construction (`INVALID_CONFIG: Ugyldig schema-navn`) — defense-in-depth against SQL injection.
- `forceSecondsOverride` always wins over per-game `ticket_config_json.timing.seconds` — typically wired from `AUTO_DRAW_INTERVAL_MS` env-var so prod tempo is stable across runs and games.
- First draw delay: `parseLastDrawnMs` falls back to `engine_started_at` when `last_drawn_at IS NULL`, so the first ball drops `seconds` after start (NOT immediately) — gives players time to see cards.
- Test-stub pool fallback: when `pool.connect === undefined`, falls back to `pool.query` for the SELECT (preserves existing test contracts).

## Test coverage

- `apps/backend/src/game/Game1AutoDrawTickService.test.ts` — covers tick happy-path (multiple games, mix of due/not-due/paused), error isolation, `forceSecondsOverride` precedence, per-game `seconds` resolution from `ticket_config_json` (top-level + nested + `spill1.timing.seconds`).

## Operational notes

Common failures + how to diagnose:
- `INVALID_CONFIG: Ugyldig schema-navn` at construction — fix env wiring; `schema` must match `[a-z_][a-z0-9_]*`.
- All games "skippedNotDue" forever — check `app_game1_game_state.last_drawn_at` vs `seconds`; if `seconds` is huge (misconfigured ticket_config), first draw will never fire. Use `forceSecondsOverride`.
- "drawNext failed for game" warn — `Game1DrawEngineService.drawNext` threw. Common causes:
  - `GAME_PAUSED` race — game was paused between SELECT and drawNext call. Benign.
  - Row-lock timeout — another instance is mid-draw. Benign — next tick will retry.
  - `MAX_DRAWS_REACHED` — game should have completed; check `scheduled_game.status`.
- Tick not running at all — check JobScheduler / cron wiring in `index.ts`. The service itself is stateless and only acts when `tick()` is invoked.
- `FOR UPDATE SKIP LOCKED` not honoring lock — verify Postgres version (≥ 9.5 required). Check `pg_locks` for stuck locks.
- Multiple instances double-drawing — verify both `FOR UPDATE SKIP LOCKED` (DB-level) AND `currentlyProcessing` set (per-instance) are running. If issue persists, add explicit lock-key in `app_lock_state` (BIN-761 outbox-pattern).

## Recent significant changes

- PR #717 (`bea47642`): import `DomainError` from `errors/DomainError.ts`.
- PR #575 (`17daccb5`): HIGH-7 fix — `FOR UPDATE SKIP LOCKED` + in-process `currentlyProcessing` mutex to prevent cross-instance and intra-process double-drawing.
- PR #560 (`d1b4a356`): draw-interval persists between rounds — `forceSecondsOverride` semantics.

## Refactor status (audit-rapport REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md)

- `resolveSeconds` checks three nested config shapes (top-level, `timing`, `spill1.timing`) — could be normalized at config-write time so the runtime path has a single shape.
- `loadRunningGames` has dual code paths (test-stub vs real pool) — fragile; tests should use a real `pg.Pool` test container.
- `pickPositiveInt` is a 6-line helper duplicated across several `Game1*Service` files — promote to shared util.

