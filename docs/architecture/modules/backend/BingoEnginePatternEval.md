# BingoEnginePatternEval

**File:** `apps/backend/src/game/BingoEnginePatternEval.ts` (958 LOC)
**Owner-area:** game-runtime
**Last reviewed:** 2026-04-30

## Purpose

Pure-function pattern + phase evaluator extracted from `BingoEngine` — owns BIN-694 phase-progression logic ("1 Rad" → "2 Rader" → "Fullt Hus"), per-color matrix grouping, multi-winner detection + deterministic tie-breaking, and concurrent custom-pattern evaluation (Spill 1 ad-hoc Extra-variant).

It exists because the pattern-matching code (originally inline in `BingoEngine`) has become large enough to merit its own module, and because it can be expressed as pure functions taking a narrow `EvaluatePhaseCallbacks` port — the engine remains responsible for actual payout (since payout is tightly coupled to compliance/ledger/audit).

## Public API

```typescript
// Spill 1 detection — true if gameSlug ∈ {"bingo","game_1","norsk-bingo"}
export function isSpill1Slug(gameSlug: string | undefined | null): boolean

// Multi-winner deterministic tie-breaker (PR-T1 KRITISK 4)
export function sortWinnerIdsDeterministic(playerIds: Iterable<string>): string[]

// Sentinel keys
export const FLAT_GROUP_KEY = "__flat__"
export const UNCOLORED_KEY = "__uncolored__"

// Callback port — engine provides side-effect functions
export interface EvaluatePhaseCallbacks {
  splitRoundingAudit: SplitRoundingAuditPort
  loyaltyHook: LoyaltyPointsHookPort
  getVariantConfig(roomCode): GameVariantConfig | undefined
  payoutPhaseWinner(room, game, playerId, pattern, patternResult, prizePerWinner): Promise<void>
  finishPlaySessionsForGame(room, game, endedAtMs): Promise<void>
  writeGameEndCheckpoint(room, game): Promise<void>
  onAutoClaimedFullHouse?(room, game, winnerIds): Promise<void> | void
}

// BIN-694 sequential phase evaluation: "1 Rad" → "2 Rader" → "Fullt Hus"
export async function evaluateActivePhase(
  callbacks, room, game,
): Promise<void>

// PR-P5 concurrent custom-pattern evaluation (all unwon patterns parallel)
export async function evaluateConcurrentPatterns(
  callbacks, room, game,
): Promise<void>

// Pure helpers
export function computeCustomPatternPrize(pattern, prizePool, lastBall): number
export function detectPhaseWinners(
  game, drawnSet, activePattern, variantConfig, hasPerColorMatrix, phaseIndex, roomCode,
): { totalUniqueWinners, byColor }
export function meetsPhaseRequirement(
  pattern, ticket, drawnSet,
): boolean
```

## Dependencies

**Calls (downstream):**
- `EvaluatePhaseCallbacks.payoutPhaseWinner` — engine-private, performs wallet transfer + ledger entry per winner.
- `EvaluatePhaseCallbacks.splitRoundingAudit` — `onSplitRoundingHouseRetained` for floor-rounded rest.
- `EvaluatePhaseCallbacks.loyaltyHook` — `game.win` per winner (fire-and-forget).
- `EvaluatePhaseCallbacks.finishPlaySessionsForGame` + `writeGameEndCheckpoint` — end-of-round cleanup when Fullt Hus is won.
- `EvaluatePhaseCallbacks.onAutoClaimedFullHouse` (optional, PR #727) — mini-game trigger for auto-claim path.
- `BingoEngine.ballToColumn` — ball→{B,I,N,G,O} mapping for column-specific patterns.
- `PatternMatcher.buildTicketMask` + `matchesPattern` — bitmask-based custom-pattern matching.
- `ticket.buildTicketMask5x5` + `countCompleteRows` + `countCompleteColumns` + `hasFullBingo`.
- `spill1VariantMapper.resolvePatternsForColor` — per-color matrix lookup with `__default__` fallback warning.
- `@spillorama/shared-types/spill1-patterns.classifyPhaseFromPatternName` + `ticketMaskMeetsPhase`.
- `DomainError` from `errors/DomainError.ts`.

**Called by (upstream):**
- `apps/backend/src/game/BingoEngine.ts` — `private evaluateActivePhase(room, game)` delegates here via `buildEvaluatePhaseCallbacks()` + spread.
- Used indirectly by all callers of `BingoEngine.drawNextNumber` (auto-claim-on-draw mode) and `BingoEngine.submitClaim` (manual claims pre-evaluation).

## Invariants

- Pure module — no global state. All side-effects flow through `EvaluatePhaseCallbacks`.
- Deterministic winner ordering: `sortWinnerIdsDeterministic` lex-sorts `playerId` so `firstWinnerId` and per-winner ledger/audit/loyalty event order is stable across Map insertion-order and crash-recovery rebuild (PR #695 KRITISK 4).
- Floor-rounding for splits: `prizePerWinner = Math.floor(totalPhasePrize / winnerIds.length)`; rest stays with house and is audited via `splitRoundingAudit.onSplitRoundingHouseRetained`.
- Per-color matrix and `customPatterns` are mutually exclusive (validator in `BingoEngine.startGame` enforces `CUSTOM_AND_STANDARD_EXCLUSIVE`); evaluator can rely on one mode per call.
- Spill 1 phase-pause is mandatory: when a non-Fullt-Hus phase is won and `isSpill1Slug(room.gameSlug)`, sets `game.isPaused = true` + `pauseMessage` and returns — does NOT recurse into next phase. Other slugs recurse on same draw if pattern allows.
- Demo Hall bypass: when `room.isTestHall === true`, payout still runs but end-of-round is skipped — round continues until `MAX_DRAWS_REACHED` / `DRAW_BAG_EMPTY` (PR #660).
- Fullt Hus auto-claim triggers `onAutoClaimedFullHouse` hook fire-soft (logs warn on failure; payout already booked).
- `column-specific` and `ball-value-multiplier` winning-types only valid on Fullt Hus patterns — engine throws `COLUMN_PRIZE_INVALID_PATTERN` / `BALL_VALUE_INVALID_PATTERN` defense-in-depth.
- `multiplier-chain` phase 1 has `phase1Multiplier === undefined` (sentinel); admin validator rejects `phase1Multiplier === 0` so engine doesn't handle that edge.

## Test coverage

- `apps/backend/src/game/BingoEnginePatternEval.tieBreaker.test.ts` — PR-T1 deterministic winner ordering.
- `apps/backend/src/game/BingoEnginePatternEval.demoHallPhaseProgression.test.ts` — Demo Hall bypass through all phases.
- Plus indirect coverage from every `BingoEngine.*.test.ts` test that runs a full round (multi-winner, per-color, multiplier-chain, column-specific, concurrent custom-patterns).
- `apps/backend/src/game/BingoEngine.fivePhase.test.ts` — sequential 5-phase BIN-694.
- `apps/backend/src/game/BingoEngine.concurrentPatterns.test.ts` — PR-P5 concurrent custom patterns.
- `apps/backend/src/game/BingoEngine.multiplierChain.test.ts` + `columnSpecific.test.ts` + `perColorPatterns.test.ts` + `splitRoundingLoyalty.test.ts` — winning-type matrix + audit hook.

## Operational notes

Common failures + how to diagnose:
- `COLUMN_PRIZE_INVALID_PATTERN` / `COLUMN_PRIZE_MISSING` — `column-specific` configured on non-Fullt-Hus pattern OR `columnPrizesNok` field missing for column letter. Fix admin variant-config.
- `BALL_VALUE_FIELDS_MISSING` — `ball-value-multiplier` lacks `baseFullHousePrizeNok ≥ 0` or `ballValueMultiplier > 0`. Fix admin variant-config.
- "split-rounding audit hook failed" warn — `SplitRoundingAuditPort` threw; engine continues. Check audit table accessibility.
- "loyalty game.win hook failed" warn — `LoyaltyPointsHookPort` threw; engine continues. Check loyalty service.
- "patternsByColor missing entry for ticket color — using __default__ matrix" warn — admin config has `patternsByColor` but missing entry for a ticket color in use; falls back to `__default__`. Add explicit entry in variant-config.
- "onAutoClaimedFullHouse hook failed" warn — mini-game trigger threw; payout already committed, only mini-game popup may be stale. Client can poll wallet.

## Recent significant changes

- PR #727 (`b697215e`): added `onAutoClaimedFullHouse` callback to `EvaluatePhaseCallbacks` so auto-claim path triggers mini-game.
- PR #717 (`bea47642`): import `DomainError` from `errors/DomainError.ts` (Stage-1 quick-win).
- PR #695 (`358e8df2`): PR-T1 — `sortWinnerIdsDeterministic` for KRITISK-4 deterministic tie-breaker.
- PR #660 (`05baf614`): Demo Hall bypass — `room.isTestHall === true` skips end-of-round + pause.
- PR #643 (`7b241a22`): KRITISK — `isSpill1Slug` gate on phase-pause; Spill 1 must pause after each phase win.
- PR #389 (`92ca9c78`): extracted from `BingoEngine.ts` (refactor/s1-bingo-engine-split — Forslag A).

## Refactor status (audit-rapport REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md)

- The `EvaluatePhaseCallbacks` port has 6 hooks — close to but not over the "narrow port" threshold. Watch for growth past 8 hooks.
- `evaluateActivePhase` is ~440 LOC for one function — could be split into `resolveActivePattern`, `resolveTotalPrize`, `payoutGroups`, `markPhaseWon`, `endOrPause` for clarity.
- `computeCustomPatternPrize` and the inline prize-resolution block in `evaluateActivePhase` duplicate winning-type handling — candidate for shared helper.

