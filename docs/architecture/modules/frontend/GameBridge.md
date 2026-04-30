# GameBridge

**File:** `packages/game-client/src/bridge/GameBridge.ts` (748 LOC)
**Owner-area:** frontend-runtime
**Last reviewed:** 2026-04-30

## Purpose

Translation layer between raw Socket.IO payloads and the high-level `GameState` snapshot that game scenes consume. Game controllers subscribe to typed events (`gameStarted`, `numberDrawn`, `patternWon`, …) instead of parsing every `RoomUpdatePayload`/`DrawNewPayload` manually — and one bridge instance owns the player's view of the live state, so multi-overlay surfaces (PlayScreen + ChatPanel + leftInfo + chatPanel) read from the same coherent snapshot.

The bridge also hosts the BIN-502 draw-gap detection (compare `drawIndex` to `lastAppliedDrawIndex`, fire one resync on gap, drop duplicates), the BIN-686 snapshot adoption fix, and the BIN-760 authoritative `wallet:state` push deduping by `serverTimestamp`.

## Public API

```typescript
export interface GameState {
  roomCode: string; hallId: string;
  gameStatus: "WAITING" | "RUNNING" | "ENDED" | "NONE"
  gameId: string | null
  players: Player[]; playerCount: number
  drawnNumbers: number[]; lastDrawnNumber: number | null; drawCount: number; totalDrawCapacity: number
  myTickets: Ticket[]; myMarks: number[][]; myPlayerId: string | null
  patterns: PatternDefinition[]; patternResults: PatternResult[]
  prizePool: number; entryFee: number
  myLuckyNumber: number | null; luckyNumbers: Record<string, number>
  millisUntilNextStart: number | null
  autoDrawEnabled: boolean; canStartNow: boolean
  disableBuyAfterBalls: number              // BIN-451
  isPaused: boolean; pauseMessage: string | null; pauseUntil: string | null; pauseReason: string | null  // MED-11
  gameType: string                          // "bingo", "rocket", "monsterbingo", "spillorama"
  ticketTypes: Array<{ name, type, priceMultiplier, ticketCount }>
  replaceAmount: number                     // BIN-419 Elvis replace
  jackpot: { drawThreshold, prize, isDisplay } | null  // F3 (BIN-431)
  preRoundTickets: Ticket[]; isArmed: boolean
  myStake: number                           // Server-authoritative ACTIVE-round stake
  myPendingStake: number                    // Server-authoritative NEXT-round commitment (Tobias 2026-04-25)
  serverTimestamp: number
}

export interface GameBridgeEvents {
  stateChanged:           (state: GameState) => void
  gameStarted:            (state: GameState) => void
  gameEnded:              (state: GameState) => void
  numberDrawn:            (number: number, drawIndex: number, state: GameState) => void
  patternWon:             (result: PatternWonPayload, state: GameState) => void
  chatMessage:            (message: ChatMessage) => void
  jackpotActivated:       (data: JackpotActivatedPayload) => void
  legacyMinigameActivated: (data: MiniGameActivatedPayload) => void  // PR #728
  miniGameTrigger:        (data: MiniGameTriggerPayload) => void      // BIN-690 PR-M6
  miniGameResult:         (data: MiniGameResultPayload) => void
  walletStateChanged:     (event: WalletStateEvent) => void           // BIN-760
  betRejected:            (event: BetRejectedEvent) => void           // PR #725 / Tobias 2026-04-29
  walletLossStateChanged: (event: WalletLossStateEvent) => void
}

export class GameBridge {
  constructor(socket: SpilloramaSocket)

  // Lifecycle
  start(myPlayerId: string | null): void   // Subscribe to socket events, initialize state
  stop(): void                             // Unsubscribe + reset state to empty

  // State access
  getState(): GameState                    // Live reference — controllers should not mutate

  // Event subscription — returns unsubscribe fn
  on<K extends keyof GameBridgeEvents>(event: K, listener: GameBridgeEvents[K]): () => void

  // Apply initial snapshot (from room:join / room:create response)
  applySnapshot(snapshot: RoomSnapshot): void

  // Observability (BIN-502 draw-gap detection)
  getGapMetrics(): { gaps: number; duplicates: number; lastAppliedDrawIndex: number }
}
```

## Dependencies

**Calls (downstream):**
- `net/SpilloramaSocket.ts` — `socket.on(eventName, handler)` for `roomUpdate`, `drawNew`, `patternWon`, `chatMessage`, `jackpotActivated`, `minigameActivated`, `miniGameTrigger`, `miniGameResult`, `walletState`, `betRejected`, `walletLossState`. Also `socket.resyncRoom(roomCode)` for the BIN-502 gap-detection path.
- `window.dispatchEvent(new CustomEvent("spillorama:walletStateChanged", { detail: payload }))` — bridges authoritative `wallet:state` to lobby-shell-level listeners.
- `window.dispatchEvent(new CustomEvent("spillorama:balanceChanged", …))` — legacy `me.balance` push from `room:update` (kept for backward compat with lobby-shell dedup; lobby prefers the wallet-state event).

**Called by (upstream):**
- `games/game1/Game1Controller.ts:171` — `bridge.start(myPlayerId)`, `bridge.applySnapshot(joinResult.data.snapshot)`, multiple `bridge.on(event, handler)` calls. `bridge.getState()` for late-joiner branch decisions.
- `games/game2/Game2Controller.ts`, `games/game3/Game3Controller.ts`, `games/game5/Game5Controller.ts` — same pattern for other slugs.
- Test fakes — `Game1Controller.*.test.ts` files construct a real `GameBridge` against a `FakeSocket` and emit synthetic socket events to verify state transitions.

## Invariants

- **Single source of truth for `GameState`.** All consumers (PlayScreen, ChatPanel, LeftInfoPanel, GamePlanPanel) read from the same `state` object via `bridge.getState()`. Bridge mutates the object in-place; consumers receive the same reference each tick.
- **Event emission is synchronous.** `emit` walks the listener Set synchronously after every `handle*` mutation — no microtask deferral. Order: `stateChanged` last (after `gameStarted` / `gameEnded` / `patternWon`) so listeners that read the post-transition state see fresh data.
- **`stop()` resets state cleanly.** Re-`start()`-ing yields a fresh `createEmptyState()` and clears BIN-502 gap-detection bookkeeping (`lastAppliedDrawIndex = -1`, `resyncInFlight = false`, counters back to 0).
- **BIN-502: gap-detection.** `lastAppliedDrawIndex` resets to `-1` on `start()` and on full snapshot adoption (`applySnapshot` / resync). On `drawNew` payloads with `drawIndex < expected`, count as duplicate and drop. On `drawIndex > expected`, increment `drawGapCount`, fire one resync (gated by `resyncInFlight`), and wait for the snapshot before trusting future `drawNew`.
- **BIN-686: room:update doesn't reset gap baseline.** Only full-snapshot paths (`applySnapshot` and `resyncRoom`) reset `lastAppliedDrawIndex`. `room:update` carries a snapshot for state-sync but doesn't bump the index — otherwise the next `drawNew` after a `room:update` looks like a gap and triggers an infinite resync loop.
- **BIN-760: wallet-state out-of-order push protection.** `handleWalletState` compares `payload.serverTimestamp` against `lastWalletStateTs`; older pushes are dropped silently. Reconnects can replay older pushes from the socket buffer.
- **Saldo-flash dedup REMOVED (W1-HOTFIX 2026-04-26).** The earlier `lastEmittedBalance` dedup was a defensive lapp that blocked legitimate refreshes when the same value arrived twice in a race. Now every `room:update` fires `balanceChanged` with current `me.balance`; lobby-shell has its own dedup on `_lastBalanceSeen`. Field kept as `null` for backward compat with `stop()` reset and test imports.
- **Multi-winner split mirrored from `patternWon` payload.** When `payload.winnerIds[]` is present, `existing.winnerIds` and `existing.winnerCount` are mirrored into the state — downstream UI renders 2nd+ winner correctly without waiting for the next `room:update`.

## Test coverage

- `packages/game-client/src/bridge/GameBridge.test.ts` — primary suite covering applySnapshot, room:update merge, draw:new gap detection, patternWon mirroring, walletState dedup, betRejected pass-through, lifecycle (start/stop reset).
- `packages/game-client/src/bridge/lobbyBalanceHandler.saldoFlash.test.ts` — saldo-flash regression coverage for the W1-HOTFIX dedup removal.
- Integration in `Game1Controller.*.test.ts` — every controller test constructs a real GameBridge against a FakeSocket and emits synthetic events.

## Operational notes

- **Resync storm:** `getGapMetrics().gaps` keeps incrementing on a single client. Server is dropping `draw:new` events; check ScrollerLog for `drawGap` warnings. Server-side fix: ensure draw:new is emitted inside the same lock as the engine state mutation.
- **Stale draw count after reconnect:** `drawCount` doesn't update past the reconnect snapshot. Likely cause: `applySnapshot` was called with `resetDrawIndex: false` somewhere (only `applyGameSnapshot` from full-snapshot paths sets `true`).
- **Out-of-order wallet pushes:** `handleWalletState` log line shows older `serverTimestamp` than `lastWalletStateTs` — drops silently. Confirms BIN-760 dedup is working; no action needed.
- **Pause overlay shows wrong text:** `pauseReason` is missing or unrecognized — `PauseOverlay` falls back to MED-11 generic Norwegian text. Server should populate `pauseReason ∈ {AWAITING_OPERATOR, MANUAL_PAUSE, MANUAL_PAUSE_5MIN, AUTO_PAUSE_PHASE_WON, …}`.
- **Late-joiner state:** at `applySnapshot`, the bridge seeds `previousGameStatus` from the applied snapshot so the first incoming `room:update` doesn't mistake mid-round join for a WAITING→RUNNING transition (which would reset `lastAppliedDrawIndex` and drop the next `draw:new` as duplicate). BIN-686.
- **Variant-config null after room:create:** server's `room:create` ack contains `gameVariant` inline; `applySnapshot` reads it via the cast `(snapshot as RoomSnapshot & { gameVariant?: ... })`. If the controller renders before `gameVariant` populates, ticketTypes will be empty and buy popup hides.

## Recent significant changes

- PR #728 (`dd1729e6`) — added `legacyMinigameActivated` event + `minigameActivated` socket subscription to support auto-claim Spill 1 mini-games.
- PR #725 (`cc7ec64a`) — added `betRejected` and `walletLossStateChanged` events for partial-buy + delayed-render UX.
- PR #564 (`5a155040`) — BIN-760 authoritative `wallet:state` socket-event with `lastWalletStateTs` dedup.
- PR (`d6b8a174`) — multi-winner-split mirror in `handlePatternWon`: `winnerIds[]` + `winnerCount` propagated to state.
- PR #561 (`f553acfb`) — fix(spill1): inkluder variantConfig i room:update-payload (premie-rader 0kr-bug).
- PR #594 (`c1b0a4dd`) — MED-11: pauseUntil/pauseReason fields added to GameState.
- W1-HOTFIX 2026-04-26 — removed saldo-flash dedup (`lastEmittedBalance` now no-op).
- BIN-502 — draw-gap detection (counters + one-shot resync).
- BIN-686 — full-snapshot vs room:update gap-baseline distinction (`opts.resetDrawIndex`).

## Refactor status

Not in scope for K1–K5 backend refactor waves (those are server-side). The bridge has been progressively extracted to support multi-game runtime — Game 2/3/5 controllers also use it. Future scope:
- Split state into per-game-type interfaces if Game 5 (SpinnGo) introduces databingo-only fields that don't belong in the live-game shape.
- Move BIN-502 gap-detection into a dedicated `DrawGapDetector` module if the bridge crosses 1000 LOC.

See `docs/audit/FRONTEND_ARCHITECTURE_AUDIT_2026-04-28.md` for the broader frontend-runtime audit.
