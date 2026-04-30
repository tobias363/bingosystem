# Game3Engine

**File:** `apps/backend/src/game/Game3Engine.ts` (706 LOC)
**Owner-area:** game-runtime
**Last reviewed:** 2026-04-30

## Purpose

Spill 3 (Mønsterbingo) ad-hoc engine — a `BingoEngine` subclass that adds pattern-driven auto-claim-on-draw behaviour for the 5×5 / 1..75 / no-free-centre variant. Cycles through admin-configured patterns (Row 1-4, custom designs, Full House) with ball-thresholds and processes payouts inline as patterns activate.

It exists because Spill 3 has its own legacy semantics (`gamehelper/game3.js`) that differ from Spill 1: patterns auto-cycle on draw count instead of being claimed manually, and the round ends only on Full House (not on every phase). The engine reuses everything in `BingoEngine` (room/wallet/compliance) and overrides only `onDrawCompleted` to add G3 logic.

## Public API

```typescript
export class Game3Engine extends BingoEngine {
  // Per-draw effect read-and-clear — socket layer consumes after drawNextNumber returns
  getG3LastDrawEffects(roomCode: string): G3DrawEffects | undefined

  // Hook override (only one) — base BingoEngine surface is unchanged
  protected async onDrawCompleted(ctx): Promise<void>
}

// Standalone helper
export function buildPatternSpecs(patterns: readonly PatternDefinition[]): PatternSpec[]

// Wire-shape types for socket layer
export interface G3DrawEffects {
  roomCode; gameId; drawIndex; lastBall;
  patternsChanged: boolean;
  patternSnapshot: G3PatternSnapshot[];
  winners: G3WinnerRecord[];
  gameEnded: boolean;
  endedReason?: string;   // "G3_FULL_HOUSE" when ended this draw
}

export interface G3PatternSnapshot {
  id; name; ballThreshold; isFullHouse; isWon; design;
  patternDataList: number[]; amount: number;
}

export interface G3WinnerRecord {
  patternId; patternName; isFullHouse; pricePerWinner;
  ticketWinners: G3TicketWinner[];
}

export interface G3TicketWinner {
  playerId; ticketIndex; ticketId?; claimId; payoutAmount; luckyBonus;
}
```

## Dependencies

**Calls (downstream):**
- `super.onDrawCompleted(ctx)` — base hook for any future default behaviour.
- `super.finishPlaySessionsForGame(...)` + `super.writeGameEndCheckpoint(...)` — round termination at Full House.
- `super.rooms.persist(roomCode)` — RoomStateStore persist after end.
- `super.walletAdapter.transfer(...)` (via `transferPrizeShare`) — payout per (player, ticket) winner.
- `super.compliance.recordLossEntry({type:"PAYOUT", ...})` — per-payout compliance event.
- `super.ledger.recordComplianceLedgerEvent({eventType:"PRIZE", policyVersion:"g3-v1", ...})`.
- `IdempotencyKeys.adhocClaimG3` — deterministic per-(player, ticket, pattern) keys.
- `PatternCycler.step(drawIndex)` — advances active patterns based on ball threshold.
- `PatternMatcher.buildTicketMask` + `matchesAny` + `isFullHouse` + `FULL_HOUSE_MASK` — bitmask matching.
- `ticket.uses5x5NoCenterTicket(gameSlug)` — gateway check (Game 3 only).
- `currency.roundCurrency` — split-rounding.
- `getBuiltInPatternMasks(name)` — Row 1-4 / Coverall / Full House.

**Called by (upstream):**
- `apps/backend/src/sockets/gameEvents.ts` — `getG3LastDrawEffects(roomCode)` consumed after `drawNextNumber` for `g3:pattern:changed` / `g3:pattern:auto-won` socket emission.
- `apps/backend/src/sockets/gameEvents/*` — every standard `BingoEngine` route (createRoom/joinRoom/etc.) flows through this subclass via base inheritance.
- `apps/backend/src/index.ts` — boot wiring (instantiated in place of `BingoEngine` for Spill 3 rooms).

## Invariants

- Game-3 detection gate: `isGame3Round(room, variantConfig)` requires (a) `variantConfig.patternEvalMode === "auto-claim-on-draw"`, (b) NO `jackpotNumberTable` (Game 2 opts in via that field), (c) `uses5x5NoCenterTicket(gameSlug) === true`. Non-G3 rooms early-return → preserves G1 manual-claim semantics. Game 2 is a sibling subclass and never coexists with Game 3 in the same room.
- Cycler is round-scoped — `cyclersByRoom.get(room.code)` is rebuilt when `cyclerGameIdByRoom.get(room.code) !== game.id`. Ensures admin-edits to patterns mid-round do NOT bleed into active rounds (legacy parity with `game.allPatternArray` snapshot).
- Round ends ONLY on Full House — partial pattern wins (Row 1-4) keep `game.status === "RUNNING"`. `endedReason: "G3_FULL_HOUSE"` set.
- Prize split: `pricePerWinner = floor(totalPrize / winnerCount)`; rest stays with house.
- Each (player, ticket) is at most one winner per pattern per draw — `winnerRecords` carry `ticketIndex` to disambiguate same-player multi-ticket wins.
- `lastDrawEffectsByRoom` is read-and-clear: `getG3LastDrawEffects` deletes after read, so socket layer consumes exactly once per draw.
- Pattern definitions without resolvable masks are skipped with a warning (`G3 pattern has no resolvable mask — will never match`); they never match any ticket but don't crash the round.

## Test coverage

- `apps/backend/src/game/Game3Engine.test.ts` — main suite (706 LOC source ↔ test of similar size). Covers cycler step + activation, pattern win + payout, multiple winners, Full House termination, broadcast effect snapshot.

## Operational notes

Common failures + how to diagnose:
- Pattern never wins despite ball-threshold met — check log for `G3 pattern has no resolvable mask` warning. Pattern in admin needs `patternDataList[25]` or a recognized name (Row 1-4 / Full House / Coverall).
- "onClaimLogged failed for G3 auto-claim" error — `bingoAdapter.onClaimLogged` threw; auto-claim still succeeded (wallet + ledger + compliance committed). Investigate Postgres + claim-audit pipeline.
- Round won't end on Full House — check `winnerRecords.some(w => w.isFullHouse && w.ticketWinners.length > 0)`. If a Full House mask was matched but `ticketWinners` was empty, payout failed silently — check upstream wallet errors.
- Cycler not stepping — `getOrCreateCycler` returns existing cycler unless gameId changes. Verify `game.id` mutates on round restart.
- Game 2 + Game 3 hooks both fired for same room — IMPOSSIBLE: they're sibling subclasses, only one can be the engine instance.
- Wrong variant: G3 hook fires for Spill 2 — check `variantConfig.jackpotNumberTable`; if set, Game 2 owns it and `isGame3Round` returns false.

## Recent significant changes

- PR #322 (`5f3e4f69`): refactor — `Game3Engine extends BingoEngine` (not `Game2Engine`). Sibling-subclass model.
- PR #229 (`5d919165`): feat — `Game3Engine` + events + wire-up (BIN-615 / PR-C3b).

## Refactor status (audit-rapport REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md)

- `payG3PatternShare` and `transferPrizeShare` (~210 LOC combined) duplicate parts of `BingoEngine.payoutPhaseWinner` — could share a `PrizePayoutPipeline`.
- `lastDrawEffectsByRoom` Map mirrors the read-and-clear pattern of `Game2Engine` (jackpot stash) — a generic `PerDrawEffectsStash<T>` could DRY both.
- Pattern-mask resolution (named built-ins + 25-cell array) duplicated across `buildPatternSpecs` here and `BingoEnginePatternEval`'s mask paths — candidate for shared `PatternMaskResolver`.

