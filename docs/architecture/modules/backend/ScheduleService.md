# ScheduleService

**File:** `apps/backend/src/admin/ScheduleService.ts` (807 LOC)
**Owner-area:** platform-admin
**Last reviewed:** 2026-04-30

## Purpose

Admin CRUD over Schedule **templates** — reusable game-bundles per pengespill-program (one Schedule = one mal containing N sub-games with their ticket-types, jackpot data, Mystery-game config, and timings). A Schedule does not run a game by itself; `DailyScheduleService` (BIN-626) instantiates a Schedule on a given date + hall.

Templates live in `app_schedules`. Sub-game bundles are stored as `sub_games_json` (validated by `validateRowPrizesByColor` + `validateMysteryConfig` from `@spillorama/shared-types`) until BIN-621 normalises them into a relational table. Soft-delete is the default (`deleted_at` + `status='inactive'`); hard-delete is permitted only for un-used inactive templates.

Per BIN-625 the search filter supports `createdBy` + `includeAdminForOwner` so an AGENT sees their own templates plus admin-created templates, matching legacy agent-flyt.

## Public API

```ts
constructor(options: ScheduleServiceOptions)

list(filter?: ListScheduleFilter): Promise<Schedule[]>      // status/type/search/createdBy/limit/includeDeleted
get(id: string): Promise<Schedule>                          // throws SCHEDULE_NOT_FOUND
create(input: CreateScheduleInput): Promise<Schedule>       // throws INVALID_INPUT, SCHEDULE_NUMBER_CONFLICT
update(id, update: UpdateScheduleInput): Promise<Schedule>  // throws INVALID_INPUT, SCHEDULE_NOT_FOUND
remove(id, options?: { hard?: boolean }): Promise<{ softDeleted: boolean }>  // hard requires inactive + unused
```

`Schedule` shape:
- `id, scheduleName, scheduleNumber` (auto-gen `SID_YYYYMMDD_HHMMSS`)
- `scheduleType: "Auto" | "Manual"`
- `luckyNumberPrize: number`
- `status: "active" | "inactive"`
- `isAdminSchedule: boolean`
- `manualStartTime / manualEndTime` (HH:MM)
- `subGames: ScheduleSubgame[]` — fri-form per slot (name, customGameName, timing, ticketTypesData, jackpotData, elvisData, subGameType="STANDARD"|"MYSTERY", extra)
- `createdBy, createdAt, updatedAt, deletedAt`

## Dependencies

**Calls (downstream):**
- `pg.Pool` — DB writes/reads (DB-P0-002 shared pool)
- `@spillorama/shared-types`:
  - `validateMysteryConfig` — Mystery sub-game config validation
  - `validateRowPrizesByColor` — ticket-color × pattern price validation
  - `SUB_GAME_TYPES` — discriminant whitelist
- `node:crypto.randomUUID` — id generation
- `DomainError` — typed error codes consumed by REST layer

**Called by (upstream):**
- `routes/adminSchedules.ts` — primary admin REST surface
- `routes/adminDailySchedules.ts` — Daily schedule references back to a template
- `routes/adminGame1Pots.ts` — pot config references a schedule
- `DailyScheduleService` (`apps/backend/src/admin/DailyScheduleService.ts`) — instantiates a template on a date+hall
- `Game1ScheduleTickService` — periodic eskalering uses `getScheduleSlotById` to inspect a template
- `index.ts` — wires the singleton

## Invariants

- **Auto-generated schedule numbers are timestamp-based.** When `scheduleNumber` isn't provided, `create` generates `SID_YYYYMMDD_HHMMSS`. The DB has a `UNIQUE` constraint on the column, so a 23505 conflict throws `SCHEDULE_NUMBER_CONFLICT` rather than letting the row drop.
- **Soft-delete by default.** `remove(id)` writes `deleted_at = now()` and `status = 'inactive'`. `remove(id, { hard: true })` is allowed only when the row is already `inactive` — but the cross-reference check against `app_daily_schedules` is **not** done here (legacy uses `sub_games_json`-ids, not a direct FK). Follow-up lands with BIN-621/626 unification.
- **`subGames` is opaque-but-validated.** Each slot accepts arbitrary fields under `extra` so admin-UI can round-trip new keys without service changes, but `subGameType` must match `SUB_GAME_TYPES` ("STANDARD" or "MYSTERY") and the row-prizes-by-color must validate with `validateRowPrizesByColor` (9 ticket colors × 5 patterns × per-color prize). For Mystery sub-games, `validateMysteryConfig` enforces the wheel-segment + multiplier shape.
- **`includeAdminForOwner=true` (default) widens `createdBy` filter.** Returns rows where `created_by = createdBy OR is_admin_schedule = true`. This matches legacy: "agent sees own + admin templates". Setting `includeAdminForOwner=false` narrows to strict `created_by` ownership.
- **`includeDeleted=false` (default) hides soft-deleted rows.** Pass `true` for audit/restore use cases.
- **Time format = HH:MM.** `HH_MM_RE = /^[0-9]{2}:[0-9]{2}$/`. `manualStartTime` / `manualEndTime` are validated; date math is delegated to caller (templates don't carry dates — daily schedules do).
- **`Auto` schedule type derives manualStart/End.** When `scheduleType="Auto"` and `manualStartTime`/`EndTime` aren't supplied, `create` derives them from sub-game timings (covered in `ScheduleService.test.ts:246`).
- **Schema-name validation.** `assertSchemaName` rejects anything outside `[a-zA-Z_][a-zA-Z0-9_]*`.

## Test coverage

`apps/backend/src/admin/ScheduleService.test.ts` exercises every input-validation + happy-path:
- "BIN-625 service: create() avviser tom scheduleName"
- "BIN-625 service: create() avviser for lang scheduleName"
- "BIN-625 service: create() avviser ugyldig scheduleType"
- "BIN-625 service: create() avviser tom createdBy"
- "BIN-625 service: create() avviser ugyldig manualStartTime"
- "BIN-625 service: create() avviser negativ luckyNumberPrize"
- "BIN-625 service: create() avviser subGames som ikke-array"
- "BIN-625 service: create() insert + auto-avledet manualStart/End for Auto"
- "BIN-625 service: create() SCHEDULE_NUMBER_CONFLICT på 23505"
- "BIN-625 service: update() bygger SET-klausul kun for oppgitte felt"
- "BIN-625 service: update() avviser tom endring"
- "BIN-625 service: list() bygger søk-filter (ILIKE)"
- "BIN-625 service: list() createdBy + includeAdminForOwner (default)"
- "BIN-625 service: get() kaster SCHEDULE_NOT_FOUND"

## Operational notes

**Common production failures:**
- `SCHEDULE_NUMBER_CONFLICT`: two simultaneous creates collided on auto-generated number (timestamp resolution = seconds). Retry with explicit number or wait 1 s.
- `SCHEDULE_NOT_FOUND`: stale UI or hard-deleted template referenced from a daily schedule. With BIN-621/626 still pending, verify `app_daily_schedules.schedule_id` does not orphan.
- Mystery sub-game rejected: bad payload from admin-UI. `validateMysteryConfig` errors include the exact field — surface to operator.
- Ticket-color row-prizes rejected: `validateRowPrizesByColor` enforces 9 colors × 5 patterns. Operator must fill all required combinations or the API rejects.
- Template that won't hard-delete: the row must be `inactive` first. `remove(id)` then `remove(id, { hard: true })`.
- "AGENT cannot see admin templates": confirm `includeAdminForOwner=true` is the route's default. If false, the agent only sees own.

## Recent significant changes

- **#717** — DomainError moved to shared module
- **#715** (DB-P0-002) — pool consolidation
- **#407** — Schedule supports 9 ticket colors + Mystery Game sub-game type (1:1 legacy paritet)
- **#264** (BIN-625) — initial implementation: schedule template CRUD (4 endpoints)

## Refactor status

Stable. `REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md` notes:
- BIN-621 follow-up: normalise `sub_games_json` into a relational `app_schedule_sub_games` table so cross-ref hard-delete checks become trivial (and `SubGameService` becomes the canonical place for sub-game CRUD instead of the JSON-blob pattern).
- BIN-626 follow-up: a real FK from `app_daily_schedules.schedule_id → app_schedules.id` so `remove({ hard: true })` can refuse to delete templates that are still in use.
