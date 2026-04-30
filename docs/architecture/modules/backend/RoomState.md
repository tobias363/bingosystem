# RoomStateManager

**File:** `apps/backend/src/util/roomState.ts` (596 LOC)
**Owner-area:** infrastructure
**Last reviewed:** 2026-04-30

## Purpose

In-process owner of the shared mutable Maps that survive across BingoEngine round transitions: chat history, lucky numbers, per-room configured entry fees, the pre-round display-ticket cache, the active variant config, and (post-K2) shared references to the four lifecycle Maps owned atomically by `RoomLifecycleStore`.

This is **not** the persistence layer (that lives in `apps/backend/src/store/RoomStateStore.ts` with in-memory + Redis impls behind a `provider`-switched factory). `RoomStateManager` is a process-local state container — its Maps are the truth for "what tickets is this player viewing right now" and "what variant is room X running" between Engine method calls.

After K2 (PR #732), the four lifecycle Maps (`armedTicketsByRoom`, `armedSelectionsByRoom`, `reservationsByRoom`, `armCycleByRoom`) are co-owned with `RoomLifecycleStore` — `RoomStateManager` keeps sync getters for legacy callers, but new write paths must flow through the store's atomic-mutator API.

## Public API

```typescript
export interface TicketSelection {
  type: string                     // Ticket-type code (e.g. "small", "large", "elvis")
  qty: number
  name?: string                    // Human-readable type name (BIN-688) — e.g. "Small Yellow"
}

export interface ChatMessage {
  id: string; playerId: string; playerName: string;
  message: string; emojiId: number; createdAt: string;
}

export interface RoomVariantInfo {
  gameType: string                 // Slug ("bingo", "rocket", "monsterbingo", "spillorama")
  config: GameVariantConfig
}

export class RoomStateManager {
  // Shared state Maps
  readonly chatHistoryByRoom: Map<string, ChatMessage[]>
  readonly luckyNumbersByRoom: Map<string, Map<string, number>>
  readonly roomConfiguredEntryFeeByRoom: Map<string, number>
  readonly displayTicketCache: Map<string, Ticket[]>           // Key: `${roomCode}:${playerId}`
  readonly variantByRoom: Map<string, RoomVariantInfo>

  // K2: deprecated direct-Map access — co-owned with lifecycleStore
  /** @deprecated */ readonly armedPlayerIdsByRoom: Map<string, Map<string, number>>
  /** @deprecated */ readonly armedPlayerSelectionsByRoom: Map<string, Map<string, TicketSelection[]>>
  /** @deprecated */ readonly reservationIdByPlayerByRoom: Map<string, Map<string, string>>
  /** @deprecated */ readonly armCycleByRoom: Map<string, string>

  // K2: canonical atomic-mutator API
  readonly lifecycleStore: RoomLifecycleStore

  constructor()

  // Armed players (sync read paths — backed by shared Maps)
  getArmedPlayerIds(roomCode): string[]
  hasArmedOrReservation(roomCode, playerId): boolean
  getArmedPlayerTicketCounts(roomCode): Record<string, number>
  getArmedPlayerSelections(roomCode): Record<string, TicketSelection[]>
  armPlayer(roomCode, playerId, ticketCount?, selections?): void
  disarmPlayer(roomCode, playerId): void
  disarmAllPlayers(roomCode): void
  getOrCreateArmCycleId(roomCode): string

  // Reservations (BIN-693 Option B)
  getReservationId(roomCode, playerId): string | null
  setReservationId(roomCode, playerId, reservationId): void
  clearReservationId(roomCode, playerId): void
  getAllReservationIds(roomCode): Record<string, string>

  // Lucky numbers + entry fee
  getLuckyNumbers(roomCode): Record<string, number>
  getRoomConfiguredEntryFee(roomCode, fallbackEntryFee): number

  // Display tickets — pre-round queue
  getOrCreateDisplayTickets(roomCode, playerId, count, gameSlug, colorAssignments?): Ticket[]
  replaceDisplayTicket(roomCode, playerId, ticketId, gameSlug): Ticket | null
  clearDisplayTicketCache(roomCode): void
  getPreRoundTicketsByPlayerId(roomCode): Record<string, Ticket[]>     // BIN-690 — adoption snapshot

  // Variant config — canonical for engine.startGame
  setVariantConfig(roomCode, info): void
  getVariantConfig(roomCode): RoomVariantInfo | null
  bindDefaultVariantConfig(roomCode, gameSlug): void
  async bindVariantConfigForRoom(roomCode, opts: { gameSlug, gameManagementId?, fetchGameManagementConfig? }): Promise<void>

  // Atomic mid-round cancel (BIN-692)
  cancelPreRoundTicket(roomCode, playerId, ticketId, variantConfig): { removedTicketIds, remainingTicketCount, fullyDisarmed } | null
}
```

State persistence (separate concern): `apps/backend/src/store/RoomStateStore.ts` exposes the room-state persistence factory used by `BingoEngine` for crash-recovery. `ROOM_STATE_PROVIDER` env (`memory` | `redis`) selects between `InMemoryRoomStateStore` and `RedisRoomStateStore`. That factory is unrelated to this in-process manager — they coexist: Engine writes through the persistence store, while `RoomStateManager` holds ephemeral in-process projections for socket layer consumption.

## Dependencies

**Calls (downstream):**
- `RoomLifecycleStore` (`InMemoryRoomLifecycleStore`) — constructed in the constructor with shared Maps so legacy sync getters stay coherent with atomic mutators.
- `node:crypto.randomUUID` — for arm-cycle IDs (legacy sync path; store has its own).
- `game/ticket.js` `generateTicketForGame(gameSlug)` — for `getOrCreateDisplayTickets` and `replaceDisplayTicket`. Throws on unknown slugs (BIN-672 fix).
- `game/variantConfig.js` `getDefaultVariantConfig(gameType)` — fallback for `bindDefaultVariantConfig`.
- `game/spill1VariantMapper.js` `buildVariantConfigFromSpill1Config(...)` — Spill 1 admin-config mapper (PR B).
- `util/logger.js` — `module: "roomState"` child for fallback-warns when GameManagement lookup fails.

**Called by (upstream):**
- `apps/backend/src/index.ts` — single instance constructed at boot, passed to socket handlers, draw scheduler callbacks, and `BingoEngine` recovery paths.
- Socket handlers (`apps/backend/src/sockets/*`) — `bet:arm` calls `armPlayer`; `ticket:cancel` calls `cancelPreRoundTicket`; chat / lucky-number events update their respective Maps.
- `BingoEngine.startGame` reads `getVariantConfig` for the current round and calls `getPreRoundTicketsByPlayerId` to adopt the displayed grids as the live tickets (BIN-690).
- `apps/backend/src/util/__tests__/roomState.hasArmedOrReservation.test.ts` and `apps/backend/src/util/roomState.bindVariantConfigForRoom.test.ts` — unit tests.

## Invariants

- **Shared Maps with `lifecycleStore`.** The constructor allocates four `Map`s and passes them to `new InMemoryRoomLifecycleStore(maps)` so the store's atomic mutators write to the same memory the deprecated getters read from. Both surfaces see fresh data without an async hop.
- **Display-cache key format.** `${roomCode}:${playerId}` — guarded by `clearDisplayTicketCache(roomCode)` which prefix-matches and deletes everything for that room (BIN-690 adoption invariant).
- **BIN-672 — `gameSlug` required for ticket generation.** `getOrCreateDisplayTickets` and `replaceDisplayTicket` accept `gameSlug` explicitly; passing undefined is a TS error and `generateTicketForGame` throws on unknown slugs at runtime. This was the root-cause fix for BIN-619/BIN-671 where missing slug silently produced 3×5 Databingo60 tickets in a Spill 1 75-ball room.
- **Color-assignment cache invalidation (BIN-688).** `getOrCreateDisplayTickets` invalidates the cache when `colorAssignments` change shape, even if `count` matches — `colorsMatch` returns false for any per-ticket color/type mismatch, forcing regeneration so UI matches the new armed selections.
- **`bindDefaultVariantConfig` is idempotent.** If `variantByRoom.has(roomCode)` already, returns immediately — explicit admin-configured variants always win over defaults. Safe to call unconditionally after every room creation/restore.
- **`bindVariantConfigForRoom` is fail-safe.** DB/network errors during `fetchGameManagementConfig` are caught and logged; the method always falls back to `bindDefaultVariantConfig` so a Spill 1 room never starts without a variant config.
- **`disarmAllPlayers` bumps the arm-cycle.** Deletes `armCycleByRoom[roomCode]` so the next round's `bet:arm` idempotency keys are fresh — pilot-bug fix 2026-04-27.
- **`cancelPreRoundTicket` (BIN-692) preserves bundle integrity.** When canceling a single ticket from a bundled type (Large = 3 brett, Elvis = 2, Traffic-light = 3), all `bundleSize` consecutive tickets are spliced out together. Wallet is NOT touched — pre-round arm hasn't been debited yet (Engine commits at `startGame`).

## Test coverage

- `apps/backend/src/util/__tests__/roomState.hasArmedOrReservation.test.ts` — covers the K2 preserve-callback predicate that protects mid-flight bet:arm players from `cleanupStaleWalletInIdleRooms`.
- `apps/backend/src/util/roomState.bindVariantConfigForRoom.test.ts` — covers the DB-fetch happy path, the fallback to default on missing/malformed config, and the GameManagement lookup error path.
- `apps/backend/src/util/__tests__/RoomLifecycleStore.test.ts` — exercises the shared-Map invariant via the store side; reads through `RoomStateManager` getters confirm the same data.
- `apps/backend/src/store/RoomStateStore.test.ts` — separate concern (persistence factory), but worth knowing about: validates that `BingoEngine`-side serialization round-trips correctly through both in-memory and Redis impls.

## Operational notes

- **Cache-coherence symptom:** UI shows stale ticket colors after armed selections change. Verify the latest `bet:arm` payload has fresh `colorAssignments` and `getOrCreateDisplayTickets` was called — `colorsMatch` should have invalidated the cache.
- **Variant fallback log:** `module: "roomState"` WARN line "GameManagement-lookup failed — fallback til default-variantConfig" indicates the DB lookup failed for a configured `gameManagementId`. Room still starts with default Spill 1 config, but admin-overrides are not applied. Investigate the DB error.
- **K2 deprecation watch:** any new code path that mutates `armedPlayerIdsByRoom` / `reservationIdByPlayerByRoom` directly is a regression. New writes must flow through `lifecycleStore.armPlayer` / `evictPlayer` / etc. Direct-Map writes bypass the per-room mutex and reintroduce the orphan-reservation risk.
- **Display-cache memory:** entries persist until `clearDisplayTicketCache(roomCode)` (called by Engine on round-end) or `disarmPlayer`. Long-running rooms with many players will accumulate cache entries — that's expected; the LRU bound is "rooms still in `engine.rooms`".

## Recent significant changes

- PR #732 (`7a2c0991`, K2) — atomic state owner introduction. Constructor pre-allocates `RoomLifecycleMaps` and shares them with `InMemoryRoomLifecycleStore`. Direct-Map fields marked `@deprecated`. Reference: `docs/audit/REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md` §2.2 + §6 K2.
- PR #724 (`4e255b65`) — preserve players with armed/reservation state during stale-wallet cleanup. Introduced `hasArmedOrReservation` for the cleanup predicate. K2 supersedes the `isPreserve` callback shim with `evictWhere`.
- PR #674 (`28c45ffc`) — round-scoped idempotency keys: `getOrCreateArmCycleId` and `disarmAllPlayers` arm-cycle bump.
- PR #458 (`bbffff58`) — BIN-693 Option B wallet reservation at bet:arm. Introduced `setReservationId` / `clearReservationId` / `getAllReservationIds`.
- PR B (recent) — `bindVariantConfigForRoom` async lookup against `GameManagement.config_json` with fallback to default, fail-safe on errors.
- BIN-690 — `getPreRoundTicketsByPlayerId` adoption snapshot for Engine.startGame so live brett match what the player saw while arming.
- BIN-688 — color-assignment cache invalidation in `getOrCreateDisplayTickets` so swapping selections updates the UI without stale cache.
- BIN-692 — `cancelPreRoundTicket` atomic mid-round cancel with bundle semantics.
- BIN-672 — `gameSlug` required parameter on display-ticket generators (root-cause fix for Spill 1 wrong-format bug).

## Refactor status

- **K2 (PR #732, complete):** lifecycleStore co-ownership shipped. Direct-Map access is `@deprecated` and will be removed once all socket handlers route through `lifecycleStore`.
- **K4 (Redis-backed sibling, in flight):** the `lifecycleStore` field will switch from `InMemoryRoomLifecycleStore` to `RedisRoomLifecycleStore` via the factory in `createRoomLifecycleStore` (separate file, not yet in worktree). `RoomStateManager` itself stays in-process — only the lifecycle Maps move to Redis.
- The `displayTicketCache` and `variantByRoom` Maps remain in-process (per-pod) for both K2 and K4 — they're rebuilt on snapshot adoption, not on every socket event, so the cost of process-locality is acceptable.

See `docs/audit/REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md` §2.2 + §6 K2 for the K2 rollout, and §6 K4 for the Redis migration plan.
