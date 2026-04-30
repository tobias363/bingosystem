# RoomLifecycleService

**File:** `apps/backend/src/game/RoomLifecycleService.ts` (471 LOC)
**Owner-area:** game-runtime
**Last reviewed:** 2026-04-30

## Purpose

Stand-alone service owning the **room-lifecycle flow** for ad-hoc Spill 1/2/3 rooms — extracted in F2-C (REFACTOR_AUDIT_PRE_PILOT_2026-04-29 §3.3 / HV-3) so the `createRoom` / `joinRoom` / `destroyRoom` / `listRoomSummaries` / `getRoomSnapshot` methods are no longer hosted inside `BingoEngine.ts`.

The service handles:

1. **`createRoom`** — wallet KYC/play-block check, cross-room dup guard, `walletAdapter.ensureAccount` + `getAvailableBalance` (BIN-693), random or caller-supplied room-code, hall-shared / test-hall flags, structured `room.created` + `room.player.joined` log events.
2. **`joinRoom`** — HALL_MISMATCH guard (skipped for `room.isHallShared`), wallet KYC + cross-room dup (with `exceptRoomCode`) + within-room dup checks, `walletAdapter.ensureAccount` + `getBalance` (1:1 preserved), single `room.player.joined` log.
3. **`destroyRoom`** — `ROOM_NOT_FOUND` / `GAME_IN_PROGRESS` guards, K2 atomic per-player eviction via `releaseAndForgetEviction` callback, K2 arm-cycle disarm via `disarmAllPlayersForRoom` callback, engine-local cache eviction via `cleanupRoomLocalCaches` callback, final `rooms.delete`.
4. **`listRoomSummaries`** — read-side projection of all rooms, sorted by `code.localeCompare`.
5. **`getRoomSnapshot`** — full snapshot via `serializeRoom` callback (engine retains `serializeGame` ownership).

## Public API

```typescript
export class RoomLifecycleService {
  constructor(
    walletAdapter: WalletAdapter,
    rooms: RoomStateStore,
    callbacks: RoomLifecycleCallbacks,
  )

  async createRoom(input: RoomLifecycleCreateInput): Promise<{ roomCode: string; playerId: string }>
  async joinRoom(input: RoomLifecycleJoinInput): Promise<{ roomCode: string; playerId: string }>
  destroyRoom(roomCode: string): void
  listRoomSummaries(): RoomSummary[]
  getRoomSnapshot(roomCode: string): RoomSnapshot
}

export interface RoomLifecycleCreateInput {
  playerName: string
  hallId: string
  walletId?: string
  socketId?: string
  roomCode?: string                          // fixed code (e.g. "BINGO1")
  gameSlug?: string                          // "bingo" | "rocket" | …
  effectiveHallId?: string | null            // null → hall-shared (Spill 2/3)
  isTestHall?: boolean                       // Demo Hall bypass
}

export interface RoomLifecycleJoinInput extends RoomLifecycleCreateInput {
  roomCode: string                           // required for join
}

export interface RoomLifecycleCallbacks {
  assertHallId(hallId: string): string
  assertPlayerName(playerName: string): string
  assertWalletAllowedForGameplay(walletId: string, nowMs: number): void
  assertWalletNotInRunningGame(walletId: string, exceptRoomCode?: string): void
  assertWalletNotAlreadyInRoom(room: RoomState, walletId: string): void
  serializeRoom(room: RoomState): RoomSnapshot
  syncRoomToStore(room: RoomState): void
  releaseAndForgetEviction(roomCode: string, playerId: string, walletId: string): void
  disarmAllPlayersForRoom(roomCode: string): void
  cleanupRoomLocalCaches(roomCode: string): void
}
```

## Dependencies

**Calls (downstream):**
- `WalletAdapter.ensureAccount` — materialize account before first use.
- `WalletAdapter.getAvailableBalance` (preferred, BIN-693) / `getBalance` (fallback) — for `createRoom` host balance.
- `WalletAdapter.getBalance` — used by `joinRoom` (1:1 preserved; not switched to `getAvailableBalance` for backward compat).
- `RoomStateStore.set` / `get` / `delete` / `keys` / `values` — in-memory + persistent store I/O.
- `makeRoomCode` from `ticket.js` — random 6-char code generator.
- `logRoomEvent` from `util/roomLogVerbose.js` — structured `room.created` / `room.player.joined` log events.
- Callbacks (engine-internal helpers): assertion helpers (hallId, playerName, wallet-guards), `serializeRoom`, `syncRoomToStore`, `releaseAndForgetEviction` (K2 atomic eviction wrapper), `disarmAllPlayersForRoom`, `cleanupRoomLocalCaches`.

**Called by (upstream):**
- `BingoEngine.createRoom` — thin delegate (~3 lines).
- `BingoEngine.joinRoom` — thin delegate.
- `BingoEngine.destroyRoom` — thin delegate.
- `BingoEngine.listRoomSummaries` — thin delegate.
- `BingoEngine.getRoomSnapshot` — thin delegate.
- Indirectly: every Socket.IO `room:create` / `room:join` / `admin:destroyRoom` handler via `roomEvents.ts` and admin namespaces.

## Invariants

- **No internal state.** Service holds references to `walletAdapter`, `rooms`, and `callbacks`; mutations land on the supplied `rooms` store and on the `RoomState` records inside it.
- **Caller owns assertion-helper internals.** The service requires `assertHallId` / `assertPlayerName` callbacks because BingoEngine enforces additional limits (max 120 / 24 chars) used by other engine methods. Inlining them here would duplicate the contract.
- **Wallet balance lookup choice is preserved 1:1.**
  - `createRoom` uses `getAvailableBalance` (BIN-693 — klient-visning matcher det som faktisk er tilgjengelig).
  - `joinRoom` uses `getBalance` (gross). Switching `joinRoom` to `getAvailableBalance` would change the snapshot semantics for guest players and is intentionally kept out of F2-C.
- **HALL_MISMATCH guard fires after `requireRoom`** — so `ROOM_NOT_FOUND` always wins when a stale code is passed alongside a wrong hall. Mirror the inline implementation byte-for-byte.
- **K2 atomic destroy.** Every player-eviction goes through `releaseAndForgetEviction` (which routes through `lifecycleStore.evictPlayer({releaseReservation:true})`), then `disarmAllPlayersForRoom` clears arm-cycle as a single side-effect. The callback no-ops when `lifecycleStore` is unwired (test harnesses).
- **Engine-local cache eviction stays on the engine.** The `cleanupRoomLocalCaches` callback is the only seam between this service and the per-room Maps owned by BingoEngine (variantConfigByRoom, luckyNumbersByPlayer, drawLocksByRoom, lastDrawAtByRoom, roomLastRoundStartMs, roomStateStore.delete). When the engine grows new caches, the callback grows with it; the service stays decoupled.
- **Two log events for createRoom, one for joinRoom.** Createroom emits both `room.created` and `room.player.joined` (host); joinRoom emits only `room.player.joined` (guest). Order + fields mirror the pre-extraction implementation.

## Test coverage

- `apps/backend/src/game/__tests__/RoomLifecycleService.test.ts` — F2-C unit tests for the wiring + delegate-pattern + service-level invariants (18 cases). Pins that the engine methods are thin delegates, the K2 lifecycleStore plumbing is hidden behind callbacks, the HALL_MISMATCH guard fires from the service, and create/join/destroy all behave correctly end-to-end via the engine.
- `apps/backend/src/game/BingoEngine.test.ts` — main suite (44 top-level test() calls covering create/join/start/draw/claim end-to-end + multi-room edge cases). Exercises the service end-to-end via `engine.createRoom/joinRoom/destroyRoom`.
- `apps/backend/src/game/BingoEngine.testHall.endsRoundOnFullHus.test.ts` — confirms `isTestHall` flag persists through `createRoom` (PR #741 semantics).
- `apps/backend/src/game/BingoEngine.demoHallBypass.test.ts` — Demo Hall bypass that depends on `isTestHall` being persisted on `RoomState`.

## Operational notes

The service has no internal state, so operational issues come from the wired dependencies:

- `INVALID_HALL_ID` / `INVALID_NAME` — caller passed empty/oversized strings. Fix at the socket handler.
- `WALLET_BLOCKED` / `KYC_PENDING` — `assertWalletAllowedForGameplay` denied entry. Player needs to clear loss-limit / pause / KYC.
- `PLAYER_ALREADY_IN_RUNNING_GAME` — `assertWalletNotInRunningGame` matched another active room. Resume the existing room instead of creating a new one.
- `PLAYER_ALREADY_IN_ROOM` — duplicate wallet in same room. Caller should use `room:resume` for reconnect.
- `ROOM_NOT_FOUND` — code does not exist. Common in scheduled-game cleanup races where the room was destroyed before the join arrived.
- `HALL_MISMATCH` — the joining hall doesn't match `room.hallId`, and the room is NOT marked `isHallShared`. Spill 1 enforces this strictly; Spill 2/3 explicitly opt out via `effectiveHallId: null`.
- `GAME_IN_PROGRESS` — `destroyRoom` was called while a round is RUNNING. Caller should `endGame` first or wait for completion.
- `ensureAccount FAILED` log line — wallet adapter is unable to materialize the account. Check Postgres connectivity / wallet-DB availability. The error propagates to the socket handler.
- `getAvailableBalance FAILED` log line — same root cause as `ensureAccount`. Service does NOT swallow these (unlike PhasePayoutService).

## Recent significant changes

- F2-C `refactor/f2c-extract-room-lifecycle-service` (this PR): extracted from `BingoEngine.ts`. Behavior fully equivalent to the inline implementation:
  - Same wallet flow (`ensureAccount` + `getAvailableBalance`/`getBalance`).
  - Same room-code generation (random via `makeRoomCode`, override via `input.roomCode`).
  - Same isHallShared / isTestHall flag plumbing.
  - Same K2 atomic destroy (per-player eviction via lifecycleStore + arm-cycle disarm).
  - Same engine-local cache eviction list (variantConfigByRoom, luckyNumbersByPlayer, drawLocksByRoom, lastDrawAtByRoom, roomLastRoundStartMs, roomStateStore).
  - Same structured `room.created` + `room.player.joined` log events.

## Refactor status (audit-rapport REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md)

- F2-C complete. The room-lifecycle methods on `BingoEngine.ts` (`createRoom` ≈100 LOC + `joinRoom` ≈40 LOC + `destroyRoom` ≈30 LOC + `listRoomSummaries` + `getRoomSnapshot` ≈15 LOC) are now isolated in this service. Engine line-count dropped from 4434 → 4364 LOC (-70 LOC). The cleaner separation-of-concerns (lifecycle-flow vs engine-internal cache management) is the bigger win than raw LOC reduction — future bølger can swap room storage backends (e.g. RoomStateStore implementations) without touching engine internals.
- **Future bølge:** consider moving `assertWalletNotInRunningGame` and `assertWalletNotAlreadyInRoom` into the service since they are only used by `createRoom`/`joinRoom`. Kept on the engine for F2-C because they reference the engine's `rooms` iterator directly and would need additional callback-port plumbing.
- **Possible follow-up:** unify `createRoom` and the scheduled-engine's room-spawn path so both share the same wallet-flow + hall-shared marking. Out of scope for F2-C; tracked in the larger HV-3 audit.
