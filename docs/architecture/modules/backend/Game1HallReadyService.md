# Game1HallReadyService

**File:** `apps/backend/src/game/Game1HallReadyService.ts` (924 LOC)
**Owner-area:** game-runtime
**Last reviewed:** 2026-04-30

## Purpose

Per-hall ready-flow service for scheduled Spill 1 — owns the bingovert "klar"-button workflow, ticket-scan checkpoints (start/final), purchase-cutoff guard, status-light computation (red/orange/green), heartbeat-stale sweep + force-revert (REQ-007), and ready-state reset between rounds.

It exists because scheduled Spill 1 is multi-hall: the master operator can only start the round once every participating hall has confirmed "klar". Halls also need to scan first/last physical bong to register sales count and unlock the ready button. This service is the single Postgres-backed source of truth for those state transitions, with the `assertPurchaseOpenForHall` guard ensuring no purchases are accepted after a hall confirms ready.

## Public API

```typescript
export class Game1HallReadyService {
  constructor(opts: { pool: Pool; schema?: string })
  static forTesting(pool, schema): Game1HallReadyService

  // Ready flow (bingovert)
  async markReady(input: MarkReadyInput): Promise<HallReadyStatusRow>
  async unmarkReady(input: UnmarkReadyInput): Promise<HallReadyStatusRow>

  // Read-helpers
  async getReadyStatusForGame(gameId): Promise<HallReadyStatusRow[]>
  async getHallStatusForGame(gameId): Promise<HallStatusForGame[]>
  async getGameGroupId(gameId): Promise<string>
  async allParticipatingHallsReady(gameId): Promise<boolean>

  // Purchase-cutoff guard (called by ticket-purchase paths)
  async assertPurchaseOpenForHall(gameId, hallId): Promise<void>

  // TASK HS — bong-scan checkpoints
  async recordStartScan(input: RecordScanInput): Promise<HallReadyStatusRow>
  async recordFinalScan(input: RecordScanInput): Promise<HallReadyStatusRow>

  // REQ-007 — admin/system force-revert + heartbeat sweep
  async forceUnmarkReady(input: ForceUnmarkReadyInput): Promise<HallReadyStatusRow | null>
  async sweepStaleReadyRows(staleAfterMs, nowMs): Promise<SweepStaleReadyResult>

  // Round transitions
  async resetReadyForNextRound(gameId): Promise<number>
}

// Wire types
export interface HallReadyStatusRow { gameId; hallId; isReady; readyAt; readyByUserId;
  digitalTicketsSold; physicalTicketsSold; excludedFromGame; excludedReason;
  createdAt; updatedAt; startTicketId; startScannedAt; finalScanTicketId; finalScannedAt }

export interface HallStatusForGame { hallId; playerCount;
  startScanDone; finalScanDone; readyConfirmed; excludedFromGame; excludedReason;
  color: HallStatusColor;   // "red" | "orange" | "green"
  soldCount; startTicketId; finalScanTicketId; digitalTicketsSold; physicalTicketsSold }

export type HallStatusColor = "red" | "orange" | "green"
```

## Dependencies

**Calls (downstream):**
- Postgres `pool.query(...)` against `app_game1_hall_ready_status`, `app_game1_scheduled_games`, `app_physical_tickets`.
- INSERT ... ON CONFLICT DO UPDATE for upsert semantics.
- No external services — fully self-contained around the schema.
- Logger — operational events.

**Called by (upstream):**
- `apps/backend/src/index.ts` — boot wiring.
- `apps/backend/src/routes/adminGame1Ready.ts` — bingovert ready-flow REST endpoints.
- `apps/backend/src/routes/agentGame1.ts` — agent-side ready interactions.
- `apps/backend/src/routes/agentTicketRegistration.ts` — start/final scan endpoints.
- `apps/backend/src/game/Game1TicketPurchaseService.ts` — `assertPurchaseOpenForHall` before accepting purchases.
- `apps/backend/src/game/Game1DrawEngineService.ts` — `resetReadyForNextRound` after round termination.
- `apps/backend/src/jobs/game1ScheduleTick.ts` — `allParticipatingHallsReady` to flip status `purchase_open → ready_to_start`; also calls `sweepStaleReadyRows` for REQ-007 heartbeat sweep.
- `apps/backend/src/jobs/game1AutoDrawTick.ts` — does NOT call this service directly (relies on schedule-tick).

## Invariants

- `markReady` rejects unless `scheduled_game.status === "purchase_open"` (`GAME_NOT_READY_ELIGIBLE`).
- `markReady` rejects unless `hallId ∈ participating_halls_json` OR `hallId === master_hall_id` (`HALL_NOT_PARTICIPATING`).
- TASK HS `FINAL_SCAN_REQUIRED` guard: if hall has physical-bong flow (`startTicketId != null` OR `physical_tickets_sold > 0`), `markReady` requires `final_scan_ticket_id != null`.
- `unmarkReady` only allowed while `status === "purchase_open"` — once `ready_to_start` / `running`, only `forceUnmarkReady` can revert.
- `assertPurchaseOpenForHall` throws `PURCHASE_CLOSED_FOR_HALL` if `(status === "purchase_open" AND is_ready === true)`. Unknown game IDs DO NOT throw — caller handles.
- `recordFinalScan` enforces `finalNumber >= startNumber` (numeric) or `finalString >= startString` (lex fallback) — `INVALID_SCAN_RANGE`.
- `physical_tickets_sold` after `recordFinalScan` is `Math.max(0, floor(finalNum - startNum))` when both are numeric; else falls back to DB count.
- Status color semantics (locked by Tobias 2026-04-24):
  - `red` ⇔ `playerCount === 0` (auto-excluded)
  - `orange` ⇔ `playerCount > 0 AND (!finalScanDone OR !readyConfirmed)`
  - `green` ⇔ all players counted + final-scan done + Klar pressed
- Digital-only hall (no `startTicketId` AND `physical_tickets_sold === 0`) ⇒ `finalScanDone = true` automatically.
- `allParticipatingHallsReady` returns `false` for empty hall list (defensive — never auto-start a round with zero halls).
- `forceUnmarkReady` is idempotent — returns null when row missing or already `is_ready=false`.

## Test coverage

- `apps/backend/src/game/Game1HallReadyService.test.ts` — core flow (markReady, unmarkReady, status, allReady, assertPurchaseOpen).
- `apps/backend/src/game/Game1HallReadyService.hallStatus.test.ts` — TASK HS color matrix + scan flow.
- `apps/backend/src/game/Game1HallReadyService.req007.test.ts` — REQ-007 force-revert + heartbeat sweep.

## Operational notes

Common failures + how to diagnose:
- `GAME_NOT_READY_ELIGIBLE` — game already left `purchase_open`. Check `app_game1_scheduled_games.status`.
- `HALL_NOT_PARTICIPATING` — hall not in `participating_halls_json` and not master. Verify scheduled-game config.
- `FINAL_SCAN_REQUIRED` — bingovert tried to confirm before scanning last bong. Fix UX flow.
- `START_SCAN_REQUIRED` — final scan attempted before start scan. Fix UX flow.
- `INVALID_SCAN_RANGE` — final ticket ID < start ID. Wrong ticket scanned; user error.
- `PURCHASE_CLOSED_FOR_HALL` — POS terminal tried to sell after bingovert pressed Klar. Expected — UX should handle gracefully.
- `MARK_READY_FAILED` / `SCAN_FAILED` — DB INSERT/UPDATE returned no row. Check Postgres connectivity / migration state.
- "Stale ready rows reverted" debug log — REQ-007 heartbeat sweep cleaned a row whose agent disconnected. Audit the agent/socket session.
- All halls red ⇒ schedule-tick won't auto-start — verify `digital_tickets_sold + physical_tickets_sold > 0` per hall.

## Recent significant changes

- PR #717 (`bea47642`): import `DomainError` from `errors/DomainError.ts`.
- PR #593 (`c2699efa`): REQ-007 — ready-state-machine — auto-revert + force-revert + heartbeat-sweep + Hall Info-popup.
- PR #451 (`dca188e0`): TASK HS — hall-status traffic-lights + start/final-scan flow + `getHallStatusForGame` + `recordStartScan` + `recordFinalScan`.
- PR #300 (`09197c87`): GAME1_SCHEDULE PR 2 — initial ready-flow + purchase-cutoff + scheduleId-writer.

## Refactor status (audit-rapport REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md)

- `markReady` mixes validation + UPSERT + return-mapping (~70 LOC). Could be split into `validateMarkReady` + `performMarkReady` for clarity.
- `recordStartScan` and `recordFinalScan` share the assertion block (`assertGameAndHallForScan`) but otherwise duplicate UPSERT shape — could be unified.
- `parseHallIdsArray` is a free helper that should be promoted to a shared util (also used in `Game1ScheduledGamesRepository`).

