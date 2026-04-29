# Forhåndskjøp wallet-reservation orphan bug — root cause analysis

**Date:** 2026-04-29
**Author:** Audit agent (Opus 4.7, 1M context)
**Severity:** CRITICAL — money locked indefinitely; no ticket purchase recorded; auditor-visible discrepancy between `wallet_reservations` and `wallet_transactions`/`app_game1_ticket_purchases`
**Pilot impact:** STOP-SHIP candidate — pilot cannot run while money can be silently locked away from a player without buy-in or refund.
**Branch:** `fix/security-bolge-2a-pilot-blockers-split` (worktree `eager-ellis-a9fd5a`)
**Trigger:** Tobias' bug-report 2026-04-29 — reservation `cc909aed-61f1-44b2-aeda-8596761c8ed7` (60 kr) created at 10:36:15, room BINGO_C4A191FC, never committed despite game session 882e0176 starting/ending in same room.

---

## TL;DR

The reservation→commit pipeline has a **silent player-eviction race** between
`bet:arm` (creates reservation) and `onAutoStart`→`startGame` (consumes
reservations). When a player's socket disconnects between those two events
(reload, network blip), the reservation stays alive in `wallet_reservations`
but the eviction in `cleanupStaleWalletInIdleRooms` (called on every later
`room:create`/`room:join` from any player) deletes the player from
`room.players`. `BingoEngine.startGame` then reads `armedSet` (still has the
playerId), reads `room.players` (no longer has the player), and silently
filters the player out of `eligiblePlayers`. The reservation-id is never
read, never committed, never released. `disarmAllPlayers` and
`clearReservationIdsForRoom` then wipe the in-memory mapping. The DB row
sits at `status='active'` until the 30-min TTL.

The root cause is **ownership leak**: arm-state, wallet-reservation, and
player-record have three independent in-memory mutators, two of which can
delete state out from under the third without coordinating.

A second, smaller leak exists: `cleanupStaleWalletInIdleRooms` only checks
`!socketId`, ignoring whether the player has armed-state or an open
reservation. Eviction should be gated on those (or precede them with explicit
release).

The recommended fix is **Option A++**: the cleanup helper should refuse to
evict any player who has armed state or an active reservation in
`reservationIdByPlayerByRoom`, with optional release if the caller insists.
This is the cheapest correct fix — the other options either lose information
(C, restore) or fight the existing architecture (D, dual-path).

---

## 1. Reproduction conditions

All of these must be true for the bug to fire:

1. Player has `wallet_reservations` row with `status='active'` (just clicked "Kjøp bonger" in the pre-round popup).
2. Player's Socket.IO connection is **not currently attached to their player-record in `room.players`** (e.g. a tab reload, mobile app suspend, or any TCP reset; `detachSocket` has set `player.socketId = undefined`).
3. The player's room is **idle** at the moment of cleanup (the just-completed previous round has ended; the new round has not yet started → `currentGame === undefined` or `status === 'ENDED'`).
4. Some socket in the same Node process triggers `room:create` or `room:join` after the disconnect but before the player reconnects via `room:resume`.
5. Auto-round timer fires and `onAutoStart` is invoked before the player gets a `room:resume` opportunity to re-attach.

In Tobias' incident:
- 10:36:15 — `bet:arm` succeeds, reservation `cc909aed` created at `BINGO_C4A191FC`. `wallet_reservations.status='active'`, `expires_at = NOW() + 30 min` ≈ 11:06:15.
- Some time after 10:36:15 and before 10:36:52 — Tobias' socket disconnects (page reload, lobby switch, network blip — exact event isn't preserved in the prod audit trail because `detachSocket` and `disconnect` are not logged at INFO level).
- Some other socket in the process triggers `room:create`/`room:join` (or Tobias himself triggers a fresh `room:create` instead of `room:resume`); `cleanupStaleWalletInIdleRooms(walletId)` walks the engine's room map and deletes Tobias from `BINGO_C4A191FC.players` (idle room, no socket bound — see §2 trace).
- 10:36:52 — `onAutoStart(BINGO_C4A191FC, hostPlayerId)` fires. `armedSet` from `getArmedPlayerIds` still contains Tobias' playerId. `room.players` no longer contains him. `ticketCandidates.filter` silently drops him.
- 10:36:52..10:39:20 — game session 882e0176 runs to completion. No `app_game1_ticket_purchases` row, no `wallet_transactions` row, no compliance ledger entry, no `commitReservation` call.
- 10:36:52 — `disarmAllPlayers(BINGO_C4A191FC)` clears the armed-map (including Tobias' entry). `clearReservationIdsForRoom?.()` clears `reservationIdByPlayerByRoom` (forgetting `cc909aed`).
- 10:39:20..10:56 — reservation row `cc909aed` orphaned; in-memory mapping gone; only `wallet_reservations.expires_at = 11:06:15` would have rescued it (as `expired`, never committed, never released to player).
- 10:56 — Tobias manually released via DB.

**Counter-evidence ruling out other hypotheses:**
- Boot/restart loss is ruled out by the user-supplied note that there was no deploy between 10:13 and 10:36.
- ArmCycleId collision (hypothesis 2) is ruled out: PR #513 + the 2026-04-27 fix make the idempotency key `arm-${roomCode}-${playerId}-${armCycleId}-${newTotalWeighted}`. A new round bumps armCycleId via `disarmAllPlayers` → `armCycleByRoom.delete(roomCode)`, so a fresh `bet:arm` after round-end would get a fresh key. There's no observed reservation collision in the report.
- Dual-path (hypothesis 3) is real but doesn't *cause* this bug — see §6.

---

## 2. Exact race trace with file:line

### Step 1 — bet:arm creates the reservation (succeeds)
- `apps/backend/src/sockets/gameEvents/roomEvents.ts:716-723` (`reservePreRoundDelta` → `armPlayer`):
  ```
  await reservePreRoundDelta(deps, roomCode, playerId, existingWeighted, totalWeighted);
  armPlayer(roomCode, playerId, totalWeighted, merged);
  ```
- Inside `reservePreRoundDelta` (line 185-189):
  ```
  const reservation = await adapter.reserve(walletId, deltaKr, { idempotencyKey, roomCode });
  deps.setReservationId(roomCode, playerId, reservation.id);
  ```
- After this point three independent state stores hold mutated state:
  - DB: `wallet_reservations` row, `status='active'`.
  - `RoomStateManager.reservationIdByPlayerByRoom.get(roomCode).set(playerId, reservation.id)`.
  - `RoomStateManager.armedPlayerIdsByRoom.get(roomCode).set(playerId, totalWeighted)`.
  - `BingoEngine.rooms.get(roomCode).players.get(playerId)` (untouched here, was set when player joined).

### Step 2 — socket disconnects
- Player's transport drops. Socket.IO fires `disconnect` on the server side.
- `apps/backend/src/sockets/gameEvents/lifecycleEvents.ts:39-47`:
  ```
  socket.on("disconnect", (reason: string) => {
    engine.detachSocket(socket.id);
    socketRateLimiter.cleanup(socket.id);
    ...
  });
  ```
- `apps/backend/src/game/BingoEngine.ts:3698-3722` `detachSocket`:
  ```
  detachSocket(socketId: string): { roomCode: string; playerId: string } | null {
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        if (player.socketId === socketId) {
          player.socketId = undefined;
          return { roomCode: room.code, playerId: player.id };
        }
      }
    }
    return null;
  }
  ```
  - Note the explicit comment "ingen wallet-mutasjon her" — disconnect does **not** release reservations.
  - `player.socketId = undefined` is the only mutation.
  - `armedPlayerIdsByRoom`, `reservationIdByPlayerByRoom`, and `room.players` are otherwise unchanged.

### Step 3 — eviction race (the bug)
- Some socket — could be Tobias on a fresh page load, could be another player, could be the same Tobias creating a "new" room by accident — emits `room:create` or `room:join`. Both paths call `cleanupStaleWalletInIdleRooms` aggressively.
- `roomEvents.ts:316`, `:349`, `:373`, `:464`, `:550` — five call sites in the room handlers. Each variant calls `engine.cleanupStaleWalletInIdleRooms(identity.walletId, ...)` on the **calling user's** walletId. **However**, when the calling player is Tobias himself reconnecting via `room:create` (popular when SPA falls back from `room:resume`), or when another path runs through this code, the cleanup walks the engine's full room map.
- `BingoEngine.ts:3740-3761` `cleanupStaleWalletInIdleRooms`:
  ```
  cleanupStaleWalletInIdleRooms(walletId: string, exceptRoomCode?: string): number {
    const normalizedWalletId = walletId.trim();
    if (!normalizedWalletId) return 0;
    const exceptCode = exceptRoomCode?.trim().toUpperCase();
    let cleaned = 0;
    for (const room of this.rooms.values()) {
      if (exceptCode && room.code === exceptCode) continue;
      const isIdle =
        !room.currentGame || room.currentGame.status === "ENDED";
      if (!isIdle) continue;
      for (const player of [...room.players.values()]) {
        if (player.walletId === normalizedWalletId && !player.socketId) {
          room.players.delete(player.id);
          cleaned += 1;
        }
      }
      ...
    }
    return cleaned;
  }
  ```
  - **The bug is here**, lines 3750-3754: only `walletId` and `!socketId` are checked. `armedPlayerIdsByRoom` and `reservationIdByPlayerByRoom` are not consulted.
  - Tobias' player record is deleted from `room.players` for `BINGO_C4A191FC`.
  - The armed-state and reservation-state mappings are untouched (because they live in `RoomStateManager`, not in the engine).

### Step 4 — onAutoStart fires
- `apps/backend/src/util/schedulerSetup.ts:125-152` `onAutoStart`:
  ```
  await deps.engine.startGame({
    roomCode, actorPlayerId: hostPlayerId,
    entryFee: deps.getRoomConfiguredEntryFee(roomCode),
    ticketsPerPlayer: deps.runtimeBingoSettings.autoRoundTicketsPerPlayer,
    payoutPercent: deps.runtimeBingoSettings.payoutPercent,
    armedPlayerIds: deps.getArmedPlayerIds(roomCode),         // ← still includes Tobias
    armedPlayerTicketCounts: deps.getArmedPlayerTicketCounts(roomCode),
    armedPlayerSelections: deps.getArmedPlayerSelections(roomCode),
    gameType: variantInfo?.gameType,
    variantConfig: variantInfo?.config,
    reservationIdByPlayer: deps.getReservationIdsByPlayer?.(roomCode), // ← still includes Tobias
  });
  deps.disarmAllPlayers(roomCode);
  deps.clearReservationIdsForRoom?.(roomCode);
  deps.clearDisplayTicketCache(roomCode);
  ```
  - `armedPlayerIds` still has Tobias because `armedPlayerIdsByRoom` is in `RoomStateManager`, untouched by `cleanupStaleWalletInIdleRooms`.
  - `reservationIdByPlayer` still has Tobias for the same reason.

### Step 5 — startGame silently filters Tobias out
- `apps/backend/src/game/BingoEngine.ts:890-906`:
  ```
  const allPlayers = [...room.players.values()];   // ← Tobias missing
  const armedSet = input.armedPlayerIds ? new Set(input.armedPlayerIds) : null; // ← contains Tobias
  const ticketCandidates = allPlayers.filter((player) => {
    if (armedSet && !armedSet.has(player.id)) return false;   // never sees Tobias to filter
    if (this.isPlayerInAnotherRunningGame(room.code, player)) return false;
    if (this.isPlayerBlockedByRestriction(player, nowMs)) return false;
    return true;
  });
  ...
  const eligiblePlayers = ticketCandidates.length > 0
    ? await this.filterEligiblePlayers(ticketCandidates, entryFee, nowMs, room.hallId)
    : [];
  ```
  - `armedSet.has(player.id)` test runs on each member of `allPlayers`, not the other way around. A playerId that's in `armedSet` but not in `room.players` is silently dropped — there is no log line, no warn, nothing.
- `BingoEngine.ts:935-1031` — the buy-in loop iterates `eligiblePlayers`. Tobias is absent. `commitReservation` is never invoked for `cc909aed`.
- `BingoEngine.ts:1010-1030` — the `recordComplianceLedgerEvent` is also inside the loop. No ledger entry written for Tobias.

### Step 6 — clean-up wipes the in-memory mapping
- Back in `schedulerSetup.ts:141-142`:
  ```
  deps.disarmAllPlayers(roomCode);              // ← clears armedPlayerIdsByRoom incl. Tobias
  deps.clearReservationIdsForRoom?.(roomCode);  // ← clears reservationIdByPlayerByRoom incl. Tobias
  ```
- `RoomStateManager.disarmAllPlayers` (`util/roomState.ts:119-125`) clears all three: `armedPlayerIdsByRoom`, `armedPlayerSelectionsByRoom`, `reservationIdByPlayerByRoom`, and bumps the arm-cycle.

### Step 7 — DB row is now orphaned
- The reservation row remains `status='active'`, `committed_at=NULL`, `released_at=NULL`.
- No code path will ever read `cc909aed` from anywhere. The only recovery is the TTL expiry sweep in `WalletReservationExpiryService` (default 5-min interval, with a 30-second boot-sweep). At 11:06:15 the row would have been marked `expired`. The user observed Tobias' chip-saldo "frigjort" only after manual DB intervention at 10:56.

---

## 3. Other reservation-leak paths discovered

The same orphan pattern can fire in at least **four additional paths**. All write reservation rows to DB but lose the in-memory mapping without releasing the row:

### 3.1. Backend crash / restart between bet:arm and game-start
- Documented as the original motivation for `WalletReservationExpiryService` (`apps/backend/src/wallet/WalletReservationExpiryService.ts:6-9`).
- Mitigation: 30-second boot-sweep + 5-min interval-tick.
- Gap: 30 seconds of locked saldo on restart. Acceptable for ops, but does not help our scenario (no restart).

### 3.2. `cleanupStaleWalletInNonCanonicalRooms` (PILOT-EMERGENCY 2026-04-28)
- `apps/backend/src/game/BingoEngine.ts:3788-3810`. Even more aggressive — deletes the player **even if socketId is still attached** as long as the room is non-canonical.
- Same leak vector: `room.players.delete` without releasing the reservation.
- Lower-likelihood than 3 because non-canonical rooms post-#677 are rare.

### 3.3. `destroyRoom` while reservations are active
- `apps/backend/src/game/BingoEngine.ts:3218-3235`. Throws on `RUNNING` but allows destruction in WAITING / ENDED.
- Does not consult `reservationIdByPlayerByRoom`. Does not call `releaseReservation`.
- Reachable from admin/socket admin tooling. Not a high-traffic path, but a clean-up that should be fixed alongside the main bug.

### 3.4. `startGame` partial-failure rollback
- `apps/backend/src/game/BingoEngine.ts:1032-1044` `refundDebitedPlayers`. The compensation path refunds **debited** players (those whose reservation already committed), but the surviving reservations of UNDEBITED players (whose buy-in loop hadn't reached them yet) **remain `active`**. The transfer/commit loop happens player-by-player; if it throws on the 3rd player, the 4th player's reservation is not released.
- Likelihood: low (only fires on partial wallet failure mid-loop) but produces same orphan symptom.

### 3.5. End-game / game-end resource cleanup is fine
- `endGame` and the post-`startGame` `clearReservationIdsForRoom` are **not** themselves leaks — by the time they run, all reservations have either committed (in `startGame`) or were never created (player wasn't armed). Leaks only occur when `clear*` runs against state that includes a reservation that startGame never consumed. That can only happen if the player was filtered out of `eligiblePlayers`. The two filter conditions are:
  - Not in `room.players` (the bug above).
  - `filterEligiblePlayers` rejects on `balance < entryFee` or compliance loss-limit (`apps/backend/src/game/BingoEngine.ts:3935-3938`).
- The second condition is **also a leak vector** — if `getAvailableBalance` already excludes the reservation, a Tobias-with-low-funds could have his available drop just below `entryFee` and get filtered, never committing the reservation. With `entryFee=10` and `available=9`, the reservation amount of 60 is still locked.

---

## 4. Severity assessment

| Dimension | Assessment |
|---|---|
| Compliance | **CRITICAL.** Pengespillforskriften §11 requires that ledger entries match wallet movements. An orphan reservation does not violate the §71 ledger directly (no STAKE entry is written), but it produces a *hidden* discrepancy: `wallet_reservations` debits the player's available balance while no `wallet_entries`/`wallet_transactions` row exists for the operation. A regulator could ask "why does Tobias appear to have 940 NOK available with a 1000 NOK total?" — the answer must be a pending reservation, but if the reservation is never committed *and* never released, the reconciliation diverges and we cannot point to a corresponding §71 stake. |
| Operational | **HIGH.** The 30-min TTL eventually self-heals, but the player's UX is "I clicked Kjøp Bonger and it took 60 NOK without giving me brett". Repeated occurrences erode trust and make Spillvett-rapporten useless. |
| Audit trail | **HIGH.** No `app_game1_ticket_purchases` row, no `wallet_transactions` row, no compliance ledger entry, but a `wallet_reservations` row that auto-`expired` 30 min later. There is no foreign-key linkage to a game session. Forensic reconstruction from logs is impossible without timestamp correlation. |
| Pilot | **STOP-SHIP candidate.** This is the kind of bug regulators highlight as "missing internal controls". A pilot with this in place is a measurable risk. |
| Scope of incident | **Recurring.** `cleanupStaleWalletInIdleRooms` is called from five paths, fires whenever any user reconnects/joins, and the disconnect-during-arm window is short but nonzero. Likely many silent occurrences before Tobias spotted one (search prod logs for `INSUFFICIENT_FUNDS` retries on next bet:arm or for `[wallet-reservation-expiry] expired N stale reservations` with N > 0). |

---

## 5. Fix-strategy comparison

### Option A — Eviction must release reservations first (recommended)

In `cleanupStaleWalletInIdleRooms`, before deleting the player, check
whether the player has armed state OR an active reservation, and either:

- **A1 (preserve mode, recommended for the bet:arm leak).** Skip the player —
  let `room:resume` re-attach. Player is recoverable.
- **A2 (release mode, recommended for `cleanupStaleWalletInNonCanonicalRooms`
  and `destroyRoom`).** Explicitly call `adapter.releaseReservation` and clear
  the in-memory mapping before deleting the player.

To do this, the engine needs a way to consult `RoomStateManager`. Either:
- Inject a lightweight predicate `hasArmedOrReservation(roomCode, playerId): boolean` into `BingoEngine` constructor.
- Or pass a release-callback to the cleanup method and have callers (in `roomEvents.ts`) supply one that wraps `releasePreRoundReservation`.
- Or move the cleanup OUT of the engine and INTO the socket handler layer, where access to `deps` is already available.

The third option is architecturally cleanest because it keeps the engine
free of socket-layer dependencies — the cleanup IS already a socket-handler
concern (boot-sweep doesn't need it). Recommended migration:

```
// roomEvents.ts (sketch)
function cleanupAfterDisconnect(deps, walletId) {
  // 1. Find candidate (room, player) tuples in idle rooms.
  // 2. For each, if armed or has reservation:
  //      - releaseReservation, clearReservationId, disarmPlayer
  // 3. Then call engine.evictPlayer(roomCode, playerId).
}
```

**Tradeoffs:**
- ✅ Minimal change; only touches the cleanup path.
- ✅ No data loss; reservations always end in committed/released/expired.
- ✅ Compatible with multi-tab / SPA reload.
- ⚠ Requires deciding A1 vs A2 per call-site. The general rule is: A1 (preserve) when the original player might come back (`bet:arm` flow), A2 (release) when we are sure they won't (admin destroyRoom).
- ⚠ Does not solve §3.4 (partial-failure rollback in startGame) — needs a separate fix in `refundDebitedPlayers`.

### Option B — Keep player record alive while reservation is active

Modify `cleanupStaleWalletInIdleRooms` line 3751 to:
```
if (player.walletId === normalizedWalletId
    && !player.socketId
    && !this.hasActiveReservation(player.id))   // NEW
```

**Tradeoffs:**
- ✅ Trivial change.
- ⚠ Requires the engine to hold a reference to `RoomStateManager` (or vice versa). Currently the engine is pure-functional w.r.t. socket-layer state, so this is a bidirectional coupling we'd need to introduce.
- ⚠ Doesn't fix the partial-failure rollback path (3.4) or `destroyRoom` (3.3).
- ⚠ Doesn't fix the secondary leak from `filterEligiblePlayers` (§3.5) — a low-funds player would still leak.

Option A1 is functionally a superset of Option B with cleaner architecture.

### Option C — At boot, restore player records from active reservations

Walk `wallet_reservations WHERE status='active'` at boot and re-insert
phantom player records into the engine's room map.

**Tradeoffs:**
- ❌ Misaligned with the actual incident (no boot involved).
- ❌ Doesn't fix any of the runtime leak paths.
- ❌ Adds startup complexity and a potential for stale data on restart.
- Useful only as a defensive measure for crash-recovery; the existing TTL-expiry already handles that case.

### Option D — Eliminate the dual-path

The user identified that Tobias was on the **legacy auto-round path** (BingoEngine + `game_sessions` + `wallet_reservations`) rather than the **scheduled Spill 1 path** (`Game1DrawEngineService` + `app_game1_scheduled_games` + `app_game1_ticket_purchases`). The scheduled path uses `Game1TicketPurchaseService` which has different (and apparently working) reservation semantics.

**Tradeoffs:**
- ⚠ Large architectural change. The auto-round path is the runtime that auto-rounds (every ~3 min); the scheduled path is the one the *production* admin would use to launch a planned game with a fixed start time.
- ⚠ The auto-round path is the one used in dev / unscheduled play. Removing it deletes a useful test-mode and developer affordance.
- ❌ Doesn't fix the leak — moving Tobias to the scheduled path doesn't release the **already-existing** auto-round leak from the next disconnect-during-arm event from any user.
- ❌ Does not address §3.3 (`destroyRoom`) or §3.4 (partial rollback) which exist in BingoEngine regardless.
- Only useful as a long-term consolidation, not a fix.

### Option E (additional) — Tighten the contract

Even with Option A in place, two improvements harden the system:

1. **Loud failure on phantom armed-id.** `BingoEngine.startGame` should emit a warn-level log when `armedSet.has(player.id)` is true but the player isn't in `room.players`, AND a corresponding warning when `reservationIdByPlayer[playerId]` is set but `player` is not in `eligiblePlayers`. Detection-level only; doesn't fix the leak but makes the next occurrence loudly visible.
2. **Always-release at end of startGame.** After the `eligiblePlayers` loop completes, walk `input.reservationIdByPlayer` keys for any not in `eligiblePlayers` and call `releaseReservation` on each. This is a fail-closed cleanup that covers both §3.5 (low-funds filter) and the silent-eviction case. Combine with §1 logging.

Option E should be applied **in addition to** Option A. It's cheap (1-2 hours) and gives us a defense-in-depth layer.

---

## 6. Recommended fix with risk-analysis

### Two-PR plan

**PR 1 (immediate, ~1 day) — defensive cleanup in startGame.**
Pure backend, no DB migration, easy to roll back. Implements Option E:

- `BingoEngine.startGame` accepts the `reservationIdByPlayer` map.
- After the buy-in loop completes (success path), iterate the map: for any
  playerId NOT in the just-bought set, call
  `walletAdapter.releaseReservation(reservationId)` and log a warn:
  ```
  warn { roomCode, playerId, reservationId, reason }
    "Releasing orphan reservation — player armed but not eligible (excluded by armedSet/playersMap mismatch or filterEligiblePlayers)"
  ```
- Also wrap the partial-failure path in the catch block at line 1032-1044 to
  release any not-yet-committed reservations from `input.reservationIdByPlayer`
  before throwing.

**Risk:** very low. The only concern is if `releaseReservation` is racing
with an ongoing commit — but since this is post-loop in the success path and
post-throw in the failure path, the loop has either committed or thrown for
each playerId we touch. The `releaseReservation` adapter method already
swallows `INVALID_STATE` for already-committed/released rows; we wrap in
try/catch to be safe.

**Result:** orphan reservations no longer accumulate. Even with the
underlying eviction race intact, the downstream consequence (locked saldo)
goes away. The 30-min TTL becomes a fallback rather than the primary
recovery mechanism.

**PR 2 (followup, ~2 days) — fix the eviction race.**

- Move `cleanupStaleWalletInIdleRooms`'s **decision** to the socket handler
  layer (where `RoomStateManager` is already in scope).
- The handler checks: is the candidate player armed or holding a reservation
  in the target idle room?
  - If yes and we're in `room:create`/`room:join` from another caller (default):
    skip — let `room:resume` recover them.
  - If yes and the caller is the SAME walletId starting fresh:
    explicitly release first via `releasePreRoundReservation`, then evict.
  - If no: existing behavior — call a new `engine.evictPlayer(roomCode, playerId)`
    that just deletes from `room.players`.
- Migrate the five existing `engine.cleanupStaleWalletInIdleRooms(...)` call
  sites in `roomEvents.ts` to the new helper.
- Add tests:
  - `roomState.cancelPreRoundTicket.test.ts` already covers ticket:cancel; add
    a sibling `cleanup.preserveActiveReservation.test.ts` for the
    eviction-skip case.
  - End-to-end: bet:arm → disconnect → another player triggers room:join
    → assert the original player still has armed-state, reservation, and
    player-record.

**Risk:** medium. The change touches the room reconnect flow which is tightly
woven with canonical-room handling, group-of-halls, and 4 emergency-fixes
already in `roomEvents.ts`. Two specific sub-risks:

- **PILOT-EMERGENCY 2026-04-28 path (`cleanupStaleWalletInNonCanonicalRooms`)
  intentionally evicts even with active socket.** That path was added to fix
  a specific stuck-state bug. The new logic must preserve that capability —
  in those cases a release-then-evict (Option A2) is correct.
- **Compatibility with `room:resume`.** If we now keep player records around,
  `room:resume` must still work to re-attach the socket. It does today
  (uses `attachPlayerSocket(roomCode, playerId, socketId)` which already
  handles the case). Verify in tests.

**Recommended ordering:** ship PR 1 immediately; PR 2 within the week.

---

## 7. Additional bugs / smells discovered

### 7.1. Three-way ownership without coordination
The bug stems from `BingoEngine.rooms.players`, `RoomStateManager.armedPlayerIdsByRoom`, and `RoomStateManager.reservationIdByPlayerByRoom` being three independent maps that rely on each other but have no contract enforcing consistency. Every consumer of `getArmedPlayerIds` must either trust that `room.players` agrees or filter again. Long-term recommendation: collapse the room-state into a single owner (engine or roomState, not both) with an explicit mutation API that mutates all three atomically.

### 7.2. `disconnect` is not logged at INFO level
`lifecycleEvents.ts:39-47` increments a Prometheus counter and adds a Sentry breadcrumb but doesn't write a log line. In production, post-mortem analysis of "did Tobias disconnect at 10:36:30" requires Sentry. Low-cost win: add `logger.info({ socketId, reason }, "socket disconnected")`.

### 7.3. `cleanupStaleWalletInIdleRooms` returns 0 vs >0 not used by callers
`roomEvents.ts:316`/`349` etc. always invoke without checking the return value. The five `roomEvents.ts:302-307` `if (cleanedCreate > 0) logger.warn(...)` blocks DO log, but the simple-path versions don't. Suggest a unified `logger.info` at every call site to make the eviction visible in operations.

### 7.4. `WalletReservationExpiryService` has no observability per-reservation
`onTick` reports counts only; there's no `onReservationExpired(reservation)`
hook that fires for each row marked expired (the option exists but is not
wired in `index.ts:1281-1287`). Without it, a per-reservation post-mortem
("which player lost 60 NOK silently in the 11:06 sweep?") requires
SQL forensics. Low-cost win: wire `onReservationExpired` to log the
walletId/amount/idempotencyKey/expiresAt of each expired row at WARN.

### 7.5. `destroyRoom` doesn't clean RoomStateManager either
- `BingoEngine.ts:3218-3235` deletes from engine maps but never touches
  `RoomStateManager` (armed, lucky, configured-fee, displayCache,
  reservationIdByPlayerByRoom, variantConfig, chat, armCycle).
- This is a separate leak: destroying a room leaves armed-state, lucky-numbers,
  and reservation-id mappings stranded indefinitely until process-restart.
- Memory grows over time on long-running prod nodes. Probably small (rooms are
  rarely destroyed) but nonzero.

### 7.6. `getReservationIdsByPlayer` returns whatever is in the map without scrub
`schedulerSetup.ts:139` passes `deps.getReservationIdsByPlayer?.(roomCode)`
into `startGame`. If the map happens to contain stale entries from the previous
round (it shouldn't, since `clearReservationIdsForRoom` is called after each
startGame), they would be passed in. Robustness: add a sanity check at the top
of startGame that `reservationIdByPlayer` keys ⊆ `armedPlayerIds` set, with a
warn-log on mismatch.

### 7.7. The dual-path observation
The user noted that `app_game1_scheduled_games` had 0 rows for 2026-04-29 but
`game_sessions` had 10 auto-rounds in BINGO_C4A191FC. This is expected: in dev
or undocumented prod use, the auto-round path runs without a scheduled game.
It's not a bug per se, but it does reveal that production was running *without*
a scheduled game when Tobias played. If pilot configuration is supposed to use
scheduled games exclusively, this is a configuration drift worth flagging
separately. (Out of scope for this audit; logging here for visibility.)

### 7.8. Idempotency key includes armCycleId — but armCycleId is per-room, not per-player
The 2026-04-27 fix (`roomEvents.ts:181-184`) made the key include `armCycleId`.
This works for the documented case but doesn't actually depend on per-player
state. Two players in the same room arming at the same second would never collide
because `playerId` is in the key. The added `armCycleId` mostly helps when the
SAME player re-arms after a round-end. Not a bug, just a note that the comment
on lines 178-180 slightly oversells the scenario this protects against.

---

## 8. Summary table

| Hypothesis from prompt | Verdict | Notes |
|---|---|---|
| 1. `cleanupStaleWalletInIdleRooms` removed Tobias from `room.players` between bet:arm and game-start | ✅ **Confirmed** | Exact race trace in §2. The cleanup helper does not coordinate with armed-state or reservation-state mappings. |
| 2. `armCycleId` collision | ❌ Refuted | Post-PR #513 + 2026-04-27 fix the keys are deterministic per-(roomCode, playerId, armCycleId, totalWeighted). New rounds bump armCycleId. |
| 3. Dual-path conflict (BingoEngine + scheduled) | ⚠ Real but not the cause | Both paths exist; Tobias was on the legacy/auto path. The leak is in BingoEngine; switching paths doesn't fix it. |

| Question from prompt | Answer |
|---|---|
| Other paths where reservations leak? | §3.1–3.5: crash, non-canonical-cleanup, destroyRoom, partial rollback, low-funds filter. |
| Does cleanupStaleWalletInIdleRooms leak if player has armed/reservation? | **YES.** Lines 3751-3754 only check `walletId` and `!socketId`. |
| Does the dual path conflict? | Two engines coexist. Tobias was on the BingoEngine/auto-round path. Scheduled-game path uses `Game1DrawEngineService` and `app_game1_scheduled_games` (0 rows for the day, confirming Tobias was NOT on that path). |
| Recommended fix | Two-PR plan: PR 1 = defensive `releaseReservation` for orphans in `startGame` (Option E). PR 2 = move cleanup decision to socket layer with armed/reservation-aware skip (Option A1) + explicit release for non-canonical aggressive cleanup (Option A2). |

---

## 9. Key file references

- `apps/backend/src/sockets/gameEvents/roomEvents.ts:94-190` — `reservePreRoundDelta`, where the reservation is created.
- `apps/backend/src/sockets/gameEvents/roomEvents.ts:193-211` — `releasePreRoundReservation` (only path that releases pre-round reservations today).
- `apps/backend/src/sockets/gameEvents/roomEvents.ts:316`, `349`, `373`, `464`, `550` — five call sites of `cleanupStaleWalletInIdleRooms`.
- `apps/backend/src/sockets/gameEvents/lifecycleEvents.ts:39-47` — `disconnect` handler. Calls `detachSocket` only.
- `apps/backend/src/game/BingoEngine.ts:852-1031` — `startGame`. Buy-in loop iterates `eligiblePlayers`; players not present here have their reservation orphaned.
- `apps/backend/src/game/BingoEngine.ts:891-906` — armedSet vs `room.players` filter (the silent-drop is here).
- `apps/backend/src/game/BingoEngine.ts:957-997` — commitReservation invocation.
- `apps/backend/src/game/BingoEngine.ts:3698-3722` — `detachSocket`. Sets `socketId = undefined` only.
- `apps/backend/src/game/BingoEngine.ts:3740-3761` — `cleanupStaleWalletInIdleRooms`. The smoking gun.
- `apps/backend/src/game/BingoEngine.ts:3788-3810` — `cleanupStaleWalletInNonCanonicalRooms`. Even more aggressive; same leak vector.
- `apps/backend/src/util/schedulerSetup.ts:125-152` — `onAutoStart`. `disarmAllPlayers` and `clearReservationIdsForRoom` AFTER startGame.
- `apps/backend/src/util/roomState.ts:46-167` — RoomStateManager state (`armedPlayerIdsByRoom`, `reservationIdByPlayerByRoom`, `armCycleByRoom`).
- `apps/backend/src/wallet/WalletReservationExpiryService.ts:52-103` — TTL expiry (5-min interval, 30-second boot-sweep). Only safety net today.
- `apps/backend/src/adapters/PostgresWalletAdapter.ts:2009-2096` — `reserve` impl. Idempotency-key path.
- `apps/backend/src/adapters/PostgresWalletAdapter.ts:2225-2348` — `commitReservation` impl. Verifies status = 'active' before commit.
- `apps/backend/src/adapters/PostgresWalletAdapter.ts:2349-2363` — `expireStaleReservations` impl.
- `apps/backend/src/sockets/gameEvents/ticketEvents.ts:163-248` — `ticket:cancel`. The one path that DOES release reservations correctly.

---

## 10. Recommended Linear ticket structure

- **Parent:** "Wallet reservation orphan bug — pre-purchase money locked when player disconnects between bet:arm and game-start" (CRITICAL, pilot-blocker).
- **PR 1:** "fix(backend): startGame releases orphan reservations for non-eligible armed players" (Option E).
- **PR 2:** "fix(backend): cleanup helpers must release or skip players with active reservations" (Option A1+A2).
- **PR 3 (followup):** "fix(backend): destroyRoom and RoomStateManager destruction must clean room-state mappings" (§7.5).
- **PR 4 (followup):** "obs(backend): expose reservation-expiry per-reservation telemetry; INFO-log socket disconnect" (§7.2 + §7.4).

End of report.
