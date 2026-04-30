# PlayScreen

**File:** `packages/game-client/src/games/game1/screens/PlayScreen.ts` (993 LOC)
**Owner-area:** frontend-runtime
**Last reviewed:** 2026-04-30

## Purpose

Single Pixi `Container` that renders the whole Spill 1 in-game UI: ball tube, called-numbers overlay, center ball, header bar, left info panel, center-top patterns/jackpot panel, chat panel, ticket grid (HTML), claim buttons, and the buy popup. One `update(state)` entry point reflects every state change — no per-phase build/render juggling.

This is the slim rewrite (post-2026-04-23) of the previous spaghetti where four ticket-rendering paths and two buy popups co-existed. Today the screen is a flex-row layout: `[tube] [callGroup: ring + clover] [topGroupWrapper] … [chatPanel]`. Pixi handles ball tube, center ball, and drawn balls; everything UI-ish (ticket grid, buy popup, chat) is HTML for native scroll, CSS layout, and pointer-event sanity.

## Public API

```typescript
type Callbacks = {
  onClaim?:           (type: "LINE" | "BINGO") => void
  onBuy?:             (selections: Array<{ type, qty, name? }>) => void
  onLuckyNumberTap?:  () => void
  onCancelTickets?:   () => void
  onCancelTicket?:    (ticketId: string) => void          // BIN-692 single-ticket × cancel
  onOpenSettings?:    () => void
  onOpenMarkerBg?:    () => void
  onStartGame?:       () => void                          // A6 — host/admin manual start
}

export class PlayScreen extends Container {
  constructor(width: number, height: number, audio: AudioManager, socket: SpilloramaSocket, callbacks: Callbacks)

  // Single state-driven entry point — replaces enterWaitingMode/buildTickets/updateInfo/updateWaitingState/renderPreRoundTickets/updateUpcomingPurchase
  update(state: GameState): void

  // Buy popup lifecycle (owned by Controller, exposed here for orchestration)
  showBuyPopup(state?: GameState): void
  hideBuyPopup(): void
  showBuyPopupResult(ok: boolean, errorMessage?: string): void
  showBuyPopupPartialResult(input: {
    accepted: number; rejected: number;
    rejectionReason: "DAILY_LIMIT" | "MONTHLY_LIMIT" | null;
    lossState?: { dailyUsed, dailyLimit, monthlyUsed, monthlyLimit, walletBalance }
  }): void
  updateBuyPopupLossState(lossState: { dailyUsed, dailyLimit, monthlyUsed, monthlyLimit, walletBalance } | null): void

  // Live-game events from Controller (post-bridge translation)
  onNumberDrawn(number: number, drawIndex: number, state: GameState): void
  onSpectatorNumberDrawn(number: number, state: GameState): void          // BIN-507
  onPatternWon(payload: PatternWonPayload): void

  // Buy-more button toggle (BIN-451)
  disableBuyMore(): void
  enableBuyMore(): void

  // BIN-419 Elvis replace
  showElvisReplace(replaceAmount: number, onReplace: () => void): void

  // Resize on window resize
  resize(width: number, height: number): void

  // Idempotent teardown
  destroy(): void
}
```

## Dependencies

**Calls (downstream):**
- Pixi components: `BallTube`, `CenterBall`, `CalledNumbersOverlay`, `HtmlOverlayManager`.
- HTML overlays: `LeftInfoPanel`, `CenterTopPanel`, `ChatPanelV2`, `HeaderBar`, `Game1BuyPopup`, `TicketGridHtml`.
- `ClaimButton` (`games/game2/components/ClaimButton.ts`) — shared between Game 1 and Game 2.
- `logic/StakeCalculator.ts` `stakeFromState(state)` — derives `totalStake` from active tickets.
- `logic/WinningsCalculator.ts` `calculateMyRoundWinnings(patternResults, myPlayerId)` — sums own `payoutAmount` across all won patterns; matches multi-winner split semantics (winnerIds[] with winnerId fallback).
- `games/game2/logic/ClaimDetector.ts` `checkClaims` — pattern detection used by `updateClaimButtons`.
- `audio/AudioManager.ts` — `playNumber`, `playSfx("mark")`.
- `diagnostics/BlinkDiagnostic.ts` — opt-in diagnostic for the historical blink bug; only installed when `shouldInstallBlinkDiagnostic()` flag is set.
- `gsap` — header-shift tween on chat-toggle.

**Called by (upstream):**
- `games/game1/Game1Controller.ts` — single instance constructed in `buildPlayScreen()` and held in `playScreen`. Controller calls `update(state)` on every `bridge.stateChanged`, `onNumberDrawn` on `bridge.numberDrawn`, `onPatternWon` on `bridge.patternWon`. Buy popup lifecycle invoked from `actions.armTickets` / `bet:rejected` flows.
- `PlayScreen.elvisReplace.test.ts` — covers BIN-419 Elvis-replace overlay lifecycle.

## Invariants

- **Single `update(state)` entry point.** No per-phase methods (`enterWaitingMode`, `updateWaitingState`, etc.) — all UI shape comes from `state.gameStatus`, `state.myTickets.length`, `state.preRoundTickets.length`. Callbacks wired once in the constructor.
- **Round-state isolation (Tobias 2026-04-25).** During RUNNING, ticket grid shows ONLY `state.myTickets` (live, markable, not cancelable). During WAITING/ENDED/NONE, shows `state.preRoundTickets` (queued for next round, cancelable). Pre-round tickets never blend into the active round — pending-arm communicated separately via "Forhåndskjøp"-indikator (`myPendingStake > 0`).
- **Cancel × only on pre-round bonger.** `setTickets({cancelable: !running, …})`. Live brett during RUNNING never have ×; clicking would refund a paid ticket.
- **Auto-show buy popup once per screen-session.** `autoShowBuyPopupDone` flag fires `showBuyPopup` exactly once when entering WAITING/SPECTATING with no live tickets and no pre-round tickets queued. Re-entering after a refresh re-arms the flag (new screen instance).
- **Claim-won state resets at new round.** `lineAlreadyWon`/`bingoAlreadyWon` flags reset on `!running` transitions. Buttons (`lineBtn.reset()`, `bingoBtn.reset()`) clear visual won-state.
- **`drawCountText` is standalone Pixi text.** NOT a child of `CenterBall` because the idle-float tween on the ball would otherwise drag the counter. Updated in `update(state)` from `state.drawCount + "/" + state.totalDrawCapacity`.
- **Center-ball state machine.** RUNNING with `lastDrawnNumber` → `setNumber()`. Else with countdown → `startCountdown()`. Else → `showWaiting()` idle.
- **Premie-pills don't show .completed outside RUNNING (2026-04-26 fix).** `centerTop.updatePatterns(..., running)` passes the running flag so won-but-stale results don't render as struck-out between rounds.
- **`destroy()` is idempotent.** Tears down every overlay + Pixi child + listener; safe to call multiple times during teardown chains.

## Test coverage

- `packages/game-client/src/games/game1/screens/PlayScreen.elvisReplace.test.ts` — BIN-419 Elvis-replace overlay show/hide, replaceAmount displayed.
- Indirect coverage via `Game1Controller.*.test.ts` (7 files) — controller integration tests construct a real `PlayScreen` and verify state-driven rendering.
- `logic/WinningsCalculator.test.ts` — covers the `calculateMyRoundWinnings` helper used here.
- `logic/StakeCalculator.test.ts` — covers `stakeFromState`.

## Operational notes

- **Tickets show wrong colors after loss-limit partial-buy:** the `colorAssignments` cache invalidation in `RoomStateManager.getOrCreateDisplayTickets` (BIN-688) didn't fire — server-side. Check the bet:arm response for fresh `selections` and that `room:update` re-emitted `preRoundTickets`.
- **Buy popup doesn't auto-open at WAITING:** `state.ticketTypes.length === 0` (variant config not yet applied) OR `state.preRoundTickets.length > 0` (player already has bonger queued). Both are valid skip conditions; check the variant config arrival timing.
- **"Forhåndskjøp"-indikator never appears:** server's `room:update` doesn't include `playerPendingStakes` (older backend). Falls back to `myPendingStake = 0`; LeftInfoPanel hides the row.
- **Claim button enables when not expected:** `updateClaimButtons` driven by `checkClaims(myTickets, drawnNumbers)` — if server hasn't pushed the latest mark yet, client may briefly show a claim option that gets rejected on submit.
- **Mid-round flip-bug regression (historical):** the old `TicketGridScroller`'s Pixi mask flipped tickets at the wrong row. The slim rewrite uses native scroll on `TicketGridHtml`; do NOT reintroduce a Pixi-masked scroller.

## Recent significant changes

- PR #725 (`cc7ec64a`) — `showBuyPopupPartialResult` and `updateBuyPopupLossState` for loss-limit partial-buy + delayed-render UX.
- PR #702 (`275fa2be`) — Bølge 2A pilot-blockers (Pixi ticker cap, mini-game lifecycle, Elvis-replace leak fix).
- PR #587 (`d6b8a174`) — Gevinst-display teller faktisk credit ved multi-winner-split (uses `calculateMyRoundWinnings` helper).
- PR #557 (`43c59b8a`) — premie-rader vises alltid klare utenfor aktiv trekning (running-flag passed to `updatePatterns`).
- PR #495 (`263d4764`) — KRITISK round-state-isolation: skille pending vs active tickets, real-time saldo.
- 2026-04-23 — slim rewrite: replaced TicketCard + TicketGroup + TicketGridScroller + TicketOverlay (4 paths) with `TicketGridHtml` (1 path); replaced Game1BuyPopup + UpcomingPurchase (2 popups) with `Game1BuyPopup` only.

## Refactor status

The slim rewrite is the current shape. Future scope:
- Extract `updateClaimButtons` + ticket-mark logic into a `ClaimDetector` adapter shared with Game 2/3 (already partially shared via `games/game2/logic/ClaimDetector.ts`).
- BIN-688 color-assignment plumbing should consolidate cache invalidation between server (`RoomStateManager`) and client (`TicketGridHtml`) — cache logic lives in two places today.

See `docs/audit/GAME_CLIENT_PIXI_AUDIT_2026-04-28.md` for the rationale behind HTML-not-Pixi overlay choice.
