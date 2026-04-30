# GameManagementService

**File:** `apps/backend/src/admin/GameManagementService.ts` (648 LOC)
**Owner-area:** platform-admin
**Last reviewed:** 2026-04-30

## Purpose

Admin CRUD for **game variants that operators can start** — one row in `app_game_management` per concrete game (e.g. "Bingo Hovedrunde 19:00 — Spill 1, Small Yellow stack"). Pairs with `GameTypeService` (game-type catalog), `ScheduleService` (templates), and `DailyScheduleService` (calendar instantiation).

Fields without dedicated columns (prize tiers, hall-group visibility, sub-game composition, ticket colors, pattern selection) live in `config_json` until BIN-620/621/627 (GameType / SubGame / Pattern CRUD) absorbs them. Soft-delete is the default; hard-delete is permitted only when the row never sold a ticket. The `repeat` flow is idempotent on `(sourceId, createdBy, repeatToken)` so an admin can safely retry "duplicate this game with new dates" without creating doubles.

## Public API

```ts
constructor(options: GameManagementServiceOptions)

list(filter?: ListGameManagementFilter): Promise<GameManagement[]>      // gameTypeId / status / limit / includeDeleted
get(id: string): Promise<GameManagement>                                 // throws GAME_MANAGEMENT_NOT_FOUND
create(input: CreateGameManagementInput): Promise<GameManagement>        // input-validates + idempotent on repeatToken
update(id, update: UpdateGameManagementInput): Promise<GameManagement>   // partial, refuses if deleted
remove(id, options?: { hard?: boolean }): Promise<{ softDeleted: boolean }>
repeat(input: RepeatGameManagementInput): Promise<GameManagement>        // duplicate with new dates; idempotent
```

`GameManagement` shape:
- `id, gameTypeId, parentId, name`
- `ticketType: "Large" | "Small" | null`
- `ticketPrice: number`
- `startDate, endDate?` (timestamptz)
- `status: "active" | "running" | "closed" | "inactive"`
- `totalSold, totalEarning: number`
- `config: Record<string, unknown>` (free-form bundle)
- `repeatedFromId, createdBy, createdAt, updatedAt, deletedAt`

## Dependencies

**Calls (downstream):**
- `pg.Pool` — DB writes/reads (DB-P0-002 shared)
- `node:crypto.randomUUID` — id generation
- `DomainError` — typed error codes consumed by REST layer

**Called by (upstream):**
- `routes/adminGameManagement.ts` — primary admin REST surface
- `routes/adminDailySchedules.ts` — Daily schedules reference a GameManagement row
- `DailyScheduleService` (`apps/backend/src/admin/DailyScheduleService.ts`) — uses GameManagement rows for schedule instantiation
- `SavedGameService` — saved-game presets reference GameManagement
- `CloseDayService` — close-day flow inspects GameManagement status
- `PatternService` / `HallGroupService` / `GameTypeService` — sibling admin services that may co-resolve config
- `util/roomState.ts` — runtime room may reference GameManagement
- `index.ts` — wires the singleton

## Invariants

- **Soft-delete is the default.** `remove(id)` writes `deleted_at = now() AND status = 'inactive'`. The row stays for audit linkage.
- **Hard-delete is gated.** `remove(id, { hard: true })` only proceeds when `totalSold = 0 AND totalEarning = 0 AND status IN ('inactive', 'active')`. A row that ever sold a ticket can never be hard-deleted — preserves the audit trail.
- **`update` refuses deleted rows.** Throws `GAME_MANAGEMENT_DELETED`. Restore is intentionally not exposed here — the admin must un-delete via raw migration if business signs off.
- **`endDate ≥ startDate`** enforced both on `create` and on `update` (re-checked after the merge so partial updates can't sneak through).
- **`ticketPrice` and `totalSold` / `totalEarning` are non-negative integers.** `assertTicketPrice` and `assertNonNegativeInt` reject NaN, Infinity, decimals, negatives.
- **Idempotency on repeat.** `create` with `repeatToken` set looks for an existing row matching `(repeated_from_id, created_by, config_json.repeatToken)` via `findByRepeatToken`. If found, returns the existing row; otherwise inserts and stores the token under `config.repeatToken` for next-time lookup. `repeat()` is the high-level wrapper that copies fields, resets `totalSold`/`totalEarning`, and forces `status = 'inactive'` on the copy.
- **`name` cap = 200 chars.** Same cap on `gameTypeId`, `parentId`, `repeatedFromId`. Prevents UI from accidentally inserting essay-length identifiers.
- **Status ⊆ {active, running, closed, inactive}.** `assertStatus` rejects anything outside this list. Lifecycle: `inactive → active → running → closed` (typically). `running` indicates an in-progress round; `closed` is post-game.
- **`config_json` rejects arrays.** `assertConfig` accepts an object or null/undefined; arrays produce `INVALID_INPUT` because the SQL JSONB column expects key-value semantics.
- **Schema-name validation.** `assertSchemaName` rejects anything outside `[a-zA-Z_][a-zA-Z0-9_]*`.

## Test coverage

`apps/backend/src/admin/GameManagementService.test.ts` validates every input-guard:
- "BIN-622 service: create() avviser tom gameTypeId"
- "BIN-622 service: create() avviser tom name"
- "BIN-622 service: create() avviser name > 200 tegn"
- "BIN-622 service: create() avviser ticketPrice < 0"
- "BIN-622 service: create() avviser ikke-heltall ticketPrice"
- "BIN-622 service: create() avviser ugyldig ticketType"
- "BIN-622 service: create() godtar null ticketType"
- "BIN-622 service: create() avviser ugyldig status"
- "BIN-622 service: create() avviser ugyldig ISO startDate"
- "BIN-622 service: create() avviser endDate < startDate"
- "BIN-622 service: create() avviser config som array"
- "BIN-622 service: create() avviser tom createdBy"
- "BIN-622 service: constructor avviser blank connection string"
- "BIN-622 service: constructor avviser skjema med ugyldig navn"

E2E coverage: `apps/backend/src/__tests__/e2e_admin_game_setup_full.test.ts` exercises GameManagement creation as part of a full admin game-setup walkthrough.

## Operational notes

**Common production failures:**
- `GAME_MANAGEMENT_NOT_FOUND` after delete: stale UI. Reload the list.
- `GAME_MANAGEMENT_DELETED` on update: someone soft-deleted between fetch + edit. Operator must restore (manual DB op) or create new.
- Duplicate row from race: very unlikely thanks to idempotency on repeatToken — but if `repeatToken` was missing from the duplicate request, two creates are possible. Surface a warning in the admin UI when `repeat` is called without a stable token.
- Hard-delete refused: row had non-zero `total_sold` or `total_earning`. Soft-delete it instead.
- `endDate must be ≥ startDate` on update: partial-update merged invalid timestamps. Show the operator the resulting `(startDate, endDate)` pair.
- Config blob too large: there is no hard cap. If you see slow updates, suspect a caller is dumping large arrays into `config_json`. Add validation at the call site.
- Ticket-counter drift between `total_sold` and actual sold tickets: this column is increment-only via `update`. If it gets out of sync (e.g. a manual SQL fix), reconcile from `app_game1_ticket_purchases` or equivalent ledger.

## Recent significant changes

- **#717** — DomainError moved to shared module
- **#715** (DB-P0-002) — pool consolidation
- **#231** (BIN-622) — initial implementation: GameManagement CRUD + repeat-game backend
- **#299** — Game 1 HTML-tickets refactor referenced GameManagement during legacy-fjerning

## Refactor status

Stable. `REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md` notes:
- BIN-620/621/627 follow-up: pull config-bundle fields into proper relational tables (`app_game_types`, `app_sub_games`, `app_patterns`) so admin-UI doesn't have to know about JSON-blob keys.
- The current admin/ directory has a sprawling family of services (`GameManagementService`, `ScheduleService`, `DailyScheduleService`, `SavedGameService`, `PatternService`, `GameTypeService`, `HallGroupService`, `CloseDayService`, `LeaderboardTierService`, etc.) that should be grouped under `admin/games/`, `admin/schedules/`, `admin/halls/` for navigability.
