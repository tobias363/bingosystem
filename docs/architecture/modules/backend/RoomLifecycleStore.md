# RoomLifecycleStore

**File:** `apps/backend/src/util/RoomLifecycleStore.ts` (782 LOC)
**Owner-area:** infrastructure
**Last reviewed:** 2026-04-30

## Purpose

Single atomic owner of the three state-spaces that used to leak into each other — armed-set membership, per-player ticket selections, and wallet-reservation IDs — exposed as one async-mutator API protected by a per-room mutex.

Before K2 (PR #732, `7a2c0991`), three independent Maps owned related state: `BingoEngine.rooms.players`, `RoomStateManager.armedPlayerIdsByRoom`, and `RoomStateManager.reservationIdByPlayerByRoom`. Mutators in different code paths could leave the three Maps inconsistent — `cleanupStaleWalletInIdleRooms` deleted from one without touching the other two; `disarmAllPlayers` cleared selections without touching engine state; `bet:arm` wrote to two and trusted the third. The 2026-04-29 prod incident (60 NOK orphan reservation) was the visible symptom. This store collapses ownership behind one mutex per room so half-mutated states are no longer reachable, and it's interface-shaped so the K4 Redis-backed sibling (in flight, separate PR) can drop in behind the same contract.

## Public API

```typescript
export interface RoomLifecycleStore {
  // Arm / disarm — atomic with reservation-mapping
  armPlayer(input: { roomCode, playerId, ticketCount, selections? }): Promise<void>
  disarmPlayer(input: { roomCode, playerId, keepReservation? }): Promise<void>
  disarmAllPlayers(input: { roomCode }): Promise<void>

  // Reservation tracking (co-owned with armed-state)
  setReservationId(input: { roomCode, playerId, reservationId }): Promise<void>
  clearReservationId(input: { roomCode, playerId }): Promise<void>

  // Atomic eviction — the orphan-bug killer
  evictPlayer(input: {
    roomCode, playerId,
    releaseReservation?: boolean,    // default true
    reason?: string
  }): Promise<EvictPlayerResult>     // { hadArmedState, hadReservation, releasedReservationId }

  // Read API — consistent snapshots (no torn reads)
  getPlayerWithArmedState(input): Promise<ArmedPlayerSnapshot | null>
  hasArmedOrReservation(input): Promise<boolean>
  getArmedPlayerIds(roomCode): Promise<string[]>
  getArmedPlayerTicketCounts(roomCode): Promise<Record<string, number>>
  getArmedPlayerSelections(roomCode): Promise<Record<string, TicketSelection[]>>
  getReservationId(input): Promise<string | null>
  getAllReservationIds(roomCode): Promise<Record<string, string>>

  // Arm-cycle (idempotency-key salt for bet:arm)
  getOrCreateArmCycleId(roomCode): Promise<string>

  // Atomic mutator with prorata-cancel semantics
  cancelPreRoundTicket(input: {
    roomCode, playerId,
    onMutateDisplayCache: () => CancelPreRoundTicketResult | null
  }): Promise<CancelPreRoundTicketResult | null>

  // Bulk-eviction sweep (predicate runs INSIDE the per-room mutex)
  evictWhere(predicate: (input) => boolean | Promise<boolean>): Promise<EvictPlayerResult[]>
}

// In-memory impl
export class InMemoryRoomLifecycleStore implements RoomLifecycleStore { … }

// Factory — switches impl by `provider` (memory today; "redis" pending K4)
export function createRoomLifecycleStore(options?: CreateRoomLifecycleStoreOptions): RoomLifecycleStore
```

`InMemoryRoomLifecycleStore` is constructed with optional shared `RoomLifecycleMaps` so `RoomStateManager` can share the same Map references and keep its sync legacy getters working — both surfaces read the same in-memory state, but only the store mutates atomically.

## Dependencies

**Calls (downstream):**
- `node:crypto.randomUUID` — for arm-cycle IDs.
- `util/logger.js` — every `evictPlayer` / `evictWhere` that actually clears state writes a structured info log under `module: "roomLifecycleStore"`.
- Per-room async mutex (`PerRoomMutex`, defined in this file) — chains pending Promises per `roomCode`.

**Called by (upstream):**
- `apps/backend/src/util/roomState.ts` — `RoomStateManager` constructs the in-memory store with shared Maps (`roomState.ts:131`) and exposes it as `lifecycleStore`.
- Socket handlers in `apps/backend/src/sockets/` (specifically `ticketEvents.ts` for `bet:arm` / `ticket:cancel`) flow through the store for atomic mutations.
- `cleanupStaleWalletInIdleRooms` in `index.ts` uses `evictWhere` (replaces the looser preserve-callback shim from PR #724).
- `BingoEngine.startGame` clears the room's lifecycle state via `disarmAllPlayers` after committing reservations.

## Invariants

- **Per-room mutual exclusion.** Every mutator (and the read variants that need consistency) acquires the per-room mutex via `PerRoomMutex.withLock`. Different rooms execute in parallel; the same room serializes. Reads don't see torn snapshots — `armedTicketCount + selections + reservationId` are always coherent within one `getPlayerWithArmedState` call.
- **Eviction clears all three state-spaces atomically.** `evictPlayer` and `evictWhere` invoke `clearPlayerStateLocked` inside the mutex, which deletes from `armedTicketsByRoom`, `armedSelectionsByRoom`, and `reservationsByRoom` in one synchronous block — no caller can observe the in-between state.
- **`releaseReservation: false` returns `releasedReservationId: null`.** When the caller will commit (not release) the reservation, the store does not surface the id — preventing accidental double-release.
- **`disarmAllPlayers` bumps the arm-cycle.** Deletes the `armCycleByRoom` entry so the next `getOrCreateArmCycleId` returns a fresh UUID, which becomes the salt for the next round's `bet:arm` idempotency keys (post-2026-04-27 pilot bug fix).
- **Defensive selection copies.** `armPlayer` deep-copies selection objects before storing; `getArmedPlayerSelections` and `getPlayerWithArmedState` deep-copy on the way out — callers cannot mutate stored selections.
- **`evictWhere` is idempotent and tolerates concurrent mutators.** Candidates are snapshotted first (no mutex), then re-validated INSIDE the per-room mutex before clearing — a player who was disarmed between snapshot and lock returns `null` and is skipped.
- **Predicate constraint for `evictWhere`.** Predicate runs inside the per-room mutex for that candidate's room. It must NOT call back into the store on the SAME room — that would deadlock. Reads on OTHER rooms are fine. Sync external state inspections (e.g. `engine.rooms.get(code).players`) are the typical pattern.
- **Best-effort mutex chain cleanup.** `release` deletes the chain entry only if no waiter has queued behind it; otherwise the next waiter takes over. Prevents unbounded growth for rooms that mutate once and never again.

## Test coverage

- `apps/backend/src/util/__tests__/RoomLifecycleStore.test.ts` — comprehensive suite covering:
  1. Single-mutator semantics (armPlayer, disarmPlayer, evictPlayer, disarmAllPlayers).
  2. Atomicity invariants — eviction always clears all three state-spaces; reservation-only state is observable.
  3. Race-condition tests — concurrent mutators on same room serialize; concurrent on different rooms parallelize; reads don't see torn snapshots.
  4. Read-after-write consistency.
  5. Idempotency of disarm/clearReservation/evict.
  6. `cancelPreRoundTicket` atomic-with-callback semantics.
  7. `evictWhere` bulk-eviction sweep with predicate-side-effects.

## Operational notes

- **Orphan-reservation log signature:** `roomLifecycleStore.evictPlayer { hadReservation: true, releaseReservation: true, releasedReservationId: "<uuid>", reason: "<caller-supplied>" }` — caller is expected to follow up with `walletAdapter.releaseReservation(<uuid>)`. If the wallet release fails, the orphan re-appears on next reconciliation tick — search wallet logs for the same UUID.
- **Mutex contention symptom:** `withLock` chains queue up; visible as elevated socket-event latency for one specific room while others stay healthy. Each lock is short (single-mutator scope), so contention should be rare in practice.
- **Reservation-only state is normal.** During the brief window between `bet:arm` setting the reservation and `armPlayer` writing the armed-set entry, `hasArmedOrReservation` returns true on reservation alone. This is intentional — `cleanupStaleWalletInIdleRooms` must treat such players as in-flight.

## Recent significant changes

- PR #732 (`7a2c0991`, merged 2026-04-29) — initial K2 atomic state owner replacing 3-way Maps. Introduced the interface, in-memory impl, and shared-Map constructor that lets `RoomStateManager` keep sync read-paths.
- Predecessor `6ad51034` — pre-merge commit on the same branch.
- Reference: `docs/audit/REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md` §2.2 + §6 K2 (the audit that motivated the rewrite); `docs/audit/FORHANDSKJOP_BUG_ROOT_CAUSE_2026-04-29.md` §7.1 (the production incident that exposed the leak).

## Refactor status

- **K2 (PR #732, complete):** in-memory impl shipped. `RoomStateManager`'s direct-Map fields are marked `@deprecated` and exposed for backward-compat with sync read-paths only — new write paths must go through `lifecycleStore`.
- **K4 (Redis-backed sibling, in flight):** the interface is Redis-implementable by design — Redis hash-keys + Lua-scripted transactions provide the same atomicity. K4 introduces `RedisRoomLifecycleStore` and a `provider` selector in `createRoomLifecycleStore`. Worktree at the time of writing did not yet contain K4's files; see `docs/audit/REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md` §6 K4 for the rollout plan and `docs/operations/REDIS_KEY_SCHEMA.md` (added by K4) for the key namespace and TTL semantics.
