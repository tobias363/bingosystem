# DrawScheduler

**File:** `apps/backend/src/draw-engine/DrawScheduler.ts` (646 LOC)
**Supporting modules:** `DrawSchedulerLock.ts` (134 LOC), `DrawWatchdog.ts` (171 LOC), `DrawErrorClassifier.ts` (162 LOC)
**Owner-area:** draw-engine
**Last reviewed:** 2026-04-30

## Purpose

Heartbeat for the auto-start/auto-draw loop — tick every 250ms over every room, decide which rooms need to start a new round or draw the next number, and serialize the work behind a per-room lock with a watchdog backing it up.

The scheduler is intentionally engine-agnostic: it owns timing, locking, error classification, and stuck-room recovery, while the actual business of starting a round (`onAutoStart`) and drawing a ball (`onAutoDraw`) is injected by the caller (`apps/backend/src/index.ts`). This split makes the scheduler unit-testable and lets engine refactors land without disturbing the tick loop.

## Public API

```typescript
export class DrawScheduler {
  // Lifecycle
  constructor(config: DrawSchedulerConfig)
  start(): void
  stop(): void
  async gracefulStop(): Promise<void>          // Notifies active rooms via onShutdown
  get isRunning(): boolean

  // Core loop
  async tick(): Promise<void>                  // Exposed for tests; otherwise internal

  // Timing helpers (also used by index.ts to schedule first round)
  setNextRoundForRoom(roomCode: string, nowMs: number): number
  normalizeNextAutoStartAt(roomCode: string, nowMs: number): number
  syncAfterSettingsChange(previous: SchedulerSettings): void

  // Cleanup
  cleanup(activeRoomCodes: Set<string>): void
  releaseRoom(roomCode: string): void

  // Observability
  get tickCount(): number
  healthSummary(detailed?: boolean): Record<string, unknown>

  // Sub-modules exposed for diagnostics
  readonly lock: DrawSchedulerLock
  readonly watchdog: DrawWatchdog
  readonly errorTracker: DrawErrorTracker

  // Timing state (publicly readable for tests)
  readonly nextAutoStartAtByRoom: Map<string, number>
  readonly lastAutoDrawAtByRoom: Map<string, number>
  readonly drawAnchorByRoom: Map<string, { anchor: number; count: number }>
}
```

`DrawSchedulerLock` exposes `withLock`, `tryAcquire`, `release`, `releaseAll`, `isLocked`, `cleanup`, plus `acquireCount` / `timeoutCount` / `heldLockCount` counters.

`DrawWatchdog` runs on its own interval (default 5s), reads room states via the supplied `getRoomStates` callback, and force-releases the scheduler lock when a RUNNING room hasn't drawn for `drawIntervalMs * stuckThresholdMultiplier` ms. After `maxConsecutiveStuck` (default 3) detections the room escalates via `onRoomExhausted`.

`DrawErrorClassifier.classifyDrawError(err)` returns `{ category: PERMANENT | TRANSIENT | FATAL, shouldRetry, logLevel, reason }`. `DrawErrorTracker` accumulates per-category + per-room counters for `/health`.

## Dependencies

**Calls (downstream):**
- `DrawSchedulerLock` — per-room mutex with timeout safety.
- `DrawWatchdog` — independent stuck-room detector.
- `DrawErrorClassifier` / `DrawErrorTracker` — categorize and count errors per room.
- `logger` (`util/logger.ts`) — structured pino logger with `module: "scheduler"` child.
- Injected `onAutoStart(roomCode, hostPlayerId)` and `onAutoDraw(roomCode, hostPlayerId)` callbacks (set in `index.ts:1287` to `BingoEngine.startGame` / `drawNextNumber` flows).

**Called by (upstream):**
- `apps/backend/src/index.ts:1287` — single instantiation point, started during boot, gracefulStopped on SIGTERM (`index.ts:3597`).
- `apps/backend/src/util/schedulerSetup.ts` — wires `getSettings` / `applyPendingSettings` against the runtime settings store.
- `/health` endpoint reads `drawScheduler.healthSummary()` (`index.ts:2961`, `index.ts:2972`).
- `metrics.stuckRooms` Prometheus gauge polls `healthSummary().drawWatchdog.stuckRooms` every 30s (`index.ts:2936`).

## Invariants

- **Per-room serialization.** Within `tick()`, `processAutoStart` and `processAutoDraw` for the same room run inside `lock.withLock(roomCode, …)` — no two callbacks for the same room execute concurrently, even across overlapping ticks.
- **Re-entrancy guard.** A second `tick()` invocation while one is in flight returns immediately (`tickInProgress`). Auto-set every 250ms via `setInterval` with `unref()` so it never blocks shutdown.
- **Lock force-release on timeout.** Any lock held > `defaultTimeoutMs` (5000ms) is force-released on the next acquire attempt, with `_timeoutCount` incremented and `onTimeout` fired.
- **Anchor-based draw pacing.** Once a round starts, the next draw fires at `anchor + (count + 1) * intervalMs` — drift-free even across long GC pauses. If ≥2 intervals are missed (e.g. resume after a pause), the scheduler re-anchors and warns instead of bursting catch-up draws.
- **Settings deletes timing state.** `syncAfterSettingsChange` clears `nextAutoStartAtByRoom` when `autoRoundStartEnabled` flips off, and clears both `lastAutoDrawAtByRoom` + `drawAnchorByRoom` when `autoDrawEnabled` flips off.
- **Single-room-per-hall mode.** When `enforceSingleRoomPerHall=true`, `selectSchedulerRooms` collapses each hall's rooms to one canonical (priority: RUNNING > playerCount > earliest createdAt > lex(roomCode)). Other rooms in that hall are skipped.
- **Exhaustion signals out, never abandons silently.** After 3 consecutive stuck detections, `onRoomExhausted(roomCode, count)` fires so `index.ts` can decide to destroy the room or alert ops.

## Test coverage

- `apps/backend/src/draw-engine/__tests__/DrawScheduler.test.ts` — unit tests for tick decisions, RUNNING-skip, watchdog integration, timing edge cases.
- `apps/backend/src/draw-engine/__tests__/DrawScheduler.integration.test.ts` — end-to-end tick → onAutoStart → onAutoDraw with simulated time.
- `apps/backend/src/draw-engine/__tests__/DrawSchedulerLock.test.ts` — timeout-then-reacquire, releaseAll on shutdown, cleanup.
- `apps/backend/src/draw-engine/__tests__/DrawWatchdog.test.ts` — stuck detection, escalation after maxConsecutiveStuck, lock force-release.
- `apps/backend/src/draw-engine/__tests__/DrawErrorClassifier.test.ts` — DomainError code → category mapping, fatal-on-unknown.

## Operational notes

- **Stuck-room symptom in `/health`:** `drawWatchdog.stuckRoomCodes` is non-empty and `bingo_stuck_rooms` Prometheus gauge > 0. Check the corresponding room's lock state in `healthSummary(true).rooms[*].isLocked` — true means a hung `onAutoDraw` is the cause.
- **Lock-timeout spike:** `schedulerLock.timeoutCount` increases — usually means an injected callback is awaiting something it shouldn't (DB without timeout, missing `try/finally`). Investigate the most recent room codes in the WARN log lines emitted by `onTimeout`.
- **Drift complaint in pilot ("draws speeding up after GC pause"):** look for "Re-anchoring draw schedule" WARN logs — the scheduler has detected ≥2 missed intervals and re-anchored to avoid burst catch-up.
- **Graceful restart:** SIGTERM → `gracefulStop()` waits up to 5s for in-flight tick, calls `onShutdown(activeRoomCodes)` so clients get "server restarting" toast, releases all locks, stops watchdog. Without this, restart leaves clients with hung sockets.

## Recent significant changes

- PR #717 (`bea47642`) — `DomainError` extracted to its own module; classifier imports from `errors/DomainError.js`.
- PR #569 (`2ba17eca`) — re-join etter disconnect + autoplay uten armed players (kritisk testing-fix). Introduced the `liveRoundsIndependentOfBet` flag that lets `processAutoStart` proceed without armed players.
- PR (`6a5db90b`) — autoplay-trigger uten armed players: scheduler started honoring `playerCount >= minPlayers` independent of armed-bet state.
- PR #106 (`f1d3c2c0`) — Phase 2 monorepo restructure moved files under `apps/backend/src/draw-engine/`.

## Refactor status

- **K2 (PR #732):** out of scope — DrawScheduler doesn't own armed-state.
- **K3 (PR #735):** complementary — `assertSpill1NotAdHoc` guard prevents the scheduler from starting scheduled Spill 1 rounds against the ad-hoc engine.
- **K4 (planned, audit §2.3):** the scheduler runs single-instance today. A multi-instance Redis-backed lock will let us run N backends; `DrawSchedulerLock` is designed to be swapped for a Redis advisory-lock impl behind the same interface (see `RedisSchedulerLock.ts` stub in `store/`).

See `docs/audit/REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md` §2.3 (CRIT-3) for the multi-instance rationale and §6 K4 for the rollout plan.
