# Pre-Pilot Refactor Audit — 2026-04-29

**Author:** Audit agent (Opus 4.7, 1M context)
**Branch:** `fix/security-bolge-2a-pilot-blockers-split` (worktree `eager-ellis-a9fd5a`)
**Scope:** Backend, Spill 1 game-flow, Agent-portal flow
**Trigger:** Tobias asks whether to keep patching (8 critical bugs in last 24h: PRs #722–727 + schema-archaeology) or stop and refactor structurally before pilot. He is willing to delay pilot a few weeks for proper fixes.
**Method:** Read in full or in part — `BingoEngine.ts` (5136 lines), `Game1DrawEngineService.ts` (3103 lines), `Game1TicketPurchaseService.ts` (1359 lines), `Game1PayoutService.ts` (574 lines), `roomState.ts`, `WalletService.ts`, `WalletReservationService`/`WalletOutbox`, `AgentSettlementService.ts` (786 lines), `AgentTransactionService.ts` (866 lines), `AgentShiftService.ts`, `ComplianceLedger`, layered router/socket files, and the three audit docs from earlier today (`FORHANDSKJOP_BUG_ROOT_CAUSE_2026-04-29.md`, `SCHEMA_DIVERGENCE_AUDIT_2026-04-29.md`, `LIVE_ROOM_OBSERVABILITY_2026-04-29.md`).

---

## TL;DR — top 5 things to fix BEFORE pilot

| # | Item | Severity | Effort | Pilot-blocker | Patch ok? |
|---|------|----------|-------:|---------------|-----------|
| 1 | **Collapse the dual game-engine architecture** (BingoEngine ad-hoc + Game1DrawEngineService scheduled). Pick scheduled as the only Spill 1 path; quarantine BingoEngine for Spill 2/3 only. | CRITICAL | 8–12 dev-days | YES (regulatorily significant) | Patches won't fix the duplication — refactor required |
| 2 | **Atomic Room/Arm/Reservation state owner.** Today `BingoEngine.rooms.players` + `RoomStateManager.armedPlayerIdsByRoom` + `RoomStateManager.reservationIdByPlayerByRoom` are three independent mutable maps with NO contract. PR #724 added a preserve-callback as patch; the underlying ownership leak remains. | CRITICAL | 5–7 dev-days | YES (silent eviction / orphan reservations) | Patch is a band-aid; structural fix needed |
| 3 | **In-memory state on single-instance assumption.** RoomStateManager, drawLocksByRoom, variantConfigByRoom, luckyNumbersByPlayer all in process memory. Render runs single-instance today; a restart loses ALL pre-round state. Cleanup-on-boot is incomplete (PR #722 caught some cases). For pilot the failure mode is: deploy mid-shift = silently broken arm-state. | CRITICAL | 4–6 dev-days (move to Redis with proper TTL) | YES if any deploy during pilot day | Cannot patch — needs Redis-backed shared state |
| 4 | **Engine error-handling silently swallows `evaluateActivePhase` errors.** Loop continues firing same error 29× in 1 minute (saw this in prod 14:18). No circuit-breaker, no escalation, no "halt-the-room" path. | HIGH | 1–2 dev-days | YES — repeats in prod = mass complaint | Patchable but should fix root with circuit breaker |
| 5 | **Schema-CI gate.** Yesterday's archaeology found 9 ghost migrations (registered as run, schema effect missing). Two more were missed and Tobias had to apply them by hand today. With 127 migrations and no CI shadow-DB diff gate, the next ghost is a question of when, not if. Each prod ghost means runtime bugs at peak load. | HIGH | 2 dev-days (new GitHub Action that runs migrations on shadow DB and diffs vs prod schema) | YES (operational stability) | Cannot patch — preventive infrastructure |

**Effort summary:**
- **Pilot-blockers (1–5):** 20–29 dev-days = ~4–6 calendar weeks at 1 dev (or 2.5–4 weeks with 2 devs in parallel where the work allows).
- **High-value (§4):** another 22–30 dev-days.
- **Total to "pilot-quality":** **42–59 dev-days** = **8–12 calendar weeks at 1 dev**, or **5–7 weeks with 2 devs**.

This is structural, not cosmetic. **Recommend delay pilot 4–5 weeks** to do K1+K2+K3+K4 below. Continued patching against the dual-path / three-way ownership / in-memory-only architecture will produce a steady drip of similar bugs through pilot — auditor's worst case.

---

## 1. Methodology

### What I audited

| Area | Coverage |
|------|----------|
| `BingoEngine.ts` | Read fully (5136 lines) |
| `Game1DrawEngineService.ts` | Read full constructor + `startGame` + `drawNext` + `pauseGame`/`resumeGame`/`stopGame` + `assignRoomCode` |
| `Game1TicketPurchaseService.ts` | Read fully (1359 lines) |
| `Game1PayoutService.ts` | Read fully (574 lines) |
| `RoomStateManager` (`util/roomState.ts`) | Read fully (540 lines) |
| `AgentSettlementService.ts` | Read fully (786 lines) |
| `AgentTransactionService.ts` | Read fully (866 lines) |
| `AgentShiftService.ts` | Read first 1200 lines |
| `WalletReservationService.ts` (lines 1–800+) | Read full with `commitReservation`/`releaseReservation` paths |
| `WalletOutboxService.ts` + `WalletReservationExpiryService.ts` | Read fully |
| `index.ts` (boot / DI wiring) | Read full 9900+ lines, focus on dep-wiring + scheduler setup |
| `apps/backend/src/sockets/gameEvents/` | Listed full (20 files) but NOT read individually — used the FORHANDSKJOP audit doc as proxy |
| `apps/backend/src/agent/`, `compliance/`, `wallet/`, `auth/` directory listings | Listed all files |
| `docs/audit/FORHANDSKJOP_BUG_ROOT_CAUSE_2026-04-29.md` | Read fully |
| `docs/audit/SCHEMA_DIVERGENCE_AUDIT_2026-04-29.md` | Read fully |
| `docs/operations/LIVE_ROOM_OBSERVABILITY_2026-04-29.md` | Read fully |
| `docs/architecture/MASTER_PLAN_SPILL1_PILOT_2026-04-24.md` | Read first 100 lines |

### What I skipped (deliberate)

- Frontend game-client code (`packages/game-client/`) — outside backend scope, but I noted item 19 from the prompt about end-of-round visual UX is real.
- Migration SQL files individually — relied on yesterday's audit.
- Test-suite content. I verified test FILES exist (e.g. `BingoEngine.crit6Atomicity.test.ts`, `Game1DrawEngineService.physicalTicket.test.ts`) but did not read test bodies. The test file COUNT is itself a signal — see §3.8.
- I did NOT run prod DB queries in this run. The earlier audits already enumerated the data.
- I did NOT read `apps/admin-web/src/pages/agent/*` directly. I audited the backend agent service layer instead, which is where the regulatorily critical logic lives. Frontend agent-portal UX issues are out of scope for a backend refactor audit.

### Limitations

- BingoEngine is 5136 lines; I read it in chunks but had to summarize at points. Fine-grained method-level analysis of every line was not possible. Instead I focused on structural patterns (state ownership, error handling, transaction boundaries, dual-paths).
- I have NOT validated effort estimates against Tobias's velocity. I assume mid-senior engineer with full context, not Claude-speed.
- Many recommendations would benefit from a one-day spike before the full estimate locks in.

---

## 2. Critical-path issues (block pilot or regulatory risk)

### 2.1 [CRIT-1] Dual game-engine architecture — BingoEngine vs Game1DrawEngineService

**Severity:** CRITICAL
**Type:** ARCHITECTURE / COMPLIANCE
**Pilot-blocker:** Yes
**Regulatory risk:** Yes — auditor cannot easily verify which engine processed a given round
**Effort:** 8–12 dev-days (full quarantine + tests)
**Patch vs refactor:** Cannot be patched — duplication causes recurring bugs

**Evidence:**
- `apps/backend/src/game/BingoEngine.ts:1` — 5136 lines. Full game lifecycle: createRoom, joinRoom, startGame, drawNextNumber, submitClaim, payoutPhaseWinner, pauseGame, resumeGame, endGame, destroyRoom.
- `apps/backend/src/game/Game1DrawEngineService.ts:1` — 3103 lines. Full game lifecycle for SCHEDULED Spill 1: startGame, drawNext, pauseGame, resumeGame, stopGame, assignRoomCode, getRoomCodeForScheduledGame.
- `BingoEngine.ts:911` `assertNotScheduled(room)` — defensive guard added because the dual-engine bugs cropped up in prod ("Defensiv guard mot dual-engine state-divergens").
- `BingoEngine.ts:874–906` `markRoomAsScheduled(roomCode, scheduledGameId)` — explicit hand-off mechanism.
- The FORHANDSKJOP audit confirms: "The user noted that Tobias was on the **legacy auto-round path** (BingoEngine + `game_sessions` + `wallet_reservations`) rather than the **scheduled Spill 1 path** (`Game1DrawEngineService` + `app_game1_scheduled_games` + `app_game1_ticket_purchases`)."
- Two parallel SQL tables: `game_sessions` (BingoEngine) vs `app_game1_scheduled_games` + `app_game1_game_state` + `app_game1_draws` + `app_game1_ticket_purchases` + `app_game1_phase_winners` + `app_game1_ticket_assignments` (scheduled).
- Two parallel reservation flows: BingoEngine commits via `walletAdapter.commitReservation` in `startGame` (`BingoEngine.ts:1086`), scheduled commits via `Game1PayoutService.payoutPhase` (different shape).
- Two parallel compliance ledger paths: BingoEngine writes ledger entries inline at `BingoEngine.ts:1135–1155` (STAKE) and `BingoEngine.ts:1834–1855` (PRIZE), scheduled writes via `Game1PayoutService.ts:390+` and `Game1TicketPurchaseService.ts:606+` respectively.
- BingoEngine has its own complex internal state (variantConfigByRoom, variantGameTypeByRoom, luckyNumbersByPlayer, drawLocksByRoom, lastDrawAtByRoom, roomLastRoundStartMs, miniGameRotation) — Game1DrawEngineService does NOT share this state.

**Why it matters for pilot:**
- The same regulatorily-required §11 ledger entries are written from TWO code paths with subtly different metadata. Auditor reads `app_rg_compliance_ledger` and finds STAKE/PRIZE pairs that look similar but came from different code — they have to verify both paths individually.
- Bugs are fixed in one path and missed in the other. PR #432 (Innsatsen pot), PR #443 (compliance multi-hall binding), PR #453 (transferHallAccess), and the `assertNotScheduled` guard all exist BECAUSE of dual-path drift.
- Mini-game activation has TWO triggers: `onAutoClaimedFullHouse` callback (BingoEngine.ts:1646) AND `triggerMiniGamesForFullHouse` (Game1DrawEngineService.ts:1450) — two sets of bugs to fix.
- The 14:18 prod incident (28 identical "Wallet house-... mangler saldo" errors) was on BingoEngine's `payoutPhaseWinner` path because the room was non-scheduled. A scheduled room would not have hit it — different RTP-cap logic.
- Tobias' bug-report 2026-04-29 (the 60kr orphan reservation) was on BingoEngine, not Game1DrawEngineService. The fix in PR #724 only patched BingoEngine's path; Game1DrawEngineService has different but related issues.

**Fix-strategy (the only one that works long-term):**

**Step 1 (1 day):** decide and document: scheduled is canonical for Spill 1; BingoEngine is for Spill 2 / Spill 3 / dev/test only. (Tobias has informally said this; make it explicit.)

**Step 2 (3–4 days):** add `assertSpill1NotAdHoc` guard at the public `BingoEngine.startGame` entry point. If `room.gameSlug === "bingo"` AND `room.scheduledGameId === undefined`, throw `ROUTE_TO_SCHEDULED_API`. The guard should also apply on `joinRoom`, `markRoomAsScheduled`, and any code that branches on slug. Add a feature flag `SPILL1_ALLOW_ADHOC=false` (default) for test environments.

**Step 3 (2–3 days):** delete or quarantine the BingoEngine code that ONLY runs for Spill 1 ad-hoc — the auto-round timer (`onAutoStart` for `bingo` slug), the per-color BingoEngine variant resolution for Spill 1 (kept only for Spill 2/3), the auto-claim `onAutoClaimedFullHouse` mini-game trigger for Spill 1, and `BingoEngine.ts:2222` autoClaimPhaseMode (move to Game1DrawEngineService entirely).

**Step 4 (1–2 days):** verify test coverage. The test file `BingoEngine.assertNotScheduled.test.ts` already exists — extend it. Add a test that `BingoEngine.startGame` for `bingo`-slug WITHOUT `scheduledGameId` throws.

**Step 5 (1–2 days):** runbook + rollback plan. Add a feature flag to revert if a hall breaks.

**Skipped:** deleting BingoEngine entirely is much larger (would need to port Spill 2/3 + ad-hoc test paths). Out of scope for pilot prep — the quarantine is sufficient.

### 2.2 [CRIT-2] Three-way ownership leak: Room players + Armed-state + Reservation-id

**Severity:** CRITICAL
**Type:** ARCHITECTURE
**Pilot-blocker:** Yes
**Regulatory risk:** Yes — orphan reservations are documented in `FORHANDSKJOP_BUG_ROOT_CAUSE` as auditor-visible anomaly
**Effort:** 5–7 dev-days
**Patch vs refactor:** Patch (PR #724 preserve-callback) prevents the symptom but not the root cause

**Evidence:**

Three independent maps with implicit consistency contract:

```
BingoEngine.rooms.get(roomCode).players      ← engine state
RoomStateManager.armedPlayerIdsByRoom         ← util state
RoomStateManager.reservationIdByPlayerByRoom  ← util state
```

- `apps/backend/src/util/roomState.ts:50,52,63` — three separate Maps in `RoomStateManager`.
- `apps/backend/src/game/BingoEngine.ts:391` — `rooms` is owned by engine.
- `apps/backend/src/sockets/gameEvents/roomEvents.ts:185-189` — `bet:arm` sets all three:
  ```
  await reservePreRoundDelta(...)        // sets reservation
  deps.setReservationId(...)              // adds to RoomStateManager.reservationIdByPlayerByRoom
  armPlayer(...)                          // adds to RoomStateManager.armedPlayerIdsByRoom
  // BingoEngine.rooms.players.get(playerId) was set at room:join
  ```
- `apps/backend/src/game/BingoEngine.ts:3740-3761` — `cleanupStaleWalletInIdleRooms` mutates ONLY `rooms.players`, not the other two maps.
- `apps/backend/src/util/roomState.ts:141-147` — `disarmAllPlayers` mutates `armedPlayerIdsByRoom` and `reservationIdByPlayerByRoom` but not `rooms.players`.

PR #724 added the `isPreserve` callback (`BingoEngine.ts:4386-4407`) to skip eviction when the player has armed state. This is correct as a near-term mitigation, but:

1. **It only addresses one of the four cleanup paths.** `cleanupStaleWalletInNonCanonicalRooms` (`BingoEngine.ts:3788-3810`) is more aggressive (evicts even with active socket) and does NOT check the preserve-callback. `destroyRoom` (`BingoEngine.ts:3783`) doesn't touch RoomStateManager mappings. `refundDebitedPlayers` partial-failure path (BingoEngine.ts:1032+) leaves reservations of UNDEBITED players orphaned.
2. **It depends on the SOCKET LAYER passing the right callback.** Other callers (admin tools, cron jobs, boot-sweep) don't have access to RoomStateManager and would invoke the legacy 2-arg form, leaking again.
3. **It cannot prevent the legitimate need to evict a player.** A player who joined a hall, switched halls, and the canonical-room handler decides to evict — we want eviction, but we ALSO need to release the reservation. The current callback says "skip evict if armed" but that creates a different orphan: the player record stays alive in a room they no longer want.

**Why it matters for pilot:** in the pilot day's 100+ rounds × 4 halls × dozens of players, the disconnect/reconnect window is tens-of-seconds wide and fires constantly. Every silent eviction = locked saldo for 30 min until TTL = customer complaint. Spillorama trust degrades visibly during pilot.

**Fix-strategy:**

The right answer is **single-owner state**. RoomStateManager and BingoEngine.rooms should not be three independent Maps. One owner, atomic mutation API:

```typescript
class RoomLifecycleStore {
  // single map keyed by roomCode → atomic record
  private rooms: Map<string, RoomLifecycleRecord>;

  // atomic-mutator API that mutates ALL state needed for a logical action
  async armPlayer(input): { reservationId; totalWeighted } { ... }
  async cancelPreRoundTicket(input): { ... } { ... }
  async commitArmedPlayersAtStartGame(input): { committed; evicted } { ... }
  async evictPlayer(input, options: { releaseReservation: bool }): { ... }
}
```

**Step 1 (2 days):** introduce `RoomLifecycleStore` interface that wraps the three Maps. Existing code keeps using same Map references (zero behavior change). Add the atomic mutator methods that BingoEngine and roomEvents and cleanupStale all use.

**Step 2 (2 days):** migrate cleanup helpers (cleanupStaleWalletInIdleRooms, cleanupStaleWalletInNonCanonicalRooms, destroyRoom, refundDebitedPlayers partial-failure) to call `evictPlayer({ releaseReservation: true })`. Remove the preserve-callback (no longer needed because eviction now does the right thing inline).

**Step 3 (1–2 days):** migrate bet:arm + ticket:cancel + onAutoStart to use the atomic API. Verify FORHANDSKJOP test scenarios pass.

**Step 4 (0.5 day):** add invariant test — every reservation row in `wallet_reservations` with `status='active'` has either (a) a corresponding entry in `RoomLifecycleStore` or (b) created within the last 5 minutes (TTL gap).

### 2.3 [CRIT-3] In-memory-only state on single-instance assumption

**Severity:** CRITICAL
**Type:** ARCHITECTURE / SECURITY (operational)
**Pilot-blocker:** YES if any deploy occurs during pilot day
**Regulatory risk:** Audit trail gap during restart window
**Effort:** 4–6 dev-days
**Patch vs refactor:** Cannot be patched — needs Redis-backed shared state

**Evidence:**

In-memory state in `BingoEngine`:
- `roomLastRoundStartMs` (`BingoEngine.ts:392`)
- `lastDrawAtByRoom` (`BingoEngine.ts:398`)
- `drawLocksByRoom` (`BingoEngine.ts:414`)
- `variantConfigByRoom` (`BingoEngine.ts:445`)
- `variantGameTypeByRoom` (`BingoEngine.ts:459`)
- `luckyNumbersByPlayer` (`BingoEngine.ts:475`)

In-memory state in `RoomStateManager`:
- `chatHistoryByRoom`, `luckyNumbersByRoom`, `roomConfiguredEntryFeeByRoom`,
- `armedPlayerIdsByRoom`, `armedPlayerSelectionsByRoom`, `displayTicketCache`,
- `variantByRoom`, `reservationIdByPlayerByRoom`, `armCycleByRoom`.

When the process restarts:
1. Reservations in DB are recovered via `WalletReservationExpiryService` (good — but only as expired, not as live state).
2. Game state is recovered via `BingoEngineRecovery` checkpoints (good for game data).
3. **Arm-state and reservation-id-mapping is LOST.** A player who armed at 09:55, restart at 09:56, would silently lose their pre-round purchase even though `wallet_reservations` has status='active'.
4. PR #722 cleanup-on-boot tries to restore but missed cases. The `staleRoomBootSweep` only re-creates rooms for those that have a `game_sessions` row in `WAITING` or `RUNNING` — pre-round (no session yet) is invisible.

The auto-bind fallback in `BingoEngine.ts:2185-2201` ("VARIANT_CONFIG_AUTO_BOUND") is itself an indicator: prod code knows that variantConfigByRoom can be empty after restart. The fallback patches over the gap by re-binding default config — but this means:
- If admin had configured custom Spill 1 patterns for a hall, those would be silently replaced with default until the next admin save.
- The cache-miss is logged at error-level but the system silently degrades.

The "load-tests/" directory exists in the repo — but I did not see signs it tests the multi-instance / restart scenario. Actually, Render runs single-instance Starter plan, which is fine for now BUT:
- A deploy at 14:00 mid-shift would kill all in-memory state. PR #726 added 25 INFO-level events but only AFTER the architectural decision to use Redis for room-state was deferred.
- ANY scale-out (which the pilot plan implies for multi-hall future) requires fixing this.

**Why it matters for pilot:** if Render's worker crashes (OOM, infrastructure event) during the pilot day, the recovery story is incomplete. Even setting aside crash, a deploy at 17:00 to push a small fix would lose all pre-round state for every active room. With 4 halls running 12 rounds each evening, that's ~50 silent failures per deploy.

**Fix-strategy:**

**Step 1 (1 day):** audit ALL in-memory state in BingoEngine and RoomStateManager. Document each map: what's the persistence story?

**Step 2 (3–4 days):** move the regulatorily critical maps to Redis with TTL:
- `armedPlayerIdsByRoom` — Redis hash, 30-min TTL (matches reservation TTL)
- `reservationIdByPlayerByRoom` — Redis hash, 30-min TTL
- `armedPlayerSelectionsByRoom` — Redis hash, 30-min TTL
- `displayTicketCache` — Redis (large, but bounded per room) — TTL 60 min
- `armCycleByRoom` — Redis string, 30-min TTL
- `roomConfiguredEntryFeeByRoom` — derived, leave in-memory but recompute from `app_game1_scheduled_games` config on cache-miss
- `variantConfigByRoom` — Redis hash + DB-based recompute on miss (the auto-bind fallback at BingoEngine.ts:2198 handles this)
- `lastDrawAtByRoom`, `roomLastRoundStartMs` — Redis with short TTL (5-min, only used for rate-limiting)
- `drawLocksByRoom` — Redis lock with timeout (use `SET key val NX EX 30` pattern)
- `luckyNumbersByPlayer` — Redis hash per room, scoped to game-id

**Step 3 (1 day):** boot-sweep enhancement: scan Redis at startup, replay armed-state into a fresh process. Combined with existing `staleRoomBootSweep` for game-sessions, this gives full recovery.

**Step 4 (0.5 day):** test by triggering a process kill mid-shift in staging.

**Skipped:** moving everything to Redis — display ticket cache in particular is large and read-heavy; if it becomes a bottleneck, defer to post-pilot.

### 2.4 [CRIT-4] Engine error-handling silently swallows recurring errors with no circuit-breaker

**Severity:** HIGH (verging on CRITICAL given prod evidence)
**Type:** OBSERVABILITY / RELIABILITY
**Pilot-blocker:** Yes — repeats in prod
**Regulatory risk:** No directly, but produces noise that hides regulatorily significant errors
**Effort:** 1–2 dev-days
**Patch vs refactor:** Patchable but should fix root with proper circuit breaker

**Evidence:**

- `BingoEngine.ts:2210-2212` `onDrawCompleted` hook errors are caught and logged but loop continues:
  ```
  } catch (err) {
    logger.error({ err, gameId: game.id, roomCode: room.code }, "onDrawCompleted hook failed");
  }
  ```
- `BingoEngine.ts:2225-2229` same for `evaluateActivePhase`:
  ```
  } catch (err) {
    logger.error({ err, gameId: game.id, roomCode: room.code }, "[BIN-694] evaluateActivePhase failed");
  }
  ```
- LIVE_ROOM_OBSERVABILITY doc references the 2026-04-29 14:18-14:19 prod incident: "engine logget 29 identiske `Wallet house-... mangler saldo` errors før runden endte." This is the silent-swallow pattern firing 29 times in 1 minute.
- `Game1DrawEngineService.ts:1259-1264` Oddsen-resolve has the same pattern: "Hvis resolve kaster (wallet-feil, osv.) ruller hele drawet tilbake — ingen half-committed state." So it does halt — but only for Oddsen.
- `Game1PayoutService.ts:326+` wallet-credit failure DOES throw `PAYOUT_WALLET_CREDIT_FAILED` and roll back. That's correct.

The pattern is: **wallet-mutating errors halt; non-wallet errors continue.** This is the right principle, but it has no rate-limiting. If `evaluateActivePhase` keeps failing for the same reason on every draw (like the 14:18 incident), the system fires the same error N times until the operator manually pauses.

**Fix-strategy:**

**Step 1 (0.5 day):** Add a per-room error counter for `evaluateActivePhase`/`onDrawCompleted`. After 3 consecutive same-cause errors, automatically pause the room with `pauseGame(reason: "engine_evaluator_repeated_failure")` and emit `room.engine.degraded` event.

**Step 2 (0.5 day):** Add a Sentry alert (already integrated per prompt context) for `engine.evaluator.repeated-error` at 5+ events/minute. This catches 14:18-style incidents in real-time.

**Step 3 (0.5 day):** Better error categorization. The "Wallet house-... mangler saldo" was a regulatorily-relevant error that happened to be inside a swallowed catch. Wallet-shortage errors should ALWAYS halt the room (degrades to `pauseGame`) — they're not transient.

### 2.5 [CRIT-5] Schema-CI gate prevents another ghost-migration cycle

**Severity:** HIGH
**Type:** OBSERVABILITY / OPERATIONAL
**Pilot-blocker:** Yes (operational stability)
**Regulatory risk:** Indirectly — yesterday's ghosts caused runtime errors that auditor would see as "system can't read its own data"
**Effort:** 2 dev-days
**Patch vs refactor:** Cannot be patched — preventive infrastructure

**Evidence:**

- Yesterday's `SCHEMA_DIVERGENCE_AUDIT_2026-04-29.md` found 9 ghost migrations (registered as run, schema effect missing).
- Two more were missed and applied by hand today.
- 127 migrations in `apps/backend/migrations/` — opportunity for drift only grows.
- The migration runner is `node-pg-migrate` (per `render.yaml` `npm --prefix apps/backend run migrate`). It registers a row in `pgmigrations` regardless of partial-application, which is the root cause.
- No CI step diffs prod schema vs declared.

**Fix-strategy:**

**Step 1 (0.5 day):** add a CI job that boots a clean Postgres container, runs all migrations from scratch, and dumps `information_schema.columns` + `pg_indexes` + `pg_constraint` etc. Compare against a checked-in `schema-snapshot.sql`. Any diff fails the build.

**Step 2 (1 day):** add a second CI job that boots a clean Postgres, applies ONLY the migration registered in `pgmigrations` from prod (not files in the repo), then runs `pg_dump --schema-only`. Compare against the schema reproduced from the file-tree migration. Diff = ghost detected.

**Step 3 (0.5 day):** wire the audit script (`/tmp/parse_migrations.py` etc. from yesterday's archaeology) into a long-form integration test that runs nightly against staging.

**Skipped:** no automatic ghost-repair — ghosts must be reviewed and patched explicitly. CI gate is detection, not auto-fix.

---

## 3. High-value refactors (significantly improves correctness/maintainability)

### 3.1 [HV-1] Multi-protocol mini-game collapse

**Severity:** HIGH
**Type:** ARCHITECTURE
**Pilot-blocker:** No (currently both protocols work)
**Effort:** 2–3 dev-days

**Evidence:**
- `BingoEngine.ts:1646-1657` — `onAutoClaimedFullHouse` callback fires `activateMiniGameHelper` for ad-hoc auto-claim path.
- `Game1DrawEngineService.ts:1450-1489` — `triggerMiniGamesForFullHouse` for scheduled path.
- Both paths converge on `Game1MiniGameOrchestrator.maybeTriggerFor` but are wired differently.
- BIN-690 added the orchestrator; the recent patches added the auto-claim trigger; both still emit different socket events to the client.

**Fix-strategy:** unify behind `Game1MiniGameOrchestrator` with single trigger API. Once dual-engine quarantine (CRIT-1) lands, only the scheduled trigger remains and this becomes free-of-charge.

### 3.2 [HV-2] Wallet/RTP/payout architecture — prize pool funding model

**Severity:** HIGH
**Type:** COMPLIANCE
**Pilot-blocker:** Probably no, but auditor-visible
**Effort:** 4–6 dev-days

**Evidence:**
- `BingoEngine.ts:1409` — `prizePool = sum of all per-player buy-ins`. RTP-cap is `payoutPercent * prizePool`.
- Multi-phase payouts (1 Rad 100kr + 2 Rader 200kr + 3 Rader 300kr + 4 Rader 400kr + Fullt Hus 1000kr = 2000kr per legacy spec) cannot fit RTP-budget on a typical 60-kr-buy-in × 5 players = 300 kr pool with 80% RTP = 240 kr budget.
- Today's RTP-cap-bug fix (PR #726 / `BingoEngine.ts:1717-1771`) handled the consequence: `payout = min(face, remainingPayoutBudget, houseBalance)`. But this means **fixed-prize Spill 1 will routinely not be paid out** when pools are small.
- The hall does NOT pre-fund prizes from cash_balance — `app_halls.cash_balance` (per HallCashLedger) is for agent-cash settlement, not for guaranteeing fixed prizes.
- This is a regulatorily-visible gap: the audited STAKE entry shows e.g. 300kr collected, the audited PRIZE entry shows e.g. 100kr paid, the published `Spill 1 — 1 Rad 100kr` looks like a fixed prize but isn't. Auditor reads this as "advertised premium not honored."

**Fix-strategy:**
- **Option A (preferred, larger):** introduce a per-hall `prize_pool_balance` that the hall manager tops up. PRE-fund the hall's per-round prize pool from this balance. RTP-cap is replaced by "house guarantees fixed prizes; if balance runs out, halt the round." This matches legacy Spillorama behavior.
- **Option B (smaller):** make Spill 1 fixed-prize patterns advertise as max, not guaranteed. Update marketing copy to say "1 Rad: opp til 100 kr". Existing RTP-cap stays.
- **Option C (smallest):** keep current RTP-cap, accept that small pools won't fill prizes. Accept the audit risk by documenting the regulatory position in `docs/compliance/`.

This is a product decision, not just code. Tobias should pick.

### 3.3 [HV-3] Engine code length / extract pattern-evaluator service

**Severity:** MEDIUM
**Type:** MAINTAINABILITY
**Effort:** 3–4 dev-days

**Evidence:**
- `BingoEngine.ts` is **5136 lines** (`apps/backend/src/game/BingoEngine.ts:5136`). 162 game/test files in the directory.
- `Game1DrawEngineService.ts` is **3103 lines**.
- `Game1MasterControlService.ts` is **1708 lines**.
- `ComplianceManager.ts` is **1186 lines**.

These files are at the threshold where reading from end-to-end becomes infeasible. Multiple concerns overlap. Pattern-evaluation and payout were already extracted (`BingoEnginePatternEval.ts`, `BingoEngineRecovery.ts`), but the dispatch-logic and state-orchestration is still in BingoEngine.

**Fix-strategy:** with the dual-engine quarantine (CRIT-1), BingoEngine could shrink to ~2000 lines (Spill 2/3 only). Subsequently, extract:
- `BingoEngineRoomLifecycle` — createRoom/joinRoom/destroyRoom + cleanup helpers
- `BingoEngineDrawDispatch` — drawNextNumber + lock + recovery
- `BingoEngineClaimDispatch` — submitClaim + payout + audit-trail (already partially extracted to `runPostTransferClaimAuditTrail`)
- Remaining `BingoEngine` becomes a thin façade.

This is medium priority. Skip for pilot prep.

### 3.4 [HV-4] Compliance-ledger inconsistency: BingoEngine writes ledger inline; scheduled writes via port

**Severity:** MEDIUM
**Type:** ARCHITECTURE / COMPLIANCE
**Effort:** 1–2 dev-days

**Evidence:**
- `BingoEngine.ts:1135-1155` writes STAKE entries directly via `this.ledger.recordComplianceLedgerEvent(...)` (engine-internal).
- `Game1TicketPurchaseService.ts:606-624` writes STAKE entries via `complianceLedgerPort.recordComplianceLedgerEvent(...)` (port-injected).
- `Game1PayoutService.ts:390-412` similar — port-injected.

The port pattern is correct; BingoEngine uses the older inline pattern. Once dual-engine quarantine lands, this inconsistency can be cleaned up.

### 3.5 [HV-5] Event protocol fragmentation — no contract document

**Severity:** MEDIUM
**Type:** OBSERVABILITY / ARCHITECTURE
**Effort:** 1 day for documentation, ongoing for enforcement

**Evidence:**
- `apps/backend/src/sockets/gameEvents/` has 16 .ts files (excluding tests). No central protocol doc.
- The prompt mentions BIN-690 confirmed listener drift — backend still emits `bet:rejected` after frontend removed listener.
- The prompt mentions `minigame:activated` (legacy) + `mini_game:trigger` (scheduled) — confirmed in `BingoEngine.ts:1646` (legacy emit) and `Game1DrawEngineService.ts:1450` (scheduled).
- LIVE_ROOM_OBSERVABILITY doc enumerates 25 socket/engine events but doesn't capture wire-event inventory.

**Fix-strategy:**
- Write `docs/architecture/SOCKET_EVENT_PROTOCOL.md` with every emit + every listener, version-stamped per release.
- Add a TS type in `packages/shared-types/src/socket-events.ts` that captures the union of all legitimate events. Backend/frontend type-check against this.
- Wire-contract test (`apps/backend/src/sockets/__tests__/wireContract.test.ts` exists) — extend it to cover all events, fail on drift.

### 3.6 [HV-6] Compliance multi-hall semantics — cross-hall accumulation

**Severity:** MEDIUM
**Type:** COMPLIANCE
**Effort:** 1–2 dev-days

**Evidence:**
- PR #443 fixed `actor_hall_id` binding on STAKE/PRIZE entries. Verified at `BingoEngine.ts:1136-1155` (`hallId: room.hallId`) — but `room.hallId` is the master-hall, not the buyer-hall in multi-hall scheduled games.
- `Game1PayoutService.ts:391` correctly uses `winner.hallId` (per-purchase hall).
- `Game1TicketPurchaseService.ts:607` correctly uses `input.hallId` (per-purchase hall).
- BingoEngine still has the bug noted in the original master-plan (`MASTER_PLAN_SPILL1_PILOT_2026-04-24.md` §1.1). The §11-rapport per hall would be wrong for multi-hall ad-hoc rooms IF such rooms exist for Spill 1. The CRIT-1 quarantine handles this by routing Spill 1 to scheduled (which is correct). For Spill 2/3 ad-hoc, room.hallId == owner-hall is correct semantic.

**Fix-strategy:** addressed by CRIT-1.

### 3.7 [HV-7] Boot/recovery robustness for pre-game state

**Severity:** MEDIUM
**Type:** OBSERVABILITY / RELIABILITY
**Effort:** 1–2 dev-days

**Evidence:**
- `apps/backend/src/util/staleRoomBootSweep.ts` exists.
- `BingoEngineRecovery.ts:142+` has snapshot restore.
- But: `WalletReservationExpiryService.ts` only marks rows as expired; it doesn't reconstitute live arm-state.
- The 30-second boot sweep in `WalletReservationExpiryService` (mentioned in FORHANDSKJOP §3.1) is reactive, not proactive.

**Fix-strategy:** combine with CRIT-3 (Redis migration). Once arm-state is in Redis with TTL matching reservation TTL, boot-sweep becomes natural — Redis already has the state.

### 3.8 [HV-8] Test coverage gaps — many of last 24h's bugs not caught

**Severity:** MEDIUM
**Type:** TESTING
**Effort:** ongoing — 3–5 dev-days for high-leverage gaps

**Evidence:**
- 162 files in `apps/backend/src/game/` total. Many test files exist (`BingoEngine.adhocPhase3to5Repro.test.ts`, `BingoEngine.crashRecoveryPartialPayout.test.ts`, etc.).
- But the FORHANDSKJOP bug was a multi-process state interaction (room:join from another player triggering cleanupStaleWalletInIdleRooms, which evicted Tobias). This kind of test requires a multi-socket integration suite.
- The 14:18 prod incident (RTP cap on fixed prizes) was not caught by any of `BingoEngine.percentModeZeroPayout.test.ts`, `BingoEngine.payoutTargetSide.test.ts`, etc. The fix in PR #726 added RTP-cap-bug test cases.
- Buy-popup optimistic-render bug fixed in PR #725 — that's frontend; not in scope.

**Specific high-leverage tests to add:**
- **Multi-socket pre-round race:** player A arms, player B joins triggering cleanup, verify A's reservation+armed survives.
- **Restart recovery for pre-round state:** start a game, kill the process between bet:arm and onAutoStart, restart, verify either commit-then-start or release-then-restart (not orphan).
- **Settlement diff threshold edge cases:** `AgentSettlementService.computeDiffSeverity` boundary tests at 500/1000 NOK and 5/10 percent — already in `AgentSettlementService.test.ts` but verify.
- **Multi-hall STAKE binding:** end-to-end test that purchase from hall B in master-A round writes `hallId=B` to ledger.

### 3.9 [HV-9] Agent-portal wallet/settlement audit (skipped agent-UI but reviewed backend)

**Severity:** MEDIUM
**Type:** COMPLIANCE
**Effort:** 1–2 dev-days verification

**Evidence (backend audit):**
- `AgentTransactionService.ts:295-393` — `processCashOp` is well-structured. PR #522 hotfix moved the dual-tx (delta + insertIdempotent) into a single `agentStore.runInTransaction`. ON CONFLICT DO NOTHING means retries after partial-failure don't double-credit. Wallet idempotency-key keyed on `clientRequestId` (not txId). This is correct.
- `AgentTransactionService.ts:610-706` — `cancelPhysicalSale` is a counter-transaction with related_tx_id. Works correctly. Owner-check + 10-min window + ADMIN-force.
- `AgentSettlementService.ts:178-317` — `closeDay` is comprehensive: aggregate transactions, compute diff, threshold-gating with FORCE_REQUIRED for >1000 or >10%, transfer dailyBalance to hall.cash_balance via HallCashLedger, register SHIFT_DIFFERENCE if diff != 0.
- `AgentSettlementService.ts:325-359` — `uploadBilagReceipt` correctly enforces AGENT-can-only-edit-own.
- `AgentSettlementService.ts:443-553` — two formulas: `calculateShiftDelta` (deprecated K1-A) + `calculateWireframeShiftDelta` (K1-B). Both exported. Reasonable for backward-compat but the deprecated one should be removed when frontend has migrated.

**Issues found:**
- `AgentSettlementService.ts:281-285` `closeDay` uses non-atomic 4-step write (markShiftSettled → settlements.insert → applyCashTx for daily-balance → applyCashTx for diff). If the process crashes between step 1 and 2, the shift is marked settled but no settlement row exists. The `app_agent_settlements` row is what audits read; missing it is recoverable but requires manual SQL.
- `AgentSettlementService.ts:316` — `await this.hallCash.applyCashTx(...)` in the catch-up path. If hall_cash_transactions is missing the row but settlement is committed, the `hall.cash_balance` would not include the daily-balance. Recoverable but auditor-visible.

**Fix-strategy:** wrap `closeDay` in `pool.connect() / BEGIN ... COMMIT` with all four operations using the same client. Same pattern as `AgentTransactionService.processCashOp`.

### 3.10 [HV-10] Concurrency / race conditions

**Severity:** MEDIUM (varies)
**Type:** ARCHITECTURE / RELIABILITY
**Effort:** 2–3 dev-days

**Evidence:**
- `BingoEngine.ts:414` `drawLocksByRoom` per-room mutex for draws — correct, but in-process only (CRIT-3 fix needed for multi-instance).
- `BingoEngine.ts:2833` synchronous `bingoWinnerId` set before `await wallet.transfer` — used as race-mutex against duplicate BINGO claims. Correct, but if `wallet.transfer` throws, must rollback (`BingoEngine.ts:2926` does this — verified).
- `Game1DrawEngineService.ts:1094-1102` — `loadScheduledGameForUpdate` uses `FOR UPDATE OF sg` to lock scheduled_games row during `drawNext`. Good.
- `Game1TicketPurchaseService.ts:386` — `INSERT (UNIQUE idempotency_key)` race handling at `:416-431` is correct: 23505 unique-violation is treated as "another request won", not as failure.
- `Game1PayoutService.payoutPhase` runs entirely in caller-supplied `PoolClient` — wallet-credit failure rolls back the entire draw transaction (per Game1DrawEngineService). Good.
- `AgentTransactionService.cashIn/cashOut` PR #522 atomic — verified.

**Issues:**
- BingoEngine's `submitClaim` BINGO branch at `:2818-2919` has the bingoWinnerId-as-mutex pattern. If `wallet.transfer` succeeds but `compliance.recordLossEntry` throws (audit-trail error), the bingoWinnerId stays set, payment stays committed — no rollback. This is the documented "post-transfer audit-trail can be degraded" approach (`runPostTransferClaimAuditTrail`). Correct in principle, but means audit-trail gaps exist.

**Fix-strategy:** the existing recovery-port (`claimAuditTrailRecovery.onAuditTrailStepFailed`) already addresses this. But the recovery port has a default no-op implementation. Wire a real DB-backed implementation in production so failed audit-trail-steps can be replayed by a background job.

### 3.11 [HV-11] Auth/session

**Severity:** LOW (recently fixed)
**Type:** SECURITY
**Effort:** 0 (already done)

**Evidence:**
- `apps/backend/src/auth/SessionService.ts`, `AuthTokenService.ts`, `TwoFactorService.ts`, `Totp.ts`, `UserPinService.ts` all exist.
- Yesterday's schema-archaeology fixed missing columns `device_user_agent`, `ip_address`, `last_activity_at`.
- The 2FA tables `app_user_2fa` and `app_user_2fa_challenges` exist but FK constraints + indexes + trigger are still missing per `SCHEMA_DIVERGENCE_AUDIT_2026-04-29.md` §3.3 — apply the §6.3 repair script.

### 3.12 [HV-12] Game-state checkpoint/replay accuracy

**Severity:** MEDIUM
**Type:** COMPLIANCE
**Effort:** 1 day to verify, more if gaps found

**Evidence:**
- `apps/backend/src/game/BingoEngineRecoveryIntegrityCheck.ts` exists.
- `Game1RecoveryService.ts` exists.
- `Game1ReplayService.ts` exists.
- I have not read the full content. Plausibly correct but should be verified by reading + testing.

**Fix-strategy:** extend `BingoEngineRecoveryIntegrityCheck.test.ts` with at least these scenarios:
- Replay a completed game from BUY_IN checkpoint → verify final ledger entries match live entries.
- Replay a completed game from PAYOUT checkpoint → verify final ledger entries match.

### 3.13 [HV-13] Real-time push reliability

**Severity:** MEDIUM
**Type:** RELIABILITY
**Effort:** 1–2 dev-days

**Evidence:**
- `apps/backend/src/sockets/walletStatePusher.ts` exists.
- Game1DrawEngineService notifies via `playerBroadcaster` AFTER commit (`Game1DrawEngineService.ts:1296+`) — correct rollback safety.
- BingoEngine emits during play (less rigorous about pre-commit ordering).
- `BingoEngine.ts:1532` `onGameStarted` adapter callback — correct post-commit.
- Idempotency of socket events: roomEvents has `roomEvents.idempotency.test.ts` and `roomEvents.armCycleIdempotency.test.ts`. Good. But `claim:submit` retry → would it dedup? `BingoEngine.submitClaim` at `:2454-2464` checks "existingClaim" and returns it — yes, idempotent.

**Issues:**
- Reconnect mid-claim: `reconnectMidPhase.test.ts` exists. Coverage is reasonable.
- `socket.id` is process-local; if a player reconnects from a different worker (post-CRIT-3), Socket.IO Redis adapter handles the routing. Confirmed `redisAdapter.test.ts` exists.

**Fix-strategy:** verify in staging — once CRIT-3 lands, run a multi-instance test deploying behind Render's load-balancer.

---

## 4. Nice-to-haves (post-pilot OK)

### 4.1 [NTH-1] Spill 1 visual end-of-round UX

**Severity:** LOW (visual, not regulatory)
**Type:** UX
**Effort:** 2 dev-days (frontend)
**Scope:** outside backend audit. Tobias mentioned this 14:45.

### 4.2 [NTH-2] Frontend state-derivation audit

**Severity:** LOW
**Type:** UX / RELIABILITY
**Effort:** 3 dev-days
**Scope:** frontend. Out of audit scope but PR #725 was an example — there may be more.

### 4.3 [NTH-3] Documentation drift

**Severity:** LOW
**Type:** OBSERVABILITY
**Effort:** 1–2 dev-days
**Notes:** `docs/architecture/`, `docs/compliance/`, `docs/operations/` are extensive. Need to verify they describe current state, not 2026-04 master-plan state.

### 4.4 [NTH-4] BingoEngine method extraction

See §3.3. Medium priority, skip pre-pilot.

### 4.5 [NTH-5] Pengespillforskriften compliance verification matrix

**Severity:** MEDIUM (long-term)
**Type:** COMPLIANCE
**Effort:** 3–5 dev-days
**Notes:** create a checklist mapping each §-requirement to a code-location + test. The team has individual tests but no unified checklist. Auditor-asks-for-it-eventually category.

---

## 5. Already-patched / can stay (recently fixed)

| Item | What fixed it | Why patch is sufficient |
|------|---------------|-------------------------|
| FORHANDSKJOP orphan reservation | PR #722–724 + `BingoEngine.ts:1235-1276` (releases orphan reservation on startGame) + `BingoEngine.ts:4375-4465` (preserve callback in cleanupStaleWalletInIdleRooms) | The defensive release in `startGame` runs unconditionally now — orphan TTL reduced from 30 min to fail-closed-immediately. Underlying ownership leak is documented in CRIT-2; CRIT-2 fixes it structurally. The patch holds for pilot. |
| RTP-cap fixed-prize bug (game `057c0502`) | PR #726 + `BingoEngine.ts:1722-1771` and `:2592-2628` and `:2858-2885` | Engine now caps `payout = min(face, RTP-budget, house-balance)` for ALL pattern types. Fix is correct; the underlying problem is HV-2 (prize-pool funding), which is a product decision. |
| Schema ghosts (§3.1, §3.2, §3.3 of yesterday's audit) | Manual repair script + Render deploy | The §6 repair script in `SCHEMA_DIVERGENCE_AUDIT` is idempotent and ready. Once applied + CI gate added (CRIT-5), prevents recurrence. |
| Live-room observability gap | PR #726 + `apps/backend/src/util/roomLogVerbose.ts` + structured INFO events | Now ~25 events for grep-able post-mortem. Default ON via `BINGO_VERBOSE_ROOM_LOGS=true`. Sufficient for pilot. |
| Backend wallet split (deposit vs winnings) | PR-W1 through PR-W5 (covered in code) — `BingoEngine.ts:67-83` `lossLimitAmountFromTransfer`, `Game1TicketPurchaseService.ts:1283-1300` `lossLimitAmountFromDebit` | §11-correct: only deposit-side counts as loss. Falls back to full amount if split is missing — back-compat OK. |
| Auth session schema patches | Manual application by Tobias today | 2FA FK + indexes + trigger still missing (per yesterday's audit §3.3) — apply repair script before pilot. |
| Per-room draw mutex | `BingoEngine.ts:2017-2042` + `BingoEngine.ts:414` | Prevents two simultaneous draws in same room. In-process only — CRIT-3 (Redis) fixes for multi-instance. Single instance is fine for now. |
| Compensation for purchase-INSERT-after-debit failure | `Game1TicketPurchaseService.ts:402-528` | Wallet.credit + audit on INSERT error; CRITICAL log if both fail. Correct. |
| Refund-purchase / Refund-all-for-game | `Game1TicketPurchaseService.ts:682-781` and `:799-860` | Idempotent + per-row isolation in mass refund. Correct. |
| 2FA + active sessions + TOTP | All implemented per `index.ts` wiring + service files | Recently shipped (REQ-129, REQ-132). Schema patches needed (CRIT-5 covers). |

---

## 6. Recommended work-stream (sequence + dependencies)

### Bølge K1 — Schema-CI gate + auth schema repairs (1 dev-week, ~5 days)

**Independent, can run first.** No dependencies on other work.

- Apply `SCHEMA_DIVERGENCE_AUDIT_2026-04-29.md` §6.1 + §6.2 + §6.3 repair scripts (idempotent SQL).
- Add the schema-CI gate (CRIT-5).
- Add ghost-detection to nightly staging job.

**Output:** any new schema drift breaks the build. Prod-vs-files-check is automated.

### Bølge K2 — Atomic state owner (CRIT-2) (1 dev-week, ~5–7 days)

**Depends on:** nothing (orthogonal to CRIT-1).

- Build `RoomLifecycleStore` interface wrapping the three Maps.
- Migrate `cleanupStaleWalletInIdleRooms`, `cleanupStaleWalletInNonCanonicalRooms`, `destroyRoom`, `refundDebitedPlayers` to use `evictPlayer({ releaseReservation: true })`.
- Migrate `bet:arm`/`ticket:cancel`/`onAutoStart` to atomic mutator API.

**Output:** orphan reservations cannot occur — eviction always releases. Patch in PR #724 can be retired.

### Bølge K3 — Dual-engine quarantine (CRIT-1) (2 dev-weeks, ~8–12 days)

**Depends on:** K2 (atomic state owner — easier to migrate the scheduled path with K2 in place).

- Decide canonical: scheduled is Spill 1; BingoEngine is Spill 2/3 + dev/test only.
- Add `assertSpill1NotAdHoc` guard.
- Quarantine BingoEngine paths that only run for Spill 1 ad-hoc.
- Verify tests + add `BingoEngine.assertNotScheduled.test.ts` cases.

**Output:** Spill 1 has ONE engine path. Auditor reads `app_rg_compliance_ledger` and sees one ledger-write origin per type.

### Bølge K4 — Redis-backed shared state (CRIT-3) (1 dev-week, ~5 days)

**Depends on:** K2 (atomic state owner gives a clean migration target).

- Move `armedPlayerIdsByRoom`, `reservationIdByPlayerByRoom`, `armedPlayerSelectionsByRoom`, `armCycleByRoom`, `displayTicketCache`, `variantConfigByRoom`, `drawLocksByRoom`, `lastDrawAtByRoom`, `roomLastRoundStartMs`, `luckyNumbersByPlayer` to Redis.
- Update `staleRoomBootSweep` and add Redis-backed boot sweep.

**Output:** restart no longer loses pre-round state. Multi-instance scale-out becomes possible (post-pilot).

### Bølge K5 — Engine error-handling circuit breaker (CRIT-4) (1–2 dev-days)

**Depends on:** K2/K3 (engine code is settled).

- Per-room error counter + auto-pause after 3 consecutive same-cause errors.
- Sentry alert at 5+ events/minute.
- Categorize wallet-shortage errors as halt-the-room.

**Output:** 14:18-style incidents auto-pause within seconds.

### Bølge HV — High-value cleanups (parallel with K3/K4, ~5–10 days)

- HV-1 (mini-game protocol collapse) — falls out of K3.
- HV-2 (prize-pool funding model) — product decision; if "Option A" chosen, ~4 days backend.
- HV-9 (`closeDay` atomicity) — 1 day.
- HV-12 (replay integrity tests) — 1 day.

### Bølge POST — Post-pilot

- HV-3 (BingoEngine extraction) — 3–4 days.
- HV-4 (BingoEngine ledger port migration) — 1–2 days, depends on K3.
- HV-5 (event protocol document) — 1 day.
- HV-7 (advanced boot recovery) — 1–2 days.

---

## 7. Effort summary

| Work-stream | Dev-days |
|-------------|---------:|
| K1 — Schema CI gate + auth schema repair | 5 |
| K2 — Atomic state owner | 5–7 |
| K3 — Dual-engine quarantine | 8–12 |
| K4 — Redis-backed shared state | 5 |
| K5 — Engine circuit breaker | 1–2 |
| **Pilot-blockers subtotal** | **24–31** |
| HV-1 mini-game protocol | 2 |
| HV-2 prize-pool funding (Option A backend only) | 4 |
| HV-9 closeDay atomicity | 1 |
| HV-12 replay integrity tests | 1 |
| **High-value subtotal** | **8** |
| **Total to "pilot-quality"** | **32–39 dev-days** |
| Stretch (HV-3, HV-4, HV-5, HV-7, HV-13, NTH) | 10–15 |
| **Total to "ship-quality"** | **42–54 dev-days** |

Calendar projection (1 dev, full-time): **6.5–11 weeks** to "pilot-quality."
With 2 devs in parallel where work allows: **~4–6 weeks**.

---

## 8. Conclusion / recommendation

**Refactor is justified. Patch-and-ship will produce more bugs through pilot.**

The dual-engine + three-way ownership + in-memory-only architecture is the source of the recurring bug pattern. Each PR-722-through-727 patch fixed a downstream symptom but the root design generates new symptoms at the rate of roughly one per pilot-relevant code path. The 4–6 calendar week investment in K1–K5 (with HV-1, HV-9, HV-12 ride-along) reduces the future-bug rate by an order of magnitude and produces an architecture an auditor can read end-to-end.

**Specific recommendation:**

1. Apply yesterday's schema repair script (idempotent SQL) immediately. This unblocks cause-by-cause cleanup.
2. Spawn K1 (schema CI gate + auth schema repair) — 1 week.
3. In parallel, start K2 (atomic state owner). 1 week.
4. Then K3 (dual-engine quarantine). 2 weeks.
5. Then K4 (Redis state) + K5 (circuit breaker) in parallel. 1 week.
6. Then HV-9 + HV-12 + product decision on HV-2 prize-pool funding. 1 week.

**Total: 5–6 calendar weeks** with 1.5 devs FTE. Pilot at the end of week 6 carries far less risk than pilot today.

Where pilot date is non-negotiable: ship K1 + K2 + K5 (≈2 weeks). Defer K3/K4 to post-pilot and accept higher noise/orphan rates during pilot. K1/K2/K5 alone reduce noise meaningfully without architectural overhaul, but you'll continue patching on the dual-engine and in-memory paths through pilot.

---

**End of report.**
