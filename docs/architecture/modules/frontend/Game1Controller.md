# Game1Controller

**File:** `packages/game-client/src/games/game1/Game1Controller.ts` (1121 LOC)
**Owner-area:** frontend-runtime
**Last reviewed:** 2026-04-30

## Purpose

Top-level orchestration for Spill 1 (Norsk Bingo, 75-ball 5×5) on the player client — owns the phase state machine, routes bridge events to UI, and wires the supporting `logic/`-modules (`SocketActions`, `MiniGameRouter`, `LegacyMiniGameAdapter`, `ReconnectFlow`).

Lifecycle: `start()` connects the socket, joins/creates a room, applies the initial snapshot, transitions to the appropriate phase, then yields control to bridge events. `destroy()` tears down every overlay, unsubscribes from bridge events, and detaches the Pixi root. The class implements the small `GameController` interface from `games/registry.ts` and is registered for the `bingo` and `game_1` slugs at module load.

## Public API

```typescript
import type { GameController } from "../registry.js";

class Game1Controller implements GameController {
  constructor(deps: GameDeps)              // { app, bridge, socket, audio, roomCode, hallId }
  async start(): Promise<void>              // Connect → join → applySnapshot → wireEvents → transition
  resize(width: number, height: number): void
  destroy(): void                           // Idempotent teardown of every overlay + bridge subscription
}

// Registered at module load:
registerGame("bingo",   deps => new Game1Controller(deps));
registerGame("game_1",  deps => new Game1Controller(deps));
```

Internal-only state machine (not exported, but visible in tests):

```typescript
type Phase = "LOADING" | "WAITING" | "PLAYING" | "SPECTATING" | "ENDED";
// Transitions strictly from bridge events — no caller can force a phase.
```

Bridge events the controller subscribes to (see `bridge/GameBridge.ts` for full event signatures):
- `stateChanged` — drives PlayScreen `update(state)`, pause overlay show/hide, defensive ENDED→PLAYING recovery, end-of-round overlay `markRoomReady()` gating.
- `gameStarted` — clears end-of-round overlay, resets per-round accumulators, transitions PLAYING/SPECTATING.
- `gameEnded` — drains in-flight mini-game choices, dismisses overlays, shows `Game1EndOfRoundOverlay`.
- `numberDrawn` — drives ball animation + ticket marking.
- `patternWon` — triggers `WinPopup` (LINE phases 1-4) or `WinScreenV2` (Fullt Hus / BINGO).
- `miniGameTrigger` — routed to `MiniGameRouter` (M6 protocol).
- `miniGameResult` — routed to overlay's `animateResult` via the router.
- `legacyMinigameActivated` — auto-claim Spill 1 mini-game adapter (PR #728).
- `betRejected` — toast + pre-round bonger fjernes via neste `room:update`.
- `walletLossStateChanged` — oppdaterer "Brukt i dag"-header i Kjøp Bonger-popup.

## Dependencies

**Calls (downstream):**
- `bridge/GameBridge.ts` — primary state source. `bridge.start(myPlayerId)`, `bridge.applySnapshot(snapshot)`, `bridge.on(event, handler)`, `bridge.getState()`.
- `net/SpilloramaSocket.ts` — `socket.connect()`, `socket.createRoom()`, `socket.on("connectionStateChanged", …)`.
- `core/preloadGameAssets.ts` — pre-warms Pixi asset cache before joining (BIN-673 LOADING_ASSETS state).
- `screens/PlayScreen.ts` — primary UI surface for WAITING / PLAYING / SPECTATING; single `update(state)` entry point.
- `components/LoadingOverlay.ts` — typed state machine: CONNECTING → RECONNECTING → LOADING_ASSETS → JOINING_ROOM → READY (BIN-673).
- `components/Game1EndOfRoundOverlay.ts` — combined Summary+Loading overlay for ENDED phase (PR #737, formerly 3-phase fluid in PR #734).
- `components/WinPopup.ts` — fase 1-4 vinn-popup (Bong-design, port av WinPopup.jsx).
- `components/WinScreenV2.ts` — Fullt Hus fullskjerm-scene med count-up.
- `components/PauseOverlay.ts` — vises ved `state.isPaused`; støtter `pauseUntil` countdown og fallback-tekst (MED-11).
- `components/ToastNotification.ts`, `LuckyNumberPicker.ts`, `SettingsPanel.ts`, `MarkerBackgroundPanel.ts`, `GamePlanPanel.ts` — øvrige UI-overlays.
- `logic/SocketActions.ts` (`Game1SocketActions`) — every player→server call: `setLuckyNumber`, `elvisReplace`, `claim`, `cancelTicket`, `armTickets`.
- `logic/MiniGameRouter.ts` — wheel/chest/colordraft/oddsen/mystery overlay dispatch via M6 protocol.
- `logic/LegacyMiniGameAdapter.ts` — auto-claim Spill 1 mini-game adapter for legacy `minigame:activated` channel.
- `logic/ReconnectFlow.ts` — sync-ready barrier (BIN-500) + reconnect-state-rebuild.
- `audio/AudioManager.ts` — `playNumber`, `playBingoSound`, `playSfx`, settings sync.
- `telemetry/Telemetry.ts` — `trackEvent`, `trackReconnect`, `trackDisconnect`, `pattern_won`, `end_of_round_overlay_shown`.

**Called by (upstream):**
- `games/registry.ts` `createGame("bingo", deps)` and `createGame("game_1", deps)` — invoked from the lobby route handler when the player picks Spill 1.
- `Game1Controller.*.test.ts` (7 test files) — covers claim flow, end-of-round flow, legacy mini-game queue, M6 mini-game queue, patternWon, reconnect, round transition.

## Invariants

- **Phase transitions are bridge-driven only.** Internal `transitionTo(phase, state)` is private — no public API can force a phase. PLAYING vs SPECTATING is decided by `state.myTickets.length > 0` at `gameStarted`.
- **One overlay at a time per category.** `WinScreenV2` (Fullt Hus) blocks mini-game and end-of-round overlays via `isWinScreenActive`; pending triggers held in `pendingMiniGameTrigger` / `pendingLegacyMiniGame` and flushed on `WinScreenV2.onDismiss`.
- **Defensive ENDED→PLAYING recovery (PR #569 / 2026-04-27 fix).** If `stateChanged` arrives with `gameStatus === "RUNNING"` while still in `ENDED` (race with dropped `gameStarted` event or `endScreenTimer`), controller force-transitions to PLAYING/SPECTATING — no user refresh needed.
- **End-of-round overlay gates dismiss on TWO conditions (PR #737):** `markRoomReady()` (controller signals room has fresh live-state) AND `MIN_DISPLAY_MS` elapsed (3s normal / 1s spectator). The 50ms grace in `stateChanged` ensures the room-ready signal is the *next* state-update, not the same one that triggered `show()`.
- **Round-accumulated winnings reset at `gameStarted`.** `roundAccumulatedWinnings = 0` on every new round so `WinScreenV2` shows the cumulative round total at Fullt Hus, not just the Fullt Hus prize.
- **`destroy()` is idempotent.** Calls are safe to chain without state checks; every nullable overlay/listener field is set to `null` after teardown.
- **Bridge subscriptions tracked in `unsubs[]`.** Every `bridge.on(...)` returns an unsubscribe function pushed to `unsubs`; `destroy()` invokes them all to prevent listener leaks across game-switches.
- **Sync-ready barrier (BIN-500) before READY.** `LoadingOverlay` doesn't transition to READY until `(a) socket connected`, `(b) snapshot applied`, `(c) audio preloaded`, `(d) if RUNNING — at least one live `room:update` OR `numberDrawn` confirms socket actually delivers`.

## Test coverage

- `packages/game-client/src/games/game1/Game1Controller.claim.test.ts` — `actions.claim` invocation, claim-rejected toast handling.
- `packages/game-client/src/games/game1/Game1Controller.endOfRoundFlow.test.ts` — overlay show/dismiss gating, `markRoomReady` semantics, `onOverlayCompleted` recovery to WAITING.
- `packages/game-client/src/games/game1/Game1Controller.legacyMiniGameQueue.test.ts` — legacy `minigame:activated` queueing while WinScreenV2 is active; flush on dismiss.
- `packages/game-client/src/games/game1/Game1Controller.miniGameQueue.test.ts` — M6 `miniGameTrigger` queueing semantics.
- `packages/game-client/src/games/game1/Game1Controller.patternWon.test.ts` — WinPopup vs WinScreenV2 routing, accumulated-winnings invariant, multi-winner split detection.
- `packages/game-client/src/games/game1/Game1Controller.reconnect.test.ts` — `ReconnectFlow.handleReconnect` invocation, loader state transitions, ENDED-state late-join showing overlay.
- `packages/game-client/src/games/game1/Game1Controller.roundTransition.test.ts` — defensive ENDED→PLAYING recovery, end-of-round overlay close on `gameStarted`.

## Operational notes

- **Stuck loader complaint:** `LoadingOverlay` sticks in CONNECTING / JOINING_ROOM. Check `socket.isConnected()` and `socket.createRoom()` ack. After 5s the loader shows the "Last siden på nytt" reload button (BIN-673).
- **Stuck ENDED phase:** end-of-round overlay never dismisses. Either `markRoomReady()` was never called (server didn't push a fresh `room:update` after game-end) or `endOfRoundOverlay.tryDismiss` is being short-circuited by `hasFiredCompleted`. The `END_SCREEN_AUTO_DISMISS_MS = 10_000` constant is a panic timeout for legacy paths only.
- **Mini-game choice loss complaint:** `MiniGameRouter.dismissAfterPendingChoices` waits up to 1500ms for in-flight `mini_game:choice` ack before destroying overlay. After timeout, `onChoiceLost` callback fires a toast: "Valget ble ikke registrert i tide. Eventuell gevinst krediteres automatisk." Server is idempotent on `mini_game:choice` (orchestrator `completed_at` lock) so late ack still credits.
- **Saldo-flash on game-end:** controller dispatches `spillorama:balanceRefreshRequested` window-event so lobby does debounced `GET /api/wallet/me` instead of an optimistic balance push (would race gross-vs-available semantics).
- **Reconnect flow:** `connectionStateChanged === "reconnecting"` shows RECONNECTING loader; on `connected` while loader is still showing, `ReconnectFlow.handleReconnect` rebuilds room state via `room:resume` and calls `transitionTo(phase, state)`.

## Recent significant changes

- PR #737 (`491f06f4`) — combined Summary+Loading overlay (drop COUNTDOWN), `markRoomReady()` API gates dismiss on min-display-time + room-ready signal.
- PR #734 (`1b421ef7`) — earlier 3-phase fluid overlay (SUMMARY → LOADING → COUNTDOWN). Superseded by PR #737.
- PR #729 (`79b245d6`) — initial retail-style end-of-round overlay (replaces Pixi EndScreen).
- PR #728 (`dd1729e6`) — wire `minigame:activated` listener for auto-claim Spill 1 mini-game (legacy adapter).
- PR #725 (`cc7ec64a`) — bet:arm enforces loss-limit with partial-buy + delayed-render UX.
- PR #702 (`275fa2be`) — Bølge 2A pilot-blockers: Pixi ticker cap, mini-game lifecycle (PIXI-P0-002 `dismissAfterPendingChoices`), Elvis-replace leak.
- PR #569 (`2ba17eca`) — re-join etter disconnect + autoplay uten armed players.
- PR #587 (`d6b8a174`) — UI Gevinst-display teller faktisk credit ved multi-winner-split.
- PR #495 (`263d4764`) — KRITISK round-state-isolation: skille pending vs active tickets.
- PR #308 (`e6a8cc18`) — Fase 3 ekstraher SocketActions + MiniGameRouter + ReconnectFlow til logic/-moduler.
- BIN-690 PR-M6 — scheduled-games mini-game protocol (`miniGameTrigger` / `miniGameResult` events).

## Refactor status

- Most recent extraction: PR #308 broke up the previous-monolith Game1Controller into `logic/SocketActions.ts` + `logic/MiniGameRouter.ts` + `logic/ReconnectFlow.ts`. The remaining 1121 LOC handle phase machine, bridge-event routing, and overlay coordination.
- See `packages/game-client/src/games/game1/ARCHITECTURE.md` for the controller/screens/logic/components ownership boundary.
- Future scope: `Game1Controller.ts` could be split further (event-handler module + phase-machine module) — not currently planned. The class is acceptable at its current size given the well-defined responsibility per private method.

For overlay-overlap rules (mini-game vs WinScreenV2 vs end-of-round), see `docs/audit/GAME_CLIENT_PIXI_AUDIT_2026-04-28.md`.
