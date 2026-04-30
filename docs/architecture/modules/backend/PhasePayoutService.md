# PhasePayoutService

**File:** `apps/backend/src/game/PhasePayoutService.ts` (318 LOC)
**Owner-area:** game-runtime
**Last reviewed:** 2026-04-30

## Purpose

Stand-alone service owning the **cap-and-transfer** flow for phase-winner payouts in `BingoEngine` — extracted in F2-A (REFACTOR_AUDIT_PRE_PILOT_2026-04-29 §3.3 / HV-3) so the same chain isn't duplicated across `payoutPhaseWinner`, `submitClaim` LINE branch, and `submitClaim` BINGO branch.

The service computes a 4-cap chain:

```
payout = roundCurrency(min(
  face,
  single-prize-cap (2500 §11),
  remainingPrizePool   (variable patterns only),
  remainingPayoutBudget (RTP §11 80%, modulo test-hall bypass),
  houseAvailableBalance (defensive)
))
```

…then performs a wallet transfer with the caller's idempotency-key when `payout > 0`. Caller still owns claim-record creation, room/game state mutations, ledger + audit-trail writes, and crash-recovery checkpointing.

## Public API

```typescript
export class PhasePayoutService {
  constructor(
    walletAdapter: WalletAdapter,
    prizePolicy: PrizePolicyManager,
  )

  async computeAndPayPhase(input: PhasePayoutInput): Promise<PhasePayoutResult>
}

export interface PhasePayoutInput {
  hallId: string                                // policy lookup
  roomCode: string                              // logging
  gameId: string                                // logging
  isTestHall: boolean                           // gates RTP-bypass
  pattern: { winningType?: ...; name?: string } // fixed-prize detection
  prizePerWinner: number                        // pre-cap face value
  remainingPrizePool: number                    // round pool (immutable input)
  remainingPayoutBudget: number                 // RTP budget (immutable input)
  houseAccountId: string                        // resolved by caller
  walletId: string                              // player wallet to credit
  transferMemo: string                          // wallet tx memo line
  idempotencyKey: string                        // caller chooses prefix
  phase: "LINE" | "BINGO" | "PHASE"             // logging
}

export interface PhasePayoutResult {
  payout: number                                // final paid amount
  payoutSkipped: boolean                        // requested>0 but capped to 0
  payoutSkippedReason: "budget-exhausted" | "house-balance-low" | undefined
  rtpCapped: boolean                            // payout < requestedAfterPolicyAndPool
  rtpBudgetBefore: number                       // pre-mutation snapshot
  requestedAfterPolicyAndPool: number           // amount after policy+pool caps
  houseAvailableBalance: number                 // best-effort lookup, +Infinity on err
  walletTransfer: WalletTransferResult | null   // null when payout=0
  policy: PrizePolicyVersion                    // for claim.policyVersion
  houseDeficit: number                          // fixed-prize hus-garanti audit
}

export type PhasePayoutSkippedReason = "budget-exhausted" | "house-balance-low"
```

## Dependencies

**Calls (downstream):**
- `WalletAdapter.getAvailableBalance` (preferred) / `getBalance` (fallback) — best-effort house balance lookup; errors are logged-and-swallowed (defensive).
- `WalletAdapter.transfer(houseAccountId, walletId, payout, memo, { idempotencyKey, targetSide: "winnings" })` — only when `payout > 0`. Errors propagate to caller.
- `PrizePolicyManager.applySinglePrizeCap({ hallId, gameType: "DATABINGO", amount })` — §11 single-prize-cap (2500 kr).
- `roundCurrency` from `util/currency.js`.

**Called by (upstream):**
- `BingoEngine.payoutPhaseWinner` (auto-claim phase-win path).
- `ClaimSubmitterService.submitClaim` LINE branch (F2-B — was inline in `BingoEngine.submitClaim`).
- `ClaimSubmitterService.submitClaim` BINGO branch (Fullt Hus). Wrapped in try/catch so race-mutex `game.bingoWinnerId` rolls back on transfer failure (CRIT-6 partial-state-protection).

## Invariants

- **No state mutations.** The service does not touch `room`, `game`, `claim`, or `patternResult` — caller owns all mutations and decides ordering. Service is conceptually pure modulo wallet I/O + house-balance lookup.
- **Idempotency-key never modified.** Service passes the caller-supplied key verbatim to `walletAdapter.transfer`; retry of the same logical operation must produce the same key, otherwise wallet dedup misses and a double-payout occurs.
- **Wallet transfer always credits winnings-side** (`targetSide: "winnings"`) — prize money cannot re-enter the deposit-side and inflate loss-limit headroom (PR-W3 split contract).
- **House-balance lookup is best-effort.** Lookup failure → `houseAvailableBalance = +Infinity`, payout proceeds with the budget-cap as the binding constraint. Defensive: heller betal litt for mye enn å henge runden ved transient wallet-tjeneste-feil.
- **Fixed-prize patterns bypass pool-cap, NOT RTP-cap.** Pengespillforskriften §11 RTP cap is regulatorisk absolute (fixed in PR #726 / RTP-cap-bug-fix 2026-04-29 — game `057c0502`-incident).
- **Test-hall RTP-bypass is double-gated** on `room.isTestHall === true` AND `process.env.BINGO_TEST_HALL_BYPASS_RTP_CAP !== "false"`. Tests that specifically verify RTP-cap behaviour set the env-flag to `"false"`; isTestHall stays true so multi-phase progression bypass still works.
- **`payoutSkipped` only fires when caps clamped a non-trivial amount to 0.** Legitimate zero-prize phases (e.g. mode:percent with zero pool) keep `payoutSkipped: false` so callers don't misclassify them as exhausted.
- **`policy.id` is the version the caller stamps on the claim** — must match the policy used at cap time so audit reconstructs which §11 version applied.

## Test coverage

- `apps/backend/src/game/__tests__/PhasePayoutService.test.ts` — unit tests for the cap chain + wallet-transfer interface (13 cases): full payout, budget exhausted, house-balance-low, variable cap, fixed-prize bypass, test-hall bypass on/off, idempotency-key passthrough, lookup-failure degradation, transfer-error propagation, single-prize-cap (2500), rtpBudgetBefore rounding, prizePerWinner=0 legitimate-zero.
- `apps/backend/src/game/__tests__/BingoEngine.rtpCap.test.ts` — integration regression for cap-bypass-bug (PR #726).
- `apps/backend/src/game/__tests__/BingoEngine.phaseProgressionWithZeroBudget.test.ts` — zero-budget multi-phase progression (PR #729).
- `apps/backend/src/game/BingoEngine.fivePhase.test.ts` — 5-phase round; covers all three call-sites.
- `apps/backend/src/game/BingoEngine.test.ts` — main suite; covers happy-path payout for all 3 sites.

## Operational notes

The service has no internal state, so operational issues come from the wired dependencies:

- `Wallet house-... mangler saldo` from caller — house wallet underfunded at transfer time. Pre-flight `houseAvailableBalance` lookup may have returned a stale value if the wallet was concurrently debited; the service does NOT try to compensate. Caller decides recovery.
- `INSUFFICIENT_FUNDS` from `walletAdapter.transfer` — same root cause as above, but propagated. Caller (BINGO branch) catches and rolls back race-mutex; LINE/PHASE branches let it propagate up to `submitClaim`/`evaluateActivePhase`.
- `DomainError("PRIZE_POLICY_MISSING")` — no active prize policy for the hall. Almost always a hydration bug (missing default policy seed in `BingoEngine.hydratePersistentState`). Check `app_prize_policies` table.
- `house-balance-lookup feilet under payout-cap-evaluering` warn — transient `getAvailableBalance` / `getBalance` error; payout proceeds with `+Infinity` as the cap (defensive). If you see this repeatedly, check Postgres connectivity / row-locking.

## Recent significant changes

- PR `refactor/f2a-extract-phase-payout-service` (this PR): extracted from `BingoEngine.ts`. Behavior fully equivalent to the inline implementation (audit confirmed: same idempotency-keys, same cap order, same logging fields).

## Refactor status (audit-rapport REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md)

- F2-A complete. Three call-sites in `BingoEngine.ts` (≈80 LOC each) consolidated; engine line-count went from 5436 → 5330 (-106 LOC) plus 318 LOC for the new service. The cleaner separation-of-concerns (cap math vs. ledger writes vs. state mutations) is the bigger win than raw LOC reduction.
- **Future bølge:** harmonize `Game1DrawEngineService.Game1PayoutService` with this service so scheduled retail games and ad-hoc games share the same cap chain. Scope kept out of F2-A per audit guidance; documented as TODO in `BingoEngine.md` refactor-status.
- **Possible follow-up:** add a streaming/RTP-aware variant for multi-winner phases that splits a single budget across N winners atomically instead of relying on the current "budget mutates between consecutive `computeAndPayPhase` calls" pattern.
