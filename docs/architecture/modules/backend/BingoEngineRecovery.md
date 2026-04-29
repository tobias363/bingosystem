# BingoEngineRecovery

**File:** `apps/backend/src/game/BingoEngineRecovery.ts` (331 LOC)
**Owner-area:** game-runtime
**Last reviewed:** 2026-04-30

## Purpose

Helper module owning snapshot serialization, crash-recovery checkpoint writers, buy-in refund pipeline, and room reconstruction from Postgres snapshots — extracted from `BingoEngine.ts` so the large engine class doesn't carry the recovery infrastructure inline.

It exists because checkpoint writes (DRAW, GAME_END, PAYOUT) and the buy-in refund pipeline are best-effort, log-and-continue operations with intricate error semantics, and lifting them into a pure-function module with a narrow `RecoveryContext` port keeps the engine's main code paths cleaner. The contract against `bingoAdapter.onCheckpoint` is byte-identical to the inline version.

## Public API

```typescript
// Narrow port — engine implements
export interface RecoveryContext {
  bingoAdapter: BingoSystemAdapter
  walletAdapter: WalletAdapter
  rooms: RoomStateStore
  syncRoomToStore(room: RoomState): void   // engine-private wrapper
  serializeGame(game: GameState): GameSnapshot   // engine-private wrapper
}

// Build full recovery snapshot (preserves drawBag + per-ticket marks)
export function serializeGameForRecovery(
  serializeGame: (game) => GameSnapshot,
  game: GameState,
): RecoverableGameSnapshot

// Checkpoint writers — best-effort, never throw
export async function writeDrawCheckpoint(ctx, room, game): Promise<void>
export async function writeGameEndCheckpoint(ctx, room, game): Promise<void>
export async function writePayoutCheckpointWithRetry(
  ctx, room, game,
  claimId, payoutAmount, transactionIds, prizeType: "LINE" | "BINGO",
): Promise<void>

// Buy-in refund (best-effort with reconciliation logging)
export async function refundDebitedPlayers(
  walletAdapter,
  debitedPlayers: Array<{ player; fromAccountId; toAccountId; amount }>,
  houseAccountId, roomCode, gameId,
): Promise<{
  failedRefunds: Array<{ playerId; walletId; amount; error }>
}>

// Restore RoomState from a persisted GameSnapshot at startup
export function restoreRoomFromSnapshot(
  ctx,
  roomCode, hallId, hostPlayerId, players, snapshot,
  gameSlug: string,   // BIN-672 — required, no fallback
): void
```

## Dependencies

**Calls (downstream):**
- `BingoSystemAdapter.onCheckpoint({ reason: "DRAW" | "GAME_END" | "PAYOUT", snapshot, players, ... })` — Postgres-backed checkpoint sink.
- `WalletAdapter.transfer(houseAccount, playerWallet, amount, reason, { idempotencyKey })` — reverse buy-in transfer.
- `IdempotencyKeys.adhocRefund({ gameId, playerId })` — refund key.
- `RoomStateStore.persist(roomCode)` (HOEY-7) — persistence after every DRAW + GAME_END.
- `RoomStateStore.has(code)` + `RoomStateStore.set(code, room)` — room registration during recovery.
- Logger — every CRITICAL / RECONCILIATION event flows to `logger.error` for ops alerting.

**Called by (upstream):**
- `apps/backend/src/game/BingoEngine.ts` — methods `writeGameEndCheckpoint` (kept on class, delegates here) + `writePayoutCheckpointWithRetry` (delegates) + `refundDebitedPlayers` (private wrapper) + `restoreRoomFromSnapshot` (called in `hydratePersistentState`).
- Subclasses `Game2Engine` and `Game3Engine` use the class-level wrappers (e.g. `super.writeGameEndCheckpoint`).

## Invariants

- Every recovery writer is fail-soft — `bingoAdapter.onCheckpoint` failures are logged at CRITICAL level but never propagate. Engine continues.
- `writePayoutCheckpointWithRetry` retries exactly once before giving up — second failure escalates to CRITICAL log only.
- `refundDebitedPlayers` returns structured `failedRefunds[]` so engine can pass the data to ops/reconciliation tooling. Manual ledger entry needed when failures happen.
- `serializeGameForRecovery` includes `drawBag` (full ordered) AND `structuredMarks` (per-player per-ticket Set<number>[]) — these are missing from the base `GameSnapshot` and required for byte-identical state reconstruction (BIN-243, BIN-244, KRITISK-5/6).
- `restoreRoomFromSnapshot` requires explicit `gameSlug` (BIN-672) — no silent fallback. Caller MUST read `game_sessions.game_slug` from the Postgres row.
- Recovery is one-shot: `restoreRoomFromSnapshot` throws `ROOM_ALREADY_EXISTS` if `rooms.has(code)`. Caller is responsible for not double-invoking.
- HOEY-7 invariant: every checkpoint writer MUST also call `rooms.persist(room.code)` afterwards — keeps in-memory + persistent stores aligned.

## Test coverage

- Indirect coverage from `apps/backend/src/game/BingoEngine.crashRecoveryPartialPayout.test.ts` — partial-payout crash + replay.
- `apps/backend/src/game/BingoEngineRecoveryIntegrityCheck.test.ts` — integrity check after restore.
- `apps/backend/src/game/BingoEngineRecoveryIntegrityCheck.ts` — runtime checker that detects desync.
- `apps/backend/src/game/BingoEngine.crit6PostTransferRecovery.test.ts` — CRIT-6 post-transfer recovery.
- `apps/backend/src/game/BingoEngine.crit6Atomicity.test.ts` — atomic claim coordinator.
- `apps/backend/src/game/__tests__/Game1FullRoundE2E.test.ts` — full round with checkpointing path executed.

## Operational notes

Common failures + how to diagnose:
- "CRITICAL: Checkpoint failed after draw" — `bingoAdapter.onCheckpoint` threw at DRAW. Round still proceeds in-memory; if Node crashes before next DRAW checkpoint, recovery loses one ball. Investigate Postgres connectivity / lock timeouts.
- "CRITICAL: Checkpoint failed after game end" — same, but at GAME_END. Recovery cannot identify game as ended; manual `app_game_sessions.status` patch needed if process won't restart cleanly.
- "CRITICAL: Checkpoint failed after PAYOUT (retry exhausted)" — `writePayoutCheckpointWithRetry` failed both attempts. Wallet was paid out but checkpoint missing; if Node crashes immediately, recovery may double-pay (idempotency-key in `walletAdapter.transfer` saves us, but `ledger` entry may be missing). Run `app_payout_audit` reconciliation.
- "CRITICAL: Failed to refund buy-in after game start failure — requires manual reconciliation" — one or more refund transfers threw. Check `failedRefunds[]` in log: `playerId`, `walletId`, `amount`, `error`. Manually credit player wallet via admin tooling.
- "RECONCILIATION: N refund(s) failed for game X" — summary log; capture this and feed to ops dashboard.
- `ROOM_ALREADY_EXISTS` during hydration — startup invoked recovery twice on same room. Check `BingoEngine.hydratePersistentState` for double-invocation.

## Recent significant changes

- PR #717 (`bea47642`): import `DomainError` from `errors/DomainError.ts`.
- PR #389 (`92ca9c78`): extracted from `BingoEngine.ts` (refactor/s1-bingo-engine-split — Forslag A).
- BIN-672: required `gameSlug` parameter on `restoreRoomFromSnapshot` (no fallback).
- BIN-244 / BIN-245: `structuredMarks` (Map<string, Set<number>[]>) preserved across restore — earlier snapshots lost per-ticket marks.
- KRITISK-5/6: `RecoverableGameSnapshot` adds `drawBag` + `structuredMarks` to base `GameSnapshot`.
- HOEY-3 / HOEY-6 / HOEY-7: checkpoint writers + post-checkpoint `rooms.persist`.
- HOEY-4: `refundDebitedPlayers` returns `failedRefunds[]` for reconciliation.

## Refactor status (audit-rapport REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md)

- `RecoveryContext` is a clean narrow port (5 fields). Future extension: lift `BingoSystemAdapter.onCheckpoint` into its own `CheckpointPort` so this module's checkpoint writers can be tested without the full `BingoSystemAdapter`.
- `restoreRoomFromSnapshot` mutates `RoomStateStore` directly — could return a `RoomState` and let caller register, improving testability.
- Logger calls hardcode keys (`gameId`, `claimId`, `roomCode`); could be wrapped in a `RecoveryLogContext` builder for consistency.

