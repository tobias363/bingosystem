# BingoEngineMiniGames

**File:** `apps/backend/src/game/BingoEngineMiniGames.ts` (387 LOC)
**Owner-area:** game-runtime
**Last reviewed:** 2026-04-30

## Purpose

Helper module owning jackpot-spin and ad-hoc mini-game (Wheel/Chest/Mystery/ColorDraft) lifecycle for the host-player-room engine — extracted from `BingoEngine.ts` to reduce LOC without changing public API.

It exists because `BingoEngine.spinJackpot()` and `BingoEngine.playMiniGame()` shared the same wallet-transfer + compliance + ledger pattern, and that pattern is large enough (≈100 LOC each) to warrant lifting into pure functions taking a narrow `MiniGamesContext` port. The legacy 4-way rotation (`wheelOfFortune → treasureChest → mysteryGame → colorDraft`) is canonicalized here as `MINIGAME_ROTATION`.

## Public API

```typescript
// Constants
export const JACKPOT_PRIZES: readonly number[]    // [5,10,15,20,25,50,10,15] kr
export const MINIGAME_PRIZES: readonly number[]   // [5,10,15,20,25,50,10,15] kr
export const MINIGAME_ROTATION: readonly MiniGameType[]  // wheel→chest→mystery→colorDraft

// Narrow port (engine implements)
export interface MiniGamesContext {
  walletAdapter: WalletAdapter
  compliance: ComplianceManager
  ledger: ComplianceLedger
  requireRoom(roomCode): RoomState
  requirePlayer(room, playerId): Player
  refreshPlayerBalancesForWallet(walletId): Promise<string[]>
}

// Mini-game rotation counter state (per-engine, mutated in place)
export interface MiniGameRotationState { counter: number }

// Jackpot lifecycle
export function activateJackpot(ctx, roomCode, playerId): JackpotState | null
export async function spinJackpot(ctx, roomCode, playerId): Promise<{
  segmentIndex; prizeAmount; playedSpins; totalSpins; isComplete; spinHistory
}>

// Mini-game lifecycle
export function activateMiniGame(
  ctx, rotationState, roomCode, playerId,
): MiniGameState | null
export async function playMiniGame(
  ctx, roomCode, playerId, _selectedIndex?,
): Promise<{ type; segmentIndex; prizeAmount; prizeList }>

// Re-exports for tests
export type { GameState, JackpotState, MiniGameState, MiniGameType }
```

## Dependencies

**Calls (downstream):**
- `WalletAdapter.transfer(houseAccountId, walletId, amount, reason, { idempotencyKey, targetSide: "winnings" })` — payout from house to player winnings-side.
- `ComplianceManager.recordLossEntry(walletId, hallId, { type: "PAYOUT", amount, createdAtMs })` — register prize as compliance event.
- `ComplianceLedger.makeHouseAccountId(hallId, "DATABINGO", "INTERNET")` — house account resolution.
- `ComplianceLedger.recordComplianceLedgerEvent({ eventType: "PRIZE", policyVersion: "jackpot-v1" | "minigame-v1", ... })`.
- `IdempotencyKeys.adhocJackpot({ gameId, playedSpins })` + `adhocMiniGame({ gameId, miniGameType })` — deterministic keys.
- `MiniGamesContext.refreshPlayerBalancesForWallet` — best-effort post-payout balance refresh (PR #553 W1-hotfix).
- `Math.random()` — server-side segment selection. NOT cryptographically secure (legacy parity); intentionally non-uniform in jackpot wheel via prize-list weighting.

**Called by (upstream):**
- `apps/backend/src/game/BingoEngine.ts:3535` — `spinJackpot(roomCode, playerId)`.
- `apps/backend/src/game/BingoEngine.ts:3596` — `playMiniGame(roomCode, playerId, _selectedIndex)`.
- `BingoEngine.activateMiniGame` (private, called by claim-success path + auto-claim Fullt Hus PR #727) and `activateJackpot` (private, called for Game 5 ad-hoc).

## Invariants

- Single-spin / single-play: `jackpot.isComplete` and `miniGame.isPlayed` block re-execution (`JACKPOT_COMPLETE` / `MINIGAME_PLAYED` errors). Not an idempotency-key path — explicit state guard.
- Player ownership: `jackpot.playerId === requesterId` and `miniGame.playerId === requesterId` enforced (`NOT_JACKPOT_PLAYER` / `NOT_MINIGAME_PLAYER` errors).
- Payout flows to winnings-side only — `targetSide: "winnings"` prevents prize money from re-entering deposit-loss-limit budget.
- Server-authoritative result — segment chosen via `Math.random()` ON server; `_selectedIndex` from client is cosmetic only (treasureChest "you opened chest 3" UI).
- Compliance + ledger events fire on every payout where `prizeAmount > 0`. `prizeAmount = 0` is a valid outcome and skips the ledger writes (no `PRIZE` entry for 0 kr).
- Wallet refresh is best-effort fail-soft — if `refreshPlayerBalancesForWallet` throws, prize is already credited; only the local `Player.balance` cache is stale until next room:update (PR #553).
- `MYSTERY_FORCE_DEFAULT_FOR_TESTING = true` is a hard-coded testing-only flag (top of file) — when true, `activateMiniGame` ALWAYS picks `mysteryGame` regardless of rotation counter. Counter still ticks so disabling the flag resumes rotation cleanly. Backport of PR #555.

## Test coverage

- Indirect coverage via `apps/backend/src/game/BingoEngine.test.ts` — ad-hoc Fullt Hus → mini-game-trigger.
- `apps/backend/src/game/__tests__/BingoEngine.miniGameAutoClaim.test.ts` — PR #727 auto-claim triggers mini-game.
- `apps/backend/src/game/BingoEngine.adhocMysteryDefault.test.ts` — `MYSTERY_FORCE_DEFAULT_FOR_TESTING` behavior.
- `apps/backend/src/game/BingoEngine.adhocPendingVsActiveTickets.test.ts` — mini-game with mixed ticket states.
- `apps/backend/src/game/BingoEngine.adhocPhase3to5Repro.test.ts` — phase-3-to-5 repro with mini-game popup.
- `apps/backend/src/game/BingoEngine.adhocWalletRefresh.test.ts` — W1-hotfix refresh after mini-game payout.

## Operational notes

Common failures + how to diagnose:
- `NO_JACKPOT` / `NO_MINIGAME` — caller invoked spin/play before activation. Check that `activateJackpot` / `activateMiniGame` ran in the BINGO-claim path; `activateMiniGame` is gated on `BingoEngine.activateMiniGame` private call from `submitClaim` and (PR #727) `evaluateActivePhase` auto-claim.
- `JACKPOT_COMPLETE` / `MINIGAME_PLAYED` — duplicate spin/play; client UI bug, server-side state correct.
- `NOT_JACKPOT_PLAYER` / `NOT_MINIGAME_PLAYER` — wrong player triggered; legitimate rejection.
- `NO_SPINS_LEFT` — `playedSpins >= totalSpins`; client should not enable spin button.
- "[BingoEngineMiniGames.spinJackpot] refresh feilet (best-effort)" warn — Postgres flap or lock-timeout during balance refresh; payout was already booked, balance display will sync on next room:update.
- House underfunded at payout — wallet transfer throws `WalletError("INSUFFICIENT_FUNDS")`; check `house-{hallId}-databingo-internet` account balance. Note: this engine hardcodes `gameType="DATABINGO"` + `channel="INTERNET"` (legacy decision; SpinnGo-flagged in code).

## Recent significant changes

- PR #717 (`bea47642`): import `DomainError` from `errors/DomainError.ts`.
- PR #553 (`41ed85de`): W1-hotfix — `refreshPlayerBalancesForWallet` replaces optimistic `player.balance += prize` (fixed 2nd-win stale-balance bug).
- PR #555 (`d4a7f16a`): backport `MYSTERY_FORCE_DEFAULT_FOR_TESTING` so QA sees Mystery as default mini-game.
- PR #389 (`92ca9c78`): extracted from `BingoEngine.ts` (refactor/s1-bingo-engine-split — Forslag A).

## Refactor status (audit-rapport REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md)

- HARDCODED `gameType="DATABINGO"` + `channel="INTERNET"` is legacy; should follow `BingoEngine.variantGameTypeByRoom.get(roomCode)`. Tracked in audit as "compliance multi-hall-bug" residual.
- `MYSTERY_FORCE_DEFAULT_FOR_TESTING` should be env-var-gated (`MINIGAME_FORCE_TYPE=mysteryGame`) instead of hardcoded `true`. Enabling/disabling currently requires code change + redeploy.
- The two payout blocks (jackpot + mini-game) are 95% identical — ripe for extraction into a single `payOutMiniGameOrJackpotPrize(...)` helper.

