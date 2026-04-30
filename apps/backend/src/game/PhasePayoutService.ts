/**
 * PhasePayoutService — extracted from BingoEngine.ts in F2-A (REFACTOR_AUDIT_PRE_PILOT_2026-04-29 §3.3 / HV-3).
 *
 * Owns the **cap-and-transfer** flow that was previously duplicated in 3 places
 * inside BingoEngine.ts:
 *   1. `payoutPhaseWinner` (auto-claim phase-win path, ad-hoc)
 *   2. `submitClaim` LINE branch
 *   3. `submitClaim` BINGO branch (Fullt Hus)
 *
 * **Responsibilities:**
 *   - Compute capped payout via 3-cap chain:
 *       payout = min(face, single-prize-cap, remainingPrizePool, remainingPayoutBudget, houseAvailableBalance)
 *   - Perform `walletAdapter.transfer` with caller-supplied idempotency-key + winnings target-side.
 *   - Best-effort `getAvailableBalance` lookup (degrades to `getBalance`, then `+Infinity`).
 *   - Compute house-deficit for fixed-prize patterns (caller writes the audit-event).
 *   - Compute `payoutSkipped`/`rtpCapped` flags.
 *
 * **NOT this service's responsibility:**
 *   - State mutations on `room`/`game`/`claim`/`patternResult` (caller decides
 *     ordering — phase-state must mutate even on payout=0 per PILOT-EMERGENCY 2026-04-28).
 *   - Compliance-ledger writes (PRIZE, HOUSE_DEFICIT) — caller chooses inline vs
 *     CRIT-6 audit-trail-recovery path.
 *   - PayoutAuditTrail event emission.
 *   - Wallet-balance refresh after transfer.
 *   - Crash-recovery checkpointing.
 *   - claim-record creation or `lineWinnerId`/`bingoWinnerId` mutex protection.
 *
 * Behavior is fully equivalent to the pre-extraction inline logic. RTP-cap-bug-fix
 * 2026-04-29 (game `057c0502`) and test-hall-bypass (PR #736) gates are preserved.
 *
 * Note: The other Spill 1 engine (`Game1DrawEngineService`) has its own
 * `Game1PayoutService` for scheduled retail games — out of scope for this F2-A.
 * A future bølge will harmonize both engines.
 */

import { logger as rootLogger } from "../util/logger.js";
import { roundCurrency } from "../util/currency.js";
import type {
  WalletAdapter,
  WalletTransferResult,
} from "../adapters/WalletAdapter.js";
import { PrizePolicyManager } from "./PrizePolicyManager.js";
import type { PrizePolicyVersion } from "./PrizePolicyManager.js";

const logger = rootLogger.child({ module: "phase-payout-service" });

/**
 * Subset of `PatternDefinition.winningType` that the service uses to decide
 * whether the pattern bypasses the round-pool cap (fixed-prize patterns
 * are house-guaranteed). The rest of the type is irrelevant here.
 */
type PatternWinningType =
  | "percent"
  | "fixed"
  | "multiplier-chain"
  | "column-specific"
  | "ball-value-multiplier"
  | undefined;

/**
 * Detect fixed-prize patterns. Mirrors `isFixedPrizePattern` from BingoEngine.ts.
 * Kept private to the service so the export surface is minimal.
 */
function isFixedPrizePattern(pattern: { winningType?: PatternWinningType }): boolean {
  return pattern.winningType === "fixed";
}

/**
 * Inputs for {@link PhasePayoutService.computeAndPayPhase}.
 */
export interface PhasePayoutInput {
  /** Hall the round is bound to (used for prize-policy lookup + house-account derivation). */
  hallId: string;
  /** Stable room identifier (logging only). */
  roomCode: string;
  /** Stable game identifier (logging only). */
  gameId: string;
  /** Whether the room is a test hall (gates RTP-bypass — see comment below). */
  isTestHall: boolean;
  /** Pattern config; only `winningType` is consulted (for fixed-prize detection). */
  pattern: { winningType?: PatternWinningType; name?: string };
  /** Pre-computed face value (already split for multi-winner). */
  prizePerWinner: number;
  /** Engine-tracked round pool. Service does NOT mutate — caller is responsible. */
  remainingPrizePool: number;
  /** Engine-tracked RTP budget. Service does NOT mutate — caller is responsible. */
  remainingPayoutBudget: number;
  /** Resolved house account (computed by caller via `ComplianceLedger.makeHouseAccountId`). */
  houseAccountId: string;
  /** Player wallet to credit on transfer. */
  walletId: string;
  /** Memo line for the wallet transaction (`"1 Rad prize ROOM"` etc). */
  transferMemo: string;
  /** Stable idempotency key. Caller chooses prefix (adhocPhase, adhocLinePrize, adhocBingoPrize). */
  idempotencyKey: string;
  /** Phase identifier (logging + result wiring). */
  phase: "LINE" | "BINGO" | "PHASE";
}

/**
 * Reason a payout was capped to 0 even though the requested amount was > 0.
 * Mirrors the `payoutSkippedReason` enum used by BingoEngine claim/patternResult.
 */
export type PhasePayoutSkippedReason = "budget-exhausted" | "house-balance-low";

/**
 * Result of {@link PhasePayoutService.computeAndPayPhase}. The caller uses
 * this to drive state mutations + ledger/audit writes; the service does
 * none of that itself.
 */
export interface PhasePayoutResult {
  /** Final amount paid (rounded to currency precision). 0 if `payoutSkipped`. */
  payout: number;
  /** True when `requestedAfterPolicyAndPool > 0` but the caps clamped to 0. */
  payoutSkipped: boolean;
  /** Set when `payoutSkipped` is true. */
  payoutSkippedReason: PhasePayoutSkippedReason | undefined;
  /** True iff `payout < requestedAfterPolicyAndPool` (for `claim.rtpCapped`). */
  rtpCapped: boolean;
  /**
   * RTP budget snapshot before any pool/budget mutation. Caller mutates
   * `game.remainingPayoutBudget` and computes `rtpBudgetAfter` from the
   * post-mutation value.
   */
  rtpBudgetBefore: number;
  /**
   * Amount after policy-cap + pool-cap, before RTP-budget + house-balance caps.
   * Used for `payoutSkipped` evaluation and detailed log fields.
   */
  requestedAfterPolicyAndPool: number;
  /** House available balance after best-effort lookup. `+Infinity` on lookup failure. */
  houseAvailableBalance: number;
  /** Wallet transfer result. `null` when `payout === 0`. */
  walletTransfer: WalletTransferResult | null;
  /** Single-prize policy used for the cap (caller stores `policyVersion = policy.id` on claim). */
  policy: PrizePolicyVersion;
  /**
   * House-deficit for fixed-prize patterns when `payout > poolBeforePayout`.
   * Caller writes the HOUSE_DEFICIT ledger entry. 0 for non-fixed patterns
   * or when payout fits within pool. Computed against `remainingPrizePool`
   * supplied at input time (callers that mutate pool before reading should
   * pass pre-mutation value).
   */
  houseDeficit: number;
}

/**
 * Stand-alone phase-payout service. Constructed once per BingoEngine instance
 * (or test); thread-safe iff its dependencies are. No internal state.
 *
 * The service does NOT manage state — every input/output is explicit.
 */
export class PhasePayoutService {
  constructor(
    private readonly walletAdapter: WalletAdapter,
    private readonly prizePolicy: PrizePolicyManager,
  ) {}

  /**
   * Compute and pay a single phase-winner.
   *
   * Caller responsibilities (out of scope here):
   *   - Mark phase-state regardless of payout (PILOT-EMERGENCY 2026-04-28).
   *   - Mutate `game.remainingPrizePool` and `game.remainingPayoutBudget`
   *     (subtract `result.payout`, clamp at 0).
   *   - Write PRIZE + HOUSE_DEFICIT ledger entries.
   *   - Append PayoutAuditTrail event.
   *   - Refresh player balances.
   *   - Update claim/patternResult fields (`payoutAmount`, `rtpCapped`,
   *     `payoutSkipped`, `payoutSkippedReason`, `rtpBudgetBefore`/`rtpBudgetAfter`,
   *     `payoutTransactionIds`).
   *   - Crash-recovery checkpointing.
   */
  async computeAndPayPhase(input: PhasePayoutInput): Promise<PhasePayoutResult> {
    const rtpBudgetBefore = roundCurrency(Math.max(0, input.remainingPayoutBudget));

    // ── 1) Single-prize-cap (§11 regulatorisk 2500 kr) ─────────────────
    //
    // K2-A CRIT-1 note: PrizePolicyManager.PrizeGameType is currently
    // `DATABINGO`-only. Same 2500-cap applies to MAIN_GAME until policy-
    // service is updated. Callers pass game-type for ledger writes
    // separately (out of scope here).
    const capped = this.prizePolicy.applySinglePrizeCap({
      hallId: input.hallId,
      gameType: "DATABINGO",
      amount: input.prizePerWinner,
    });

    const fixedPrize = isFixedPrizePattern(input.pattern);

    // ── 2) Round-pool cap (variable patterns only) ─────────────────────
    //
    // Fixed-prize patterns bypass the pool cap — the house guarantees the
    // announced face value (legacy spillorama-paritet). The RTP-budget cap
    // below still applies regardless.
    const requestedAfterPolicyAndPool = fixedPrize
      ? capped.cappedAmount
      : Math.min(capped.cappedAmount, input.remainingPrizePool);

    // ── 3) RTP-budget cap (§11 80% retail RTP cap) ─────────────────────
    //
    // RTP-cap-bug-fix 2026-04-29 (Tobias-incident game `057c0502`):
    // fixed-prize-bypass REMOVED. RTP cap is regulatorisk absolute and
    // applies even to fixed-prize face values. If payout=0, caller marks
    // phase as won + `payoutSkipped: true`. Subsequent phases keep
    // evaluating — engine does NOT stop just because budget is empty.
    //
    // TEST-HALL-BYPASS 2026-04-29 (Tobias-mandate, PR #736): test halls
    // skip the RTP cap so default-gevinster always pay regardless of
    // buy-in pool. Gated on BOTH `room.isTestHall=true` AND env-flagget
    // `BINGO_TEST_HALL_BYPASS_RTP_CAP=true` (default true in prod).
    // Tests that specifically want to verify RTP-cap behaviour set the
    // env-flag to "false" via process.env-mock; isTestHall stays true so
    // multi-phase progression bypass still works. Single-prize-cap (2500)
    // and house-balance-cap remain enforced as defence-in-depth.
    const isTestHallRtpBypass =
      input.isTestHall === true
      && process.env.BINGO_TEST_HALL_BYPASS_RTP_CAP !== "false";

    const budgetCappedPayout = isTestHallRtpBypass
      ? requestedAfterPolicyAndPool
      : Math.min(
          requestedAfterPolicyAndPool,
          Math.max(0, input.remainingPayoutBudget),
        );

    // ── 4) House-balance cap (defensive — wallet underfunded) ──────────
    //
    // Best-effort: prefer `getAvailableBalance` (PR-W3+) over `getBalance`,
    // fall back to `+Infinity` on lookup error so transient wallet-tjeneste-
    // feil does not hang the round. Defensive — heller betal litt for mye
    // enn å henge runden.
    let houseAvailableBalance = Number.POSITIVE_INFINITY;
    try {
      houseAvailableBalance = this.walletAdapter.getAvailableBalance
        ? await this.walletAdapter.getAvailableBalance(input.houseAccountId)
        : await this.walletAdapter.getBalance(input.houseAccountId);
    } catch (err) {
      logger.warn(
        {
          err,
          houseAccountId: input.houseAccountId,
          gameId: input.gameId,
          roomCode: input.roomCode,
          phase: input.phase,
        },
        "house-balance-lookup feilet under payout-cap-evaluering — fortsetter med budget-cap",
      );
    }

    const payout = roundCurrency(
      Math.max(
        0,
        Math.min(budgetCappedPayout, houseAvailableBalance),
      ),
    );

    // ── 5) Skipped-payout classification ───────────────────────────────
    //
    // `payoutSkipped` only fires when caps clamped a non-trivial requested
    // amount to 0. A pattern with `prizePerWinner=0` (mode:percent + tom
    // pool) is a legitimate zero-prize phase — NOT a skip.
    const payoutWasSkipped = payout === 0 && requestedAfterPolicyAndPool > 0;
    const payoutSkippedReason: PhasePayoutSkippedReason | undefined = payoutWasSkipped
      ? (budgetCappedPayout === 0 ? "budget-exhausted" : "house-balance-low")
      : undefined;

    // ── 6) Wallet transfer (only when payout > 0) ──────────────────────
    //
    // CRIT-6 (SPILL1_CASINO_GRADE_REVIEW_2026-04-26): wallet.transfer is
    // the only reversible operation. Caller mutates state ONLY after this
    // succeeds. BIN-239 idempotency-key prevents double payout on retry.
    // PR-W3 wallet-split: payout is a winning → credit winnings-side.
    //
    // The service does NOT catch transfer errors — they propagate to the
    // caller, which can decide whether to roll back race-mutex state
    // (e.g. `game.bingoWinnerId = undefined` in submitClaim BINGO branch).
    let walletTransfer: WalletTransferResult | null = null;
    if (payout > 0) {
      walletTransfer = await this.walletAdapter.transfer(
        input.houseAccountId,
        input.walletId,
        payout,
        input.transferMemo,
        {
          idempotencyKey: input.idempotencyKey,
          targetSide: "winnings",
        },
      );
    }

    // ── 7) House-deficit (fixed-prize hus-garanti) ─────────────────────
    //
    // For fixed-prize patterns where `payout > poolBeforePayout`, the
    // house finansierte differansen. Caller writes a HOUSE_DEFICIT
    // audit event (REN AUDIT — does NOT count toward §11 aggregates).
    // Returns 0 for non-fixed patterns or when payout fits within pool.
    const houseDeficit = fixedPrize
      ? Math.max(0, roundCurrency(payout - input.remainingPrizePool))
      : 0;

    return {
      payout,
      payoutSkipped: payoutWasSkipped,
      payoutSkippedReason,
      // RTP-cap-bug-fix 2026-04-29: rtpCapped is set whenever payout is
      // actually capped under requestedAfterPolicyAndPool — fixed-prize-
      // bypass removed (game `057c0502`-incident).
      rtpCapped: payout < requestedAfterPolicyAndPool,
      rtpBudgetBefore,
      requestedAfterPolicyAndPool,
      houseAvailableBalance,
      walletTransfer,
      policy: capped.policy,
      houseDeficit,
    };
  }
}
