# Game1EndOfRoundOverlay

**File:** `packages/game-client/src/games/game1/components/Game1EndOfRoundOverlay.ts` (895 LOC)
**Owner-area:** frontend-runtime
**Last reviewed:** 2026-04-30

## Purpose

HTML-based end-of-round overlay for Spill 1 — combined Summary + Loading. Shows the player who won what (own total + per-phase patterns table + mini-game result), keeps a "Tilbake til lobby"-knapp permanently visible so the player can leave at any time, and gates dismiss on `(a) min-display-time elapsed` AND `(b) controller has called markRoomReady()`.

PR #737 (`491f06f4`, the most recent change) simplified this from a 3-phase fluid SUMMARY → LOADING → COUNTDOWN flow to a single SUMMARY phase that spans the full visibility window. The earlier countdown phase showed a black screen with a counter — players didn't see live elements (pattern animation, next-game info, gevinster) until they refreshed. The new design keeps the loading spinner inside the summary card and dismisses straight to the live room (where buy-popup shows up natively when WAITING activates).

## Public API

```typescript
export type EndOfRoundPhase = "SUMMARY" | "LOADING" | "COUNTDOWN"
// LOADING/COUNTDOWN kept for type-compat with older tests but never set after PR #737.

export const MIN_DISPLAY_MS = 3_000
export const MIN_DISPLAY_MS_SPECTATOR = 1_000
export const SUMMARY_PHASE_MS = MIN_DISPLAY_MS                   // @deprecated alias
export const SUMMARY_PHASE_SPECTATOR_MS = MIN_DISPLAY_MS_SPECTATOR // @deprecated alias

export interface Game1EndOfRoundSummary {
  endedReason: string | undefined          // From currentGame.endedReason — drives header copy
  patternResults: ReadonlyArray<PatternResult>
  myPlayerId: string | null
  myTickets?: ReadonlyArray<Ticket>
  miniGameResult?: MiniGameResultPayload | null
  luckyNumber?: number | null
  ownRoundWinnings?: number                // Set by controller (mirror of roundAccumulatedWinnings)
  millisUntilNextStart?: number | null     // @deprecated post-PR #737 (no countdown phase)
  elapsedSinceEndedMs?: number             // For reconnect-resilience min-display calc
  onBackToLobby: () => void                // Always available — emits lobby navigation
  onCountdownNearStart?: () => void        // @deprecated — overlay no longer opens buy-popup
  onOverlayCompleted?: () => void          // Fires when both (a) min-display elapsed + (b) markRoomReady — caller transitions to next phase
}

export class Game1EndOfRoundOverlay {
  constructor(parent: HTMLElement)

  // Mount — idempotent (re-show closes prior session first)
  show(summary: Game1EndOfRoundSummary): void

  // Controller signal: fresh room-state snapshot has arrived; overlay may dismiss once min-display also passes
  markRoomReady(): void

  // Read state — for tests + Game1Controller reconnect handling
  isVisible(): boolean
  getCurrentPhase(): EndOfRoundPhase | null

  // Idempotent teardown
  hide(): void
  destroy(): void
}
```

## Dependencies

**Calls (downstream):**
- DOM (no Pixi). Inserts `<div role="dialog" aria-modal="true" data-testid="game1-end-of-round-overlay">` into `parent`. CSS injected once via `ensureEndOfRoundStyles()`.
- `requestAnimationFrame` for the count-up animation on the total amount (1400ms over the SUMMARY phase).
- `setTimeout` for min-display-time tracking and fade-out timer.
- Static logo asset: `/web/games/assets/game1/design/spillorama-logo.png`.
- Norwegian-locale formatting via `Number.toLocaleString("no-NO")`.
- `formatHeader(endedReason, ownTotal)` — derives `{ title, subtitle }` from `endedReason ∈ {BINGO_CLAIMED, MAX_DRAWS_REACHED, DRAW_BAG_EMPTY, MANUAL_END, SYSTEM_ERROR}`.

**Called by (upstream):**
- `games/game1/Game1Controller.ts:185` — single instance constructed in controller `start()` (overlayContainer is `app.canvas.parentElement` or `document.body`). Controller calls `show(summary)` from `onGameEnded` (PLAYING phase) or after `WinScreenV2.onDismiss` if Fullt Hus animation was active. `markRoomReady()` called from `stateChanged` once 50ms grace has passed since show. `hide()` called on `gameStarted` if a fast auto-round starts before dismiss.
- `Game1EndOfRoundOverlay.test.ts` — 15+ test cases covering header copy, phases, dismiss-gating semantics.

## Invariants

- **`show()` is idempotent.** Internally calls `hide()` first to close any prior session, then mounts fresh DOM. Reconnect mid-overlay rebuilds from scratch using `elapsedSinceEndedMs` to start min-display-timer correctly (a player who has been visible for 4s already doesn't get a fresh 3s pause).
- **Dismiss requires BOTH conditions (PR #737):** `markRoomReady()` was called (controller signals room has fresh live-state) AND `minDisplayElapsed === true` (3s normal / 1s spectator timer has fired). `tryDismiss` is invoked on both setting `isRoomReady = true` and the timer callback — whichever happens last triggers the actual dismiss.
- **`hasFiredCompleted` guards `onOverlayCompleted`.** Idempotent — multiple `markRoomReady` calls produce exactly one completion callback.
- **Fade-out is 300ms.** `tryDismiss` sets `root.style.opacity = "0"` with CSS transition, then fires `onOverlayCompleted` and `hide()` on a `setTimeout(PHASE_FADE_MS = 300ms)`. The completion callback sees the overlay visually gone before navigation.
- **Header copy distinguishes endedReason (PR #733).** `MAX_DRAWS_REACHED`/`DRAW_BAG_EMPTY` subtitle says "Runden er slutt" — never "Fullt Hus er vunnet". `BINGO_CLAIMED` shows "Vinnerne er kåret" only if a Fullt Hus winner was actually announced. Spectator (`ownTotal === 0`) never claims Fullt Hus was won unless `endedReason === BINGO_CLAIMED`.
- **Persistent "Tilbake til lobby" button.** Sits OUTSIDE phase content so it doesn't transition; clicking it calls `summary.onBackToLobby()` synchronously before `hide()`.
- **Spectator min-display is 1s.** Players with no own winnings (`ownRoundWinnings === 0`) are dismissed quickly — no celebration to extend.
- **Count-up animation on own total.** Uses requestAnimationFrame for 1400ms; if `ownRoundWinnings === 0`, shows static "0 kr".
- **No COUNTDOWN/LOADING phase set after PR #737.** Type union retained for backward compat with `Game1Controller.endOfRoundFlow.test.ts`; `getCurrentPhase()` reports `"SUMMARY"` for the entire visibility window.
- **`hide()` clears all timers.** `clearTimers()` cancels phaseTimer, countdownRaf, countUpRaf — no leaked frames after dismiss.

## Test coverage

- `packages/game-client/src/games/game1/components/Game1EndOfRoundOverlay.test.ts` — 15+ test cases:
  - Mount: SUMMARY phase active initially.
  - Mount: "Tilbake til lobby" button visible.
  - Mount: persistent loading-spinner-indikator visible in SUMMARY.
  - Header copy variants: BINGO_CLAIMED with ownTotal>0 → "Du vant"; ownTotal=0 → "Spillet er ferdig"; MAX_DRAWS_REACHED → "Alle baller trukket"; MANUAL_END → "Runden ble avsluttet"; subtitle SHOULD NOT say "Fullt Hus er vunnet" on MAX_DRAWS.
  - Egen total: rendrer beløp-element.
  - Patterns-tabell: rendrer alle phases med vinner-info.
  - Dismiss gating: `markRoomReady` alene → IKKE dismiss før min-display passert.
  - Dismiss gating: min-display alene → IKKE dismiss før markRoomReady kalt.
  - Dismiss gating: BÅDE conditions met → onOverlayCompleted fyrer.
  - Dismiss gating: rekkefølgen ready-først / min-display-først gir samme resultat.
  - Dismiss idempotent: flere markRoomReady-calls → én onOverlayCompleted.
- `Game1Controller.endOfRoundFlow.test.ts` — controller-level integration covering the wire-up between `onGameEnded` → `show` → `stateChanged` → `markRoomReady` → `onOverlayCompleted` → `dismissEndOfRoundAndReturnToWaiting`.

## Operational notes

- **Overlay never dismisses:** either `markRoomReady()` was never called (controller didn't see a fresh `room:update` after game-end) or `hasFiredCompleted` is short-circuiting. Check the 50ms grace in `Game1Controller.onStateChanged` — `endOfRoundOverlayShownAt + 50` must elapse before the *next* state-update qualifies as room-ready.
- **Overlay flashes during fast auto-round:** controller's `onGameStarted` calls `endOfRoundOverlay.hide()` to immediately tear it down when a fast auto-round starts before dismiss. Without this, summary briefly overlays the new round.
- **Reconnect mid-overlay:** controller's late-join path (`state.gameStatus === "ENDED"` at `start()`) calls `showEndOfRoundOverlayForState(state)`, which uses `roundEndedAt` (or `0` fallback if late-join) to compute `elapsedSinceEndedMs`. Min-display-timer then ticks from a corrected origin, so a 4s-elapsed reconnect doesn't get a fresh 3s pause.
- **Spectator (no own tickets) dismisses too fast:** by design — `MIN_DISPLAY_MS_SPECTATOR = 1_000`. Adjustable but the rationale is no celebration to extend.
- **Header subtitle wrong after Phase 5 fail-to-claim:** historic bug fixed in PR #733. If you see "Fullt Hus er vunnet" on a MAX_DRAWS round, regression — the `formatHeader` switch should distinguish.

## Recent significant changes

- PR #737 (`491f06f4`, current) — combined Summary+Loading (drop COUNTDOWN), `markRoomReady()` API, gate dismiss on min-display-time + room-ready signal.
- PR #734 (`1b421ef7`) — earlier 3-phase fluid SUMMARY → LOADING → COUNTDOWN overlay. Superseded by PR #737.
- PR #733 (`2a100ab1`) — regression coverage + overlay text for phase progression with 0 budget. Header copy disambiguation between BINGO_CLAIMED / MAX_DRAWS / MANUAL_END.
- PR #729 (`79b245d6`) — initial retail-style end-of-round overlay (replaces Pixi EndScreen entirely for Spill 1).

## Refactor status

Just rewritten in PR #737 — current shape is stable. Future scope:
- The deprecated COUNTDOWN/LOADING-phase types should be removed from the union once `Game1Controller.endOfRoundFlow.test.ts` is updated to drop legacy assertions.
- The `onCountdownNearStart` callback is also `@deprecated` and should be removed from the `Game1EndOfRoundSummary` interface in a follow-up cleanup.
- Mini-game-result rendering inside the summary table is per-game-type (`formatMiniGameLabel` switch). When auto-claim Spill 1 mini-games migrate to M6, the label format may need to change to use the M6 result shape.

See `docs/audit/GAME_CLIENT_PIXI_AUDIT_2026-04-28.md` for the rationale behind HTML-not-Pixi overlay choice.
