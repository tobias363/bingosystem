# ClaimSubmitterService

**File:** `apps/backend/src/game/ClaimSubmitterService.ts` (1158 LOC)
**Owner-area:** game-runtime
**Last reviewed:** 2026-04-30

## Purpose

Stand-alone service owning the **claim-submission flow** for ad-hoc Spill 1/2/3 rooms — extracted in F2-B (REFACTOR_AUDIT_PRE_PILOT_2026-04-29 §3.3 / HV-3) so the ~640-line `submitClaim` method is no longer hosted inside `BingoEngine.ts`.

The service handles:

1. **Validation** — idempotency-dedupe (BIN-45), participating-player check (KRITISK-8), armed-guard (BIN-238), KYC/play-block (`assertWalletAllowedForGameplay`), scheduled/ad-hoc-quarantine (CRIT-4 + K3).
2. **Pattern validation** — LINE matches active unwon LINE pattern via `meetsPhaseRequirement`; BINGO checks full bingo on any ticket + race-mutex against `game.bingoWinnerId` (RTP-cap-bug-fix race-safe).
3. **Cap-and-transfer** — delegates to {@link PhasePayoutService.computeAndPayPhase}.
4. **State mutations** on `claim`/`game`/`patternResult` — winnerId, payoutAmount, pool/budget decrement, status="ENDED" + endedReason for BINGO. PILOT-EMERGENCY 2026-04-28: phase-state mutates even when payout=0.
5. **Post-transfer audit-trail** — five sequential steps (compliance.recordLossEntry, ledger.recordComplianceLedgerEvent PRIZE, payoutAudit, checkpoint, rooms.persist) in their own try/catch with recovery-port event-emission on each failure (CRIT-6 K3).
6. **HOUSE_DEFICIT** audit-event for fixed-prize patterns where payout exceeds pool — REN AUDIT, does not count toward §11 aggregates.
7. **`bingoAdapter.onClaimLogged`** notification + **HOEY-6 GAME_END checkpoint** for round-ending BINGO claims.

## Public API

```typescript
export class ClaimSubmitterService {
  constructor(
    compliance: ComplianceManager,
    ledger: ComplianceLedger,
    payoutAudit: PayoutAuditTrail,
    phasePayoutService: PhasePayoutService,
    bingoAdapter: BingoSystemAdapter,
    rooms: RoomStateStore,
    claimAuditTrailRecovery: ClaimAuditTrailRecoveryPort,
    callbacks: ClaimSubmitterCallbacks,
  )

  async submitClaim(input: ClaimSubmitInput): Promise<ClaimRecord>
}

export interface ClaimSubmitInput {
  room: RoomState                 // already-validated by caller (BingoEngine.requireRoom)
  game: GameState                 // already-validated by caller (BingoEngine.requireRunningGame)
  playerId: string                // service does its own lookup via callbacks.requirePlayer
  type: ClaimType                 // "LINE" | "BINGO"
}

export interface ClaimSubmitterCallbacks {
  requirePlayer(room, playerId): Player
  assertWalletAllowedForGameplay(walletId, nowMs): void
  assertNotScheduled(room): void
  assertSpill1NotAdHoc(room): void
  meetsPhaseRequirement(pattern, ticket, drawnSet): boolean
  refreshPlayerBalancesForWallet(walletId): Promise<string[]>
  finishPlaySessionsForGame(room, game, endedAtMs): Promise<void>
  writeGameEndCheckpoint(room, game): Promise<void>
  writePayoutCheckpointWithRetry(room, game, claimId, payoutAmount, transactionIds, prizeType): Promise<void>
}
```

## Dependencies

**Calls (downstream):**
- `PhasePayoutService.computeAndPayPhase` — cap-and-transfer chain (single-prize-cap, pool, RTP-budget, house-balance).
- `ComplianceManager.recordLossEntry({type:"PAYOUT", ...})` — net-loss tracking for §11 reports.
- `ComplianceLedger.recordComplianceLedgerEvent({eventType:"PRIZE"|"HOUSE_DEFICIT"})` — §11 regulatorisk + REN AUDIT.
- `ComplianceLedger.makeHouseAccountId(hallId, gameType, channel)` — derive house-account for transfer source.
- `PayoutAuditTrail.appendPayoutAuditEvent({kind:"CLAIM_PRIZE"})` — internal hash-chain audit.
- `BingoSystemAdapter.onClaimLogged` — admin/Postgres claim-log sink.
- `BingoSystemAdapter.onCheckpoint` (gated by `writePayoutCheckpointWithRetry` callback).
- `RoomStateStore.persist(roomCode)` — HOEY-7 in-memory ↔ store sync.
- `ClaimAuditTrailRecoveryPort.onAuditTrailStepFailed` — CRIT-6 recovery-event emission for failed audit-trail steps.
- Callbacks (engine-internal helpers): `requirePlayer`, `assertWalletAllowedForGameplay`, `assertNotScheduled`, `assertSpill1NotAdHoc`, `meetsPhaseRequirement`, `refreshPlayerBalancesForWallet`, `finishPlaySessionsForGame`, `writeGameEndCheckpoint`, `writePayoutCheckpointWithRetry`.
- `ledgerGameTypeForSlug(gameSlug)` — resolve per-spill `LedgerGameType` (Spill 1 → MAIN_GAME).
- `IdempotencyKeys.adhocLinePrize` / `adhocBingoPrize` — stable keys so retries don't double-pay.
- `roundCurrency` from `util/currency.js` — final amount rounding.
- `findFirstCompleteLinePatternIndex` / `hasFullBingo` from `ticket.js` — pattern-match helpers.

**Called by (upstream):**
- `BingoEngine.submitClaim` — thin delegate (~10 lines) that resolves room+game and forwards.
- Indirectly: every Socket.IO `claim:submit` handler via `claimEvents.ts`.

## Invariants

- **Caller resolves room+game.** Service receives validated `room`/`game` references — never a raw `roomCode`. This keeps the engine's lookup functions (`requireRoom`, `requireRunningGame`) as the single source of truth.
- **Idempotency by claim-record (BIN-45).** If the player already has a paid claim of the same type in this game, the existing claim is returned without side-effects.
- **CRIT-6 wallet-first contract.** State mutations happen ONLY after `walletAdapter.transfer` is committed. The BINGO branch sets `game.bingoWinnerId` synchronously as race-mutex BEFORE awaiting balance lookup, then rolls back the mutex on transfer-failure (try/catch around the service call).
- **PILOT-EMERGENCY 2026-04-28 — state mutates regardless of payout.** A legitimate zero-prize phase (mode:percent + empty pool) still marks `lineWinnerId`/`bingoWinnerId` and `patternResult.isWon=true` so the round advances. Wallet-transfer + ledger writes are gated on `payout > 0`.
- **Test-hall LINE-bypass (PR #741).** When `room.isTestHall === true`, LINE-claims do NOT end the round — patterns continue evaluating so demo runs cycle through all 5 phases. BINGO-claims STILL end the round normally.
- **Audit-trail degraded ≠ failed claim.** Each post-transfer step has its own try/catch — failure logs prominently, fires a recovery-event, and continues. `claim.auditTrailStatus === "degraded"` flags ops-rekonsiliering, but the claim itself remains valid.
- **Idempotency-key prefix per branch.** LINE → `adhocLinePrize({gameId, claimId})`. BINGO → `adhocBingoPrize({gameId, claimId})`. Auto-claim-payout (handled by `BingoEngine.payoutPhaseWinner`, NOT this service) uses `adhocPhase({patternId, gameId, playerId})`.
- **`gameType` derived from `room.gameSlug`.** Spill 1 (`bingo`) → MAIN_GAME, SpinnGo (`spillorama`) → DATABINGO. Channel is always `INTERNET` for this engine.

## Test coverage

- `apps/backend/src/game/__tests__/ClaimSubmitterService.test.ts` — unit tests for the wiring + delegate-pattern + private API surface (5 cases). Pins that the engine method is a thin delegate, the audit-trail helpers are no longer on the engine prototype, and the service is constructed once per engine.
- `apps/backend/src/game/BingoEngine.test.ts` — main suite (1662 tests covering create/join/start/draw/claim happy-path + all edge cases). Exercise the service end-to-end via `engine.submitClaim`.
- `apps/backend/src/game/BingoEngine.crit6Atomicity.test.ts` + `crit6PostTransferRecovery.test.ts` — CRIT-6 atomic claim + post-transfer audit-trail recovery (PR #581). Confirms the recovery-port event-emission still fires correctly through the new service.
- `apps/backend/src/game/__tests__/BingoEngine.testHall.endsRoundOnFullHus.test.ts` — PR #741 test-hall semantics (LINE bypass, BINGO ends round).
- `apps/backend/src/game/BingoEngine.demoHallBypass.test.ts` + `demoHallPayout.test.ts` — Demo Hall bypass (PR #660) including duplicate-claim guard.
- `apps/backend/src/game/BingoEngine.fivePhase.test.ts` — 5-phase round; covers LINE-pattern claim cascade through phases 1-4 + BINGO Fullt Hus.
- `apps/backend/src/game/__tests__/PhasePayoutService.test.ts` — unit tests for the cap chain (used by this service).

## Operational notes

The service has no internal state, so operational issues come from the wired dependencies:

- `NOT_ARMED_FOR_GAME` — player did not pay buy-in this round; check `game.tickets.get(playerId)` is empty.
- `PLAYER_NOT_PARTICIPATING` — KRITISK-8 guard: player has tickets but isn't in `game.participatingPlayerIds`. Indicates the round started without arming this player.
- `LINE_ALREADY_CLAIMED` / `BINGO_ALREADY_CLAIMED` — race against another claim or auto-claim. Service returns the duplicate-claim record (`valid: false, reason: "..."`) without throwing.
- `[CRIT-6] post-transfer compliance.recordLossEntry feilet` — first audit-trail step failed after wallet-transfer succeeded. The claim is still valid (money paid), but `claim.auditTrailStatus="degraded"` and a recovery-event was fired.
- `[CRIT-6] post-transfer ledger.recordComplianceLedgerEvent feilet — REGULATORISK rekonsiliering kreves` — second audit-trail step failed. CRITICAL — §11-rapportering har gap som må fikses manuelt eller via background-replay-job.
- `[CRIT-6] post-transfer rooms.persist feilet` — fifth audit-trail step failed. In-memory state is correct; the persistent store may be stale.
- `Wallet house-... mangler saldo` from PhasePayoutService — house-account underfunded. Top up via admin overskudd-batch reverse or manual ledger correction.
- `INSUFFICIENT_FUNDS` from BINGO branch wallet-transfer — same as above, but triggers `game.bingoWinnerId` rollback before re-throwing. Retry is safe.

## Recent significant changes

- F2-B `refactor/f2b-extract-claim-submitter` (this PR): extracted from `BingoEngine.ts`. Behavior fully equivalent to the inline implementation:
  - Same idempotency-keys (`adhocLinePrize` / `adhocBingoPrize`).
  - Same ledger ordering (compliance.recordLossEntry → ledger.recordComplianceLedgerEvent → payoutAudit.appendPayoutAuditEvent → checkpoint → rooms.persist).
  - Same logging fields (`game.pattern.won`, `game.pattern.payout-skipped`).
  - Same PR #741 test-hall semantics (LINE-bypass, BINGO ends round).
  - Same PILOT-EMERGENCY 2026-04-28 unconditional state-mutation contract.
  - Same CRIT-6 K3 recovery-port event-emission for failed audit-trail steps.

## Refactor status (audit-rapport REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md)

- F2-B complete. The single largest method on `BingoEngine.ts` (`submitClaim` ~640 LOC + helpers ~280 LOC = ~920 LOC) is now isolated in this service. Engine line-count dropped from 5330 → 4434 LOC (-896).
- **Future bølge:** consider unifying the auto-claim path (`BingoEngine.payoutPhaseWinner`) with `ClaimSubmitterService` so both manual and automatic claim flows share the same cap-and-state-mutation machinery. The auto-claim path is currently smaller (~240 LOC) and shares `PhasePayoutService` only — not the post-transfer audit-trail.
- **Possible follow-up:** add direct unit tests for the LINE/BINGO branches that bypass the engine — currently the BingoEngine test-suite covers them end-to-end (1662 tests). A focused branch-test file would let future refactors pin behaviour without spinning up a full engine.
