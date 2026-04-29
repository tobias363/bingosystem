# Game1DrawEngineDailyJackpot

**File:** `apps/backend/src/game/Game1DrawEngineDailyJackpot.ts` (291 LOC)
**Owner-area:** game-runtime
**Last reviewed:** 2026-04-30

## Purpose

Draw-engine hook for the daily-accumulating Jackpott (Master-plan §2.3, Appendix B.9) — single function `runDailyJackpotEvaluation` that runs after Fullt Hus payout in `Game1DrawEngineService.payoutPhase` and atomically debits-and-resets the per-hall-group daily pot if the win came on or before `drawThresholds[0]`, then distributes the awarded amount to Fullt Hus winners.

It exists as a separate module because the daily jackpot is a SEPARATE pot from `Game1JackpotService` (per-color fixed) and `Game1PotService` (Innsatsen accumulating). The daily pot has its own state table (`app_game1_daily_jackpot_state`), audit table (`app_game1_jackpot_awards`), and seed/cap rules (+4000 kr/day to 30 000 cap, reset to 2000 seed on award).

## Public API

```typescript
export interface DailyJackpotWinner {
  assignmentId: string   // app_game1_ticket_assignments.id
  walletId: string
  userId: string
  hallId: string
}

export interface RunDailyJackpotEvaluationInput {
  client: PoolClient                        // outer transaction's client
  schema: string
  jackpotStateService: Game1JackpotStateService
  walletAdapter: WalletAdapter
  audit: AuditLogService
  scheduledGameId: string
  drawSequenceAtWin: number                 // 1-indexed
  winners: DailyJackpotWinner[]             // those who got Fullt Hus paid
}

export interface RunDailyJackpotEvaluationResult {
  awarded: boolean
  awardId: string                           // app_game1_jackpot_awards.id
  totalAwardedCents: number
  hallGroupId: string | null
  skipReason?: "NO_HALL_GROUP" | "ABOVE_THRESHOLD" | "ZERO_BALANCE"
              | "NO_WINNERS" | "STATE_MISSING"
}

export async function runDailyJackpotEvaluation(
  input: RunDailyJackpotEvaluationInput,
): Promise<RunDailyJackpotEvaluationResult>
```

## Dependencies

**Calls (downstream):**
- `client.query` against `app_game1_scheduled_games` — resolve `group_hall_id` for the scheduled game.
- `Game1JackpotStateService.getStateForGroup(hallGroupId)` — read current pot + thresholds.
- `Game1JackpotStateService.awardJackpot({ hallGroupId, idempotencyKey, reason: "FULL_HOUSE_WITHIN_THRESHOLD", ... })` — atomic debit-and-reset (own pool connection, own transaction).
- `WalletAdapter.credit(walletId, perWinnerKr, reason, { idempotencyKey, to: "winnings" })` — per-winner credit.
- `AuditLogService.record({ action: "game1_jackpot.auto_award", ... })` — fire-and-forget audit event.
- Logger — `log.info` on award, `log.warn` on partial-failure / config issues, `log.error` on unrecoverable.

**Called by (upstream):**
- `apps/backend/src/game/Game1DrawEngineService.ts` — invoked from inside `payoutPhase` once `currentPhase === TOTAL_PHASES (5)` (Fullt Hus) and `winners.length > 0`. Wired via late-bound `setJackpotStateService` + `setWalletAdapter` (defaults to no-op if either is null).

## Invariants

- Idempotency key `g1-jackpot-{scheduledGameId}-{drawSequenceAtWin}` ensures `awardJackpot` is idempotent across retries within the same game+draw — re-call returns same `awardedAmountCents` with `idempotent: true`.
- Wallet credit idempotency key per (award, winner): `g1-jackpot-credit-{awardId}-{assignmentId}` — re-credit produces no double-pay.
- Trigger threshold = `drawThresholds[0]` only — multi-threshold progression (50→55→56→57) is P1 / not implemented; pilot uses single threshold per group.
- Skip semantics:
  - `NO_WINNERS` — empty `winners[]` → no-op.
  - `NO_HALL_GROUP` — scheduled-game has no `group_hall_id` → no-op.
  - `ZERO_BALANCE` — current pot ≤ 0 OR `awardedAmountCents <= 0` → no-op.
  - `ABOVE_THRESHOLD` — `drawSequenceAtWin > drawThresholds[0]` → no-op.
  - `STATE_MISSING` — `drawThresholds[0]` invalid → no-op.
- Floor-rounding: `perWinnerCents = floor(awardedAmountCents / winnerCount)`; `houseRetainedCents = awardedAmountCents - perWinnerCents * winnerCount`. Rest stays with house (logged in audit-event details).
- Audit append is fire-and-forget — failure logged but never propagated.
- **Partial failure semantics (DOCUMENTED):** if `awardJackpot` succeeds (state debited and committed in own connection) but a subsequent `walletAdapter.credit` throws, the function propagates the wallet error so the outer `drawNext` transaction rolls back. **However, the state-debit is in its own COMMITTED transaction and CANNOT roll back.** Operator must use admin tooling for rebalancing. Pilot-accepted trade-off pending a distributed-tx solution post-pilot.

## Test coverage

- `apps/backend/src/game/Game1DrawEngineDailyJackpot.test.ts` — covers: `NO_WINNERS` early-return, `NO_HALL_GROUP` early-return, `ZERO_BALANCE` early-return, `ABOVE_THRESHOLD` early-return, full happy-path (single winner + multi-winner split with house-retained rest), idempotent re-call, `awardJackpot` throws → propagation, wallet-credit throws → propagation, `audit.record` rejection swallowed, `perWinnerCents=0` edge case (more winners than awardedAmountCents).
- Indirect coverage from `Game1DrawEngineService.featureCoverage.test.ts` — wired into draw flow.

## Operational notes

Common failures + how to diagnose:
- `awardJackpot` threw — propagated up; outer draw transaction rolls back. Investigate `app_game1_daily_jackpot_state` row consistency.
- `walletAdapter.credit` threw after `awardJackpot` succeeded — partial-failure (documented above). Look for log line `wallet.credit feilet etter award-debit — partial failure` with `awardId`. State is debited (already committed); wallet credit is missing for one or more winners. Reconcile manually via admin tooling using same idempotency key.
- `perWinnerCents=0` warn — more winners than `awardedAmountCents`. Returns `awarded: true, totalAwardedCents: 0` — flag to ops; investigate why pot is so small relative to winner count.
- `STATE_MISSING` skipReason warn — `drawThresholds` is empty or first element invalid. Check admin config for `Game1JackpotStateService.setStateForGroup`.
- `ABOVE_THRESHOLD` skipReason — Fullt Hus came too late in the round (e.g. draw 51 with threshold 50). Expected behavior; pot rolls over to next day's accumulation.
- Skip-no-side-effects principle: `runDailyJackpotEvaluation` does NOT update audit or state on skip paths — silent unless `awarded: true`.

## Recent significant changes

- PR #546 (`f790095a`): jackpot award-pathen — atomic debit-and-reset + auto-trigger ved Fullt Hus. Initial implementation.
- PR #717 (`bea47642`): import `DomainError` from `errors/DomainError.ts` (no usage in this file but module-wide).

## Refactor status (audit-rapport REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md)

- Multi-threshold progression (50→55→56→57) is P1 — currently a `// Pilot-modell` comment + TODO. Needs per-sub-game state to handle progressively higher thresholds.
- The "partial failure between award-debit and wallet-credits" is a known liability — a true distributed transaction (e.g. via `app_game1_jackpot_outbox` table written in same TX as award and processed by a worker) would close the gap. Tracked under casino-grade wallet redesign (BIN-761→764 series).
- Audit-event metadata duplicates fields already in `award` — could pass the whole `AwardJackpotResult` instead of cherry-picking.

