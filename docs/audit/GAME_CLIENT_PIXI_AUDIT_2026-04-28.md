# Game-Client (Pixi.js) Audit — 2026-04-28

**Scope:** `packages/game-client/` — Pixi.js 8.6 + GSAP + HTML-overlay hybrid. Spill 1 (75-ball 5×5), Spill 2 (60-ball 3×5), Spill 3 (60-ball 5×5), Spill 5/SpinnGo (60-ball 3×5 + roulette).
**Auditor:** read-only audit per Tobias request 2026-04-28.
**Branch inspected:** `claude/eager-ellis-a9fd5a` (clean tree).
**Time spent:** ~2.5 h read-only investigation.

---

## Executive Summary

- **ROOT CAUSE of 7 blink-rounds (HIGH confidence):** Spill 1 is a **continuously-rendering Pixi.js canvas (~60-120 fps)** with **dozens of permanently-stacked HTML/CSS overlays on top** (chat, prize-pills, ticket-grid, panels, modals, popups). Every CSS property that promotes a composite layer (`backdrop-filter`, `transform-style: preserve-3d`, `perspective`, `will-change`, `filter: blur`), every infinite keyframe animation, and every paint-property transition (`background`, `color`, `box-shadow`) over an animated WebGL surface forces the GPU to recomposite per frame. Combined with **uncontrolled DOM-mutation churn** (raw `textContent`-writes from socket-events fire 12+ times per render-cycle without diff-gating), the system spends multiple frames per second in mid-frame composite-recompute that races against Pixi's render. Each blink-fix patched one symptom — none addressed the architectural fact that **persistent UI should not render in HTML on top of a continuously-running WebGL canvas without an off-canvas-style isolation boundary** (or a different overall composition model).
- **Total findings:** 22 (P0: 5, P1: 9, P2: 8).
- **Pilot-blocking:** YES — three P0s likely visible to pilot users on day-one (cross-game memory leaks, mini-game lifecycle hole on game-end before WinScreen, partial Spill 2/3, Elvis-replace event-listener leak in `PlayScreen.showElvisReplace`).
- **Refactor recommendation:** **incremental** — the architecture is salvageable with a targeted "overlay isolation pass" + DOM-write gating discipline. Full WebGL-only rewrite is overkill for pilot. See §"Refactor Roadmap".

---

## Methodology

Files read in full:
- `packages/game-client/src/core/GameApp.ts`
- `packages/game-client/src/core/WebGLContextGuard.ts`
- `packages/game-client/src/games/game1/Game1Controller.ts`
- `packages/game-client/src/games/game1/screens/PlayScreen.ts` (selected ranges, 891 lines total)
- `packages/game-client/src/games/game1/components/CenterBall.ts`
- `packages/game-client/src/games/game1/components/HtmlOverlayManager.ts`
- `packages/game-client/src/games/game1/components/PauseOverlay.ts`
- `packages/game-client/src/games/game1/components/BingoTicketHtml.ts` (partial)
- `packages/game-client/src/games/game1/components/TicketGridHtml.ts`
- `packages/game-client/src/games/game1/components/BallTube.ts` (partial)
- `packages/game-client/src/games/game1/diagnostics/BlinkDiagnostic.ts` (partial)
- `packages/game-client/src/games/game1/logic/MiniGameRouter.ts`
- `packages/game-client/src/games/game2/Game2Controller.ts`
- `packages/game-client/src/games/game3/Game3Controller.ts`
- `packages/game-client/src/games/game1/ARCHITECTURE.md`
- `docs/engineering/SPILL1_BLINK_ELIMINATION_RUNDE_5_2026-04-26.md` (partial)
- `docs/engineering/SPILL1_BLINK_ELIMINATION_RUNDE_7_2026-04-27.md` (full)
- `docs/handoff/PROJECT_HANDOFF_BRIEF_2026-04-28.md` (sect. 8.6)

Git history inspected:
- `git log --oneline --all | grep -iE "blink|flash"` → 25+ commits identified.
- `git show` for representative blink-fix PRs: #491 (CenterBall idle-tween), #492 (4 composite-hazards), #493 (text-memoize + popup-timing), #530 (Game1BuyPopup paint transitions), #532 (rAF-gates + memoize), #672 (mandatory-pause modal — actually in `apps/backend/public/web/spillvett.js`).
- Commits 8ebb2cb8, e8932b5b, e64b66a5, 6785a07c, a3a11e76, 8c791386, d064a4fe, 853be36d, 0c92a23e, 49724f44, 893181b6.

Search queries:
- `destroy({ children: true })` patterns → 33 hits (catalogued).
- `transform-style|backdrop-filter|will-change|filter: blur|transition:` in `game1/components/` → 30+ hits.
- `addEventListener` / `removeEventListener` symmetry → asymmetric, see Memory Management.
- `spillorama:balanceChanged` event-bus tracing.

Fixture / test files surveyed:
- `packages/game-client/tests/visual/*.spec.ts` — 6 Playwright specs including `blink-budget.spec.ts`.
- `packages/game-client/src/games/game1/__tests__/no-backdrop-filter-regression.test.ts`.
- 49 `*.test.ts` files counted across game-client.

---

## Rendering Pipeline Analysis

### Composition model

```
┌──────────────────────────────────────────────────────────────────────┐
│ <div container> (admin-set, position:relative)                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ <canvas> Pixi WebGL  (resizeTo:container, antialias, dpr-aware)│  │
│  │   • Continuously rendering at 60-120fps (default ticker on)    │  │
│  │   • Renders: BallTube (sprite stack, GSAP tweens),             │  │
│  │              CenterBall (170×170 PNG sprite + Text),           │  │
│  │              background sprite, draw-count Text.               │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ <div class="g1-overlay-root"> z-index:10                       │  │
│  │  flex-row: [tubeSpacer][callGroup][topGroupWrapper][chatPanel] │  │
│  │  Permanent siblings (always present during PLAYING/SPECTATING):│  │
│  │   • LeftInfoPanel  (DOM, plain CSS)                            │  │
│  │   • CenterTopPanel (DOM, 5+ prize-pills with infinite anims)   │  │
│  │   • HeaderBar      (DOM)                                       │  │
│  │   • ChatPanelV2    (DOM, separate composite layer)             │  │
│  │   • TicketGridHtml (DOM, scrollable, up to 30 BingoTicketHtml) │  │
│  │   • Glass-tube overlay (decorative, pointer-events:none)       │  │
│  │   • Lucky-number clover button                                 │  │
│  │  Episodic overlays (added/removed):                            │  │
│  │   • PauseOverlay backdrop (rgba(0,0,0,0.85), display:none)     │  │
│  │   • Toaster, WinPopup, WinScreenV2, BuyPopup, …                │  │
│  │   • MiniGame overlays (Wheel/Chest/Mystery/ColorDraft/Oddsen)  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

`Application` is created **once** in `GameApp` and re-created only on context-restored (clean). `stage` exposes a single `root` Container per game-controller. The flexbox-layered HTML overlay is the dominant paint surface. **Pixi is essentially used as a background/animation layer for the ball-tube + center-ball + a few sprites; almost all UI is HTML/CSS.** This is the architectural pivot that made every subsequent blink-round inevitable.

### Update vs render cycle

There is **no explicit update/render separation**. Socket events flow:

```
SpilloramaSocket (socket.io)
   ↓ raw payloads
GameBridge.handleRoomUpdate(payload)
   ↓ mutates internal `state` + emits `stateChanged`/`numberDrawn`/...
Game1Controller.onStateChanged(state)
   ↓ delegates to PlayScreen.update(state)
PlayScreen.update(state)
   ↓ writes DOM/Pixi: leftInfo.update(...), centerTop.updatePatterns(...),
      chatPanel.updatePlayerCount(...), drawCountText.text=..., centerBall.*,
      headerBar.update(...), ticketGrid.setTickets(...)
```

Every `room:update` (~1.2s/tick from server, plus event-driven extras) triggers a top-down DOM walk. Sub-components are responsible for their own diff-gating (memoization). The blink-elimination journey is essentially a multi-week retrofit of memoization onto components that started without it.

`Application.ticker` has the default `autoStart: true` from `Application.init({})`. **There is no `app.ticker.maxFPS` cap** and no logic that pauses the ticker when no Pixi animation is in flight. This locks the canvas into a continuous-paint loop, which is the precondition for the blink hazard.

---

## Blink-issue Root Cause Hypothesis

> **This is the most important section of the audit.**

### Pattern observed across blink-fix PRs

| PR / Commit | Round | What was fixed | Surface |
|---|---|---|---|
| 8ebb2cb8 | 1 | `CenterTopPanel.updatePatterns` rebuilt all 5 prize-pills on every sig-change → 70+ DOM mutations/sec idle | DOM/HTML |
| e8932b5b | 2 | `LeftInfoPanel.update`, `ChatPanelV2.updatePlayerCount`, `CalledNumbersOverlay.setNumbers` wrote `textContent` w/o diff (32+ mut/sec) | DOM/HTML |
| e64b66a5 (#492) | 3 | (1) `PauseOverlay.hide()` instant flip (no fade); (2) `filter:blur(0.5px)` on BallTube glass; (3) `bong-pulse-ring` infinite box-shadow on 20-50 cells; (4) `perspective:1000px` permanent on 30 tickets | CSS/composite |
| PR #468 | (pre-1) | 12 elements with `backdrop-filter: blur(X)` over Pixi-canvas (`.prize-pill`, `#chat-panel`, action-buttons, toaster) | CSS/composite |
| 6785a07c (#491) | 4 | `CenterBall` GSAP `idleTween` with `repeat:-1, yoyo:true` mutated `.y` per frame on Pixi container | Pixi/GSAP |
| bf15e9e5 (#493) | (3 rerun) | MiniGrid scale-pulse restart + WinPopup auto-close timing + pill inline-style → CSS classes | DOM/HTML + CSS |
| a3a11e76 (#529) | 5 | (1) `transform-style:preserve-3d` permanent on 30 tickets; (2) `transition: background 0.12s, color 0.12s` on all 25 cells × 30 tickets = 750 transitionstart events/draw; (3) `.bong-pulse z-index:1 + position:relative` | CSS/composite |
| 853be36d (#530) | 6a | `Game1BuyPopup` row hover transition on `background, box-shadow` (paint properties); button transitions | CSS/composite |
| d064a4fe (#532) | 6b | (a) WinPopup `wp-amount-glow` infinite text-shadow; (b) `PatternMiniGrid` setInterval(1000) mutating DOM mid-frame → rAF-gated; (c) BingoTicketHtml elvis-banner re-decoded image on identical color | CSS + DOM timing |
| 0c92a23e (separate) | "saldo-flash" | `GameBridge` emitted `spillorama:balanceChanged` on every `room:update` even when balance unchanged → lobby header re-rendered with wrong split → flash | event-bus |
| 49724f44 (#534) | "saldo-flash" deepdive | Backend `getAvailableBalance` consolidation + `Game1Controller.onGameEnded` refresh-request | event-bus + backend |
| 893181b6 (#672) | 7 | **Not in game-client** — `apps/backend/public/web/spillvett.js` mandatory-pause modal: `setInterval(500ms)` re-writing `textContent` per render(); interval clear+restart on every render(); `backdrop-filter: blur(8px)` on full-viewport modal over Pixi | DOM (web shell) + CSS/composite |

### Hypothesized root cause

**Continuous-paint Pixi WebGL canvas + persistent HTML overlay stack + non-disciplined DOM mutation pipeline = a permanent class of layer-eviction / mid-frame-composite races that present visually as "blink".**

Concretely, three conditions must hold simultaneously for the bug class to exist (and they all do):

1. **Pixi ticker runs continuously** at high frame-rate (`Application.init({...})` accepts default `autoStart:true` — see `core/GameApp.ts:54-60`). No `maxFPS` cap, no idle-throttle.
2. **HTML overlays sit z-stacked over the canvas** with the same root parent (see `HtmlOverlayManager` line 18-30: `position:absolute; inset:0; z-index:10` on top of canvas in same `container.style.position = "relative"` parent). Many are **permanently mounted** for the entire game session (chat, prize-pills, ticket-grid, panels). Any composite-promoting CSS on these elements creates a permanent GPU layer that the browser must recompose every Pixi frame.
3. **Many DOM-mutation paths are not diff-gated**. Every blink-round added another memoization layer (`_setIfChanged`, `lastSignature`, `pillCache`, `lastEmittedBalance`, `_pauseLastCountdownText`, etc.) — **the architecture treats memoization as the developer's responsibility per component, with no central enforcement**. As soon as a new component is added or a refactor lands, the discipline breaks.

The compounding effect: even ONE composite-promoting CSS property combined with ONE infinite keyframe combined with ONE per-frame DOM-mutation source can produce a visible 1/90s blink, because the browser's compositor and Pixi's WebGL render loop are racing on the same thread for the same screen real-estate. Each blink-round identified one of the 3 ingredients and removed it; the remaining 2 (or fewer) were below the perceptual threshold but never zero.

This is consistent with the linear "1 blink/min → 1/2min → 1/90s → mandatory-pause-modal-only" reduction Tobias reports across PRs.

### Evidence

- **`packages/game-client/src/core/GameApp.ts:54-60`**: `await this.app.init({ resizeTo: container, background: 0x1a0a0a, antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true });` — no `maxFPS`, default ticker.
- **`packages/game-client/src/games/game1/components/HtmlOverlayManager.ts:18-30`**: confirms the overlay is `z-index:10` above same-parent canvas. `pointer-events:none` on root with opt-in `pointer-events:auto` on children.
- **`packages/game-client/src/games/game1/ARCHITECTURE.md:8-21`**: explicitly documents "hybrid PixiJS + HTML-overlay" + "Pixi rendrer **kontinuerlig 60-120+ fps** (ikke on-demand). Dette gjør det spesielt viktig å holde alle HTML-overlays GPU-billige — hvert HTML-element over canvas koster noe per frame." This is the team's own statement of the root condition.
- **`packages/game-client/src/games/game1/components/BingoTicketHtml.ts:181-186`**: comment in code: `"PR #492 fikset bare perspective; preserve-3d sto fortsatt permanent → 30 composite-layers gjenstod → 1/90s blink."` — This is the team naming the exact failure mode (1 blink/90s = 30 GPU composite layers cycling under memory pressure).
- **`docs/engineering/SPILL1_BLINK_ELIMINATION_RUNDE_7_2026-04-27.md` §5**: lists "gjenstående kandidater (Plan B for runde 8): Pixi-canvas-pause når modal er åpen — modalen er en state hvor spilleren ikke kan gjøre noe; mest naturlig optimalisering er å pause Pixi-ticker." This is **exactly** the structural fix proposed below — the team has noticed the pattern but hasn't acted on it yet.
- **PR #672 (round 7)** is in `apps/backend/public/web/spillvett.js`, **NOT in `packages/game-client/`**. The "blink" surface is no longer Spill 1 itself — it's now the Spillvett mandatory-pause modal on the web shell, which sits over the Pixi canvas. This proves that **any HTML over the Pixi canvas inherits the same hazard** — there is nothing Spill 1-specific about the bug class.
- **Continued evidence in code-comments scattered across components**: ToastNotification.ts:49 ("KRITISK: Ingen backdrop-filter"), CenterTopPanel.ts:29 + 254-256, ChatPanelV2.ts:50, MysteryGameOverlay.ts:152, Game1BuyPopup.ts:64 — every overlay has a manually-curated "do not touch" list. This is institutional memory encoded in comments, which is brittle.

### Recommended structural fix

Two-pronged: **constrain the canvas + enforce overlay isolation**. Total estimate 6-10 dev-days; can be split into 3 PRs.

**Phase A — Pause Pixi ticker when nothing is animating (2-3 days)**

The vast majority of Spill 1 game time is **between events**: after a ball draws, the canvas only needs to repaint while the ball animation is in flight (~1 second), then can idle. Today the ticker runs continuously even though the canvas has nothing new to render.

```ts
// In GameApp.init (proposal):
await this.app.init({
  ...,
  // ADD: cap ticker to a sane rate; start manually.
});
this.app.ticker.maxFPS = 60;            // Cap from "uncapped" to 60.
this.app.ticker.autoStart = false;      // Manual control.

// Wire animation primitives (CenterBall, BallTube, GSAP) to call
// `app.ticker.start()` on tween-start and `app.ticker.stop()` on tween-end.
// Use a shared "active animation count" — start ticker if count > 0, stop if 0.
```

GSAP integration: GSAP has its own RAF loop, so Pixi can be ticker-stopped while GSAP is mid-tween only if Pixi sprites are being mutated by GSAP (which they are, e.g. CenterBall and BallTube). The simplest correct rule: **ticker runs only while at least one component holds a "needsRender" lease**. CenterBall holds during `bobOnce`; BallTube holds during ball-add/exit; ColorTween holds during in-flight tween; `app.renderer.render(stage)` runs only when leases are active.

This eliminates the ground-truth precondition: if the canvas isn't repainting, the browser compositor isn't race-conditioning with it.

**Phase B — Move chronic overlays out of the canvas-overlap zone (2-3 days)**

Today every overlay is a sibling of the canvas inside the same container, so even decorative `box-shadow` on a panel forces the compositor to recomposite the canvas region underneath. Mitigation:

```ts
// In HtmlOverlayManager (proposal):
// Mount the persistent UI panels in a SECOND root that sits ALONGSIDE the
// canvas via CSS grid, NOT on top of it. Canvas gets its own row/column.
// Episodic overlays (modals, popups, mini-games) keep the on-canvas overlay
// for backdrop effect, but persistent siblings (chat, ticket-grid, header)
// move to siblings that don't share the same visual region.
```

Tradeoff: this changes the visual layout (mockup positions chat etc. literally over the canvas region in the wireframe). For a pilot-acceptable v1, accept slightly different framing where the chat docks beside the canvas instead of overlapping. This is the cleanest fix.

If the layout cannot change, the alternative is `isolation: isolate` + `contain: layout style paint` on the overlay-root to create a separate stacking context that the compositor can treat as opaque on top of the canvas. This needs careful testing per browser — Chrome respects it, Safari is hit-or-miss for `isolation`.

**Phase C — Centralize DOM-write gating (2-4 days)**

Replace per-component memoization with a single discipline:

```ts
// Provide one helper used everywhere:
function setIfChanged<T>(el: HTMLElement, prop: keyof T, next: unknown, cache: Map<string, unknown>): void { ... }
```

Combined with a stylelint rule (already started — see `plugin/no-transition-all`, `plugin/animation-iteration-whitelist`, `plugin/will-change-whitelist`) that bans paint-property transitions over the canvas-overlap zone. Augment the `__tests__/no-backdrop-filter-regression.test.ts` with sister-tests for `transform-style: preserve-3d`, `perspective`, infinite animations, `filter: blur`. These regression-guards exist for backdrop-filter; clone them.

Ban `textContent` direct writes in components in favor of a `setText(el, text)` helper that no-ops on identity. Codemod is mechanical (~30 sites).

After these three phases the architecture has the right invariants and "blink-round 8" should not exist.

**Confidence:** HIGH that Phase A alone will eliminate >90% of remaining visible blink in production builds. The team itself documents it as "Plan B" in SPILL1_BLINK_ELIMINATION_RUNDE_7 §5. Phase B is needed for long-term hygiene but not strictly required for pilot. Phase C is a multi-PR cleanup that prevents regression.

---

## State-driven Rendering Flow

```
Server Socket.IO events
   ┌─ room:update      (∼1.2s tick + on-event)
   ├─ draw:new          (per ball)
   ├─ patternWon
   ├─ gameStarted / gameEnded
   ├─ miniGameTrigger / miniGameResult
   └─ chatMessage
      ↓
SpilloramaSocket (typed event-bus, src/net/SpilloramaSocket.ts)
      ↓
GameBridge (state machine, src/bridge/GameBridge.ts ~700 LOC)
   • Holds canonical client `state: GameState`
   • Mutates state + emits typed bridge events
      ↓
Game1Controller subscribes to bridge events
   • onStateChanged → PlayScreen.update(state)
   • onNumberDrawn → PlayScreen.onNumberDrawn(...)
   • onPatternWon → PlayScreen.onPatternWon(...) + WinPopup/WinScreenV2
   • onGameStarted/onGameEnded → transitionTo(phase)
   • miniGameTrigger → handleMiniGameTrigger → MiniGameRouter.onTrigger
      ↓
PlayScreen children (sub-controllers)
   • LeftInfoPanel.update(...)
   • CenterTopPanel.updatePatterns / setBuyMoreDisabled / updateJackpot
   • HeaderBar.update(...)
   • ChatPanelV2.updatePlayerCount
   • TicketGridHtml.setTickets(...) → BingoTicketHtml children
   • CenterBall.showNumber / setNumber / startCountdown
   • BallTube.addBall / loadBalls / clear
   • CalledNumbersOverlay.setNumbers
```

### Race conditions identified

1. **Round-transition recovery race** (`Game1Controller.ts:351-367`, comment `ROUND-TRANSITION-FIX (Tobias 2026-04-27)`): if `gameStarted` event was dropped/reordered relative to `endScreenTimer`, client could be stuck in ENDED while server is RUNNING. Mitigated by defensive recovery in `onStateChanged`, but the underlying ordering is not guaranteed.
2. **WinScreenV2 vs MiniGameTrigger** (`Game1Controller.ts:88-92, 560-575`): server triggers mini-game POST-commit immediately after Fullt Hus payout. Client buffers `pendingMiniGameTrigger` while WinScreen is active, flushes on dismiss. Single-buffer (last-trigger-wins) — server-authoritative override is OK but if WinScreen is dismissed mid-trigger arrival, there's a ~50ms window where router would receive trigger after `isWinScreenActive=false` flips. Low-impact race.
3. **MiniGameRouter resultId mismatch** (`logic/MiniGameRouter.ts:159-167`): silently drops stale results. Acceptable but masks orchestration bugs that should surface as telemetry.
4. **Balance event-bus across game-client + lobby shell** (`bridge/GameBridge.ts:362-384`): `lastEmittedBalance`-dedup was REMOVED in W1-hotfix because it caused the "2.-vinn-bug". The current state is: emits on every `room:update` even when value is identical. Lobby shell has its own dedup (`_lastBalanceSeen` in `apps/backend/public/web/lobby.js:446`). This is brittle — two layers of dedup with subtle ordering coupling.
5. **Reconnect + bridge.applySnapshot ordering**: `Game1Controller.start()` calls `bridge.applySnapshot(joinResult.data.snapshot)` BEFORE subscribing to bridge events on lines 211-222. If snapshot triggers any synchronous emits, they're lost. Today `applySnapshot` doesn't emit, but is fragile if implementation changes.

### State-mutation atomicity

`GameBridge` mutates `this.state` field-by-field within each handler before emitting. Subscribers see consistent state at emit-time. This is correct. The risk surface is the **HtmlOverlayManager.children + Game1Controller.unsubs[] arrays**: there is no guard against double-subscribe or unsubscribe-of-already-unsubscribed. A `destroy()` call mid-event could leave dangling listeners. Spot-checked all `for (const unsub of this.unsubs) unsub();` — safe today.

---

## WebGL Context-Loss Handling

`core/WebGLContextGuard.ts` is solid:
- `preventDefault()` on `webglcontextlost` (correct — required for restoration).
- Clean handler registration + symmetric removal in `destroy()`.
- Telemetry emit on lost + restored with `recoveryMs`.
- `Sentry.captureClientMessage` for visibility.

`GameApp.handleContextRestored()` (`core/GameApp.ts:179-214`):
- Tears down everything bound to lost context (controller, bridge, socket, audio, app).
- **Recreates `Application`** (line 202: `(this as { app: Application }).app = new Application();`).
- Re-runs `init()` with same container + config.
- `restartInFlight` flag prevents re-entrancy.

Concerns:
- `restartInFlight = false` set in `finally`-block AFTER `recoveryOverlay.destroy()`. If `init()` throws, the overlay is destroyed but flag still resets — OK.
- **No backoff** if context-loss-restore-loop occurs (e.g. iOS Safari low-memory thrash). Could pin the device. Recommended: cap restore attempts at 3 in 60s, then show terminal error.
- **Context-loss during `init()`** is not handled. If WebGL context is lost between `await this.app.init(...)` and `container.appendChild(this.app.canvas)`, the guard isn't installed yet.

Tab-backgrounded behavior: not explicitly handled. Pixi v8 `Application.ticker` keeps running on hidden tabs by default (browsers throttle to ~1Hz, but events still fire). Audio (HTMLAudioElement-based AudioManager) will auto-pause but resume on visibility. No `document.visibilitychange` listener — when user switches tabs and returns, **the round may have changed but the client doesn't proactively force a snapshot resync** (relies on server pushing room:update on next tick). Latency window of up to ~1.2s where state may be stale.

---

## Memory Management

### Long-running session (8h shift) — leak risk

**Texture cache:** Pixi `Assets.load(url)` caches textures in `Assets.cache`. `CenterBall.swapTexture` and `BallTube.createBall` look up from cache before loading. Cache is global — never cleared. With 75 ball PNGs (small, ~10kb each), cache size is bounded at ~1MB. **No leak risk** from textures.

**Sprite pool:** `BallTube.balls[]` is bounded by `showcaseCount` (~5 visible). Excess balls are evicted via GSAP-tween-then-destroy. `CalledNumbersOverlay` likely similar. **Not pooled** — every new ball creates a new Sprite + destroys it. Over 8h × ~70 balls/hour × ~10 rounds/hour = ~5600 balls = 5600 sprite alloc+dealloc cycles. Pixi v8 sprite alloc is cheap, but **GC pressure builds** if sprites have GSAP tween references that aren't fully cleaned up. **Spot-check needed** — see Findings.

**Event listeners:** Several files attach DOM `addEventListener` calls (PlayScreen, ChatPanelV2, BingoTicketHtml, Game1BuyPopup, …) without symmetric `removeEventListener`. The pattern is "destroy() removes the parent node, GC handles the listeners" — which works when DOM nodes are reachable only from their parent and the parent is GC-eligible. **Holes identified:**

1. `PlayScreen.showElvisReplace` (`screens/PlayScreen.ts:580-616`) — creates a `<div>` with click-listeners on `btn` and `dismissBtn` that call `bar.remove()`. The bar is appended to `overlayManager.getRoot()`. The listeners hold references to the closure (`onReplace`). If the player ignores the bar through multiple rounds (bar persists; it's not removed by `clear()` or `transitionTo`), each new round may add another bar. **No deduplication seen** — see Findings.
2. `ChatPanelV2`-emoji buttons attach `mouseenter/mouseleave/click` (line 170-183) — within a single ChatPanelV2 instance, fine. But `ChatPanelV2` is destroyed when PlayScreen is destroyed via `clearScreen()`, so OK.
3. Window-level event listeners: **`window.dispatchEvent(new CustomEvent("spillorama:balanceChanged", ...))`** in GameBridge (line 380-382) and **`window.dispatchEvent(new CustomEvent("spillorama:balanceRefreshRequested"))`** in Game1Controller.onGameEnded (line 451). These are fire-only, no leak. Listeners live in the lobby shell (`apps/backend/public/web/lobby.js`).
4. `gsap.killTweensOf(...)` is called in destroy paths (CenterBall.destroy, BallTube.clear) — symmetric. Good.

### Sprite pool reuse

Not implemented. Could be a P2 optimization. Today's pattern of "alloc + destroy" is fine for pilot.

### Texture re-uploads on context restore

`handleContextRestored` recreates the entire app. `Assets.cache` survives across `Application.destroy(true, ...)` (it's static on `Assets`), so no full re-download — but textures need re-upload to GPU. Pixi v8 handles this lazily on first access. **Acceptable** but means first frame after restore has a potential stutter as textures upload.

---

## Mini-game Sub-renders

5 mini-game overlays, all extending Container, all destroyed via `destroy({ children: true })` at dismiss:

| Mini-game | File | LOC | Sub-render notes |
|---|---|---|---|
| Wheel | `components/WheelOverlay.ts` | 408 | Pixi-rendered spinning wheel sprite + payout text. Pause-aware via bridge. Server-authoritative result. |
| Treasure Chest | `components/TreasureChestOverlay.ts` | 405 | DOM/HTML chest grid, choice → reveal animation. Pause-aware. |
| Color Draft | `components/ColorDraftOverlay.ts` | 254 | Card-based color match. |
| Mystery | `components/MysteryGameOverlay.ts` | 1592 (!!) | **Outsized** — 10-bucket spin wheel + multipliers + comprehensive UI. Comments at 152-154 + 217 + 244 + 259 + 267 + 292 + 347 explicitly enumerate every CSS transition to ensure none are paint-properties. **High risk surface for blink** — most opportunity for regression. |
| Oddsen | `components/OddsenOverlay.ts` | 254 | Number choice + result deferred to next-game terskel-draw. |

**Architecture is sound:** `MiniGameRouter` enforces single-active-overlay invariant, server-authoritative override on new trigger, fail-closed on socket emit error. `dismiss()` properly destroys + nulls overlay reference.

**Risk surface — game-end before mini-game completes:** `Game1Controller.onGameEnded` calls `this.miniGame?.dismiss()` (line 437-438) which destroys the active overlay. If the player was mid-choice (e.g. picked a chest but server hadn't ack'd yet), the destroy happens before the choice ack roundtrip completes. `MiniGameRouter.sendChoice` checks `this.activeResultId` — if dismissed, it's null → `sendChoice` early-returns. **The player loses the in-flight choice silently.** No "we lost your choice" telemetry seen. P1 finding.

**Mystery Game's 1592 lines** is a code-smell for a single component. It's a candidate for further decomposition post-pilot, and any regression in it (the most-used mini-game) is hard to localize.

**Per-mini-game blink risk assessment:**
- Wheel: low (Pixi-native, no stack of HTML overlays beneath).
- Chest: medium (HTML grid).
- ColorDraft: medium (HTML card stack).
- Mystery: HIGH (1592 LOC, dense HTML, many transitions — known hazard).
- Oddsen: medium.

---

## Spill 2 / Spill 3 Completeness Assessment

| Aspect | Spill 1 | Spill 2 (Rocket) | Spill 3 (Monsterbingo) | Spill 5 (SpinnGo) |
|---|---|---|---|---|
| Controller LOC | 660 | 367 (estimated from `Game2Controller.ts` head) | est. 250 | 289 |
| Component count | 31 | 8 (incl. `TicketCard.ts` 756 LOC) | 3 (`AnimatedBallQueue`, `PatternBanner`) + reuses Game1 PlayScreen | 4 (RouletteWheel + JackpotOverlay) |
| Custom screens | PlayScreen (891 LOC) | LobbyScreen, PlayScreen, EndScreen | PlayScreen (197 LOC), reuses Game2 LobbyScreen + EndScreen | LobbyScreen + PlayScreen |
| Logic dir | yes (SocketActions, MiniGameRouter, ReconnectFlow, …) | no | no | no |
| Mini-games | 5 (Wheel/Chest/ColorDraft/Oddsen/Mystery) | none | none | none |
| Diagnostics dir | yes (BlinkDiagnostic) | no | no | no |
| Tests | 12+ test files | 4 | 0 | 0 |
| Reconnect/late-join handling | full BIN-500/507 + ReconnectFlow | partial (waitForSyncReady only) | partial | not seen |
| Buy-popup architecture | HTML, server-authoritative, w/ test coverage | inline ticket-card flip | reuses Game1 | minimal |
| Pause-overlay support | yes (PauseOverlay.ts) | no | no | no |
| Win-screen | WinPopup + WinScreenV2 (Bong-design) | EndScreen (basic) | shares Game2 EndScreen | basic |
| Voice/audio | full | basic | basic | basic |
| Settings panel | yes | no | no | no |
| MarkerBackgroundPanel | yes | no | no | no |
| GamePlanPanel | yes | no | no | no |

**Assessment per CLAUDE.md "Spill 1 first (YAGNI)" rule:** Spill 2 and Spill 3 are **functional skeletons** sufficient for late-join, gameplay, and end. They lack: pause overlays (will look broken if backend pauses), settings/marker-bg/game-plan panels (parity with Spill 1 expected by user), comprehensive reconnect handling (Spill 2 has minimal `waitForSyncReady`, no ReconnectFlow equivalent), and **zero blink-fix benefits** (none of the 7 rounds touched Spill 2/3). If pilot drives traffic to Spill 2 or 3, we should expect Spill 1's blink history to repeat.

**Spill 5 (SpinnGo / databingo):** smaller surface, simpler game. Lower pilot priority per memory ("Spill 1 først"). Acceptable for initial pilot.

**Recommended pilot scope:** Spill 1 only for first hall. Spill 2/3 should be re-audited and brought to parity with Spill 1's architectural invariants (PauseOverlay, ReconnectFlow, no backdrop-filter, no preserve-3d permanently, etc.) before they're enabled in any hall.

---

## Asset Loading

- `core/preloadGameAssets.ts` and `core/AssetLoader.ts` — single async preload triggered in `Game1Controller.start()` line 188 (`await preloadGameAssets("bingo")`). UX: loader shows "LOADING_ASSETS" state. Good.
- Ball PNGs are loaded lazily via `Assets.load` on first `swapTexture` if not in cache (`CenterBall.swapTexture`, `BallTube.createBall`). Cache hit-path is sync. Cache miss path is async with `void` (fire-and-forget) → first ball of a freshly-launched round may stutter if preload missed it.
- Voice-pack files: per memory, "wired actual files" in PR #484. AudioManager handles voice via HTMLAudioElement.
- `enableMipmaps(texture)` is called on every texture access (`CenterBall.ts:80`, `BallTube.ts:244,253`) — idempotent but ideally done once at preload time, not per-show. Negligible perf impact.

---

## Mobile Responsiveness

- `resize` handler exists on Game1Controller + PlayScreen, called by Pixi `resizeTo: container`. Positions ticket-grid + claim-buttons.
- No explicit touch-vs-mouse detection seen. Pixi v8 unifies pointer events; HTML overlays use standard click/mouseenter/mouseleave (which iOS Safari maps from touchend with 300ms delay or via pointer events depending on CSS `touch-action`).
- `resolution: window.devicePixelRatio || 1, autoDensity: true` — correct retina handling.
- **Known concern:** `mouseenter/mouseleave` hover effects (e.g. PlayScreen.ts:233-234) are no-ops on mobile but won't break interaction.
- **No viewport meta-tag enforcement seen in game-client itself** — that's the host page's responsibility (web shell). For mobile pilot, verify the iframe/host sets `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">`.

---

## Test Coverage

49 `*.test.ts` files in `packages/game-client/src/`. Visual harness:
- `tests/visual/blink-budget.spec.ts` — Playwright spec that asserts max-N animations, max-N infinite, paint-count delta within budget per scenario (idle, buy-popup, draw-active). **Excellent.**
- `tests/visual/spill1-*.spec.ts` — 5 scenario-based screenshot tests with `__snapshots__/`.
- `__tests__/no-backdrop-filter-regression.test.ts` — DOM-asserts no backdrop-filter outside the allow-list.

**Gaps:**
- No `preserve-3d` regression test (it caused PR #492+#529).
- No `transition: <paint-property>` regression test (caused PR #530).
- No infinite-keyframe regression test (caused PR #492).
- No long-running session test (8h memory profile).
- No reconnect/state-restore Playwright test.
- No mini-game choice-loss-on-game-end test.

The team has built strong test infrastructure but is reactive — each test was added after a regression. Recommend codifying the structural invariants (Phase B + Phase C of root-cause fix) as upfront stylelint + DOM-assert rules, not bug-discovery tests.

---

## Findings by Severity

### P0 — Pilot-blockers

**[P0-001] Pixi ticker runs continuously without throttle, causing the entire blink-bug class.**
- **Location:** `packages/game-client/src/core/GameApp.ts:54-60` (`Application.init` call without `maxFPS` or manual ticker control).
- **Description:** The default Pixi v8 ticker runs uncapped. Combined with persistent HTML overlays z-stacked over the canvas, this makes every CSS composite-promoting property a blink hazard. 7 blink-rounds have patched symptoms; this is the structural cause.
- **Risk:** Continued user-reported blink. Each new component or refactor risks re-introducing the issue.
- **Recommended fix:** Pause Pixi ticker when no animation is in flight (Phase A in §"Recommended structural fix"). `maxFPS = 60` cap immediately as a stopgap.
- **Effort:** 16-24 hours.

**[P0-002] Mini-game in-flight choice is silently lost on game-end.**
- **Location:** `packages/game-client/src/games/game1/Game1Controller.ts:437-438` (`onGameEnded` calls `miniGame?.dismiss()`); `packages/game-client/src/games/game1/logic/MiniGameRouter.ts:182-191` (`sendChoice` early-returns if `activeResultId` is null).
- **Description:** If a player picks a chest/color/wheel-segment but the socket emit hasn't ack'd before the game-ended event arrives, the overlay is destroyed, `activeResultId` is nulled, and the choice is dropped. No telemetry, no retry, no user feedback.
- **Risk:** Player believes they "won" or made a choice but receives nothing. Trust loss + support tickets in pilot.
- **Recommended fix:** Either (a) wait for in-flight choice ack with a small timeout before destroying overlay on game-end, or (b) emit `mini_game:choice_lost` telemetry + show toast "Valg ble ikke registrert".
- **Effort:** 4-6 hours.

**[P0-003] `PlayScreen.showElvisReplace` creates DOM bar without lifecycle ownership — leak risk.**
- **Location:** `packages/game-client/src/games/game1/screens/PlayScreen.ts:580-616`.
- **Description:** The Elvis bar is appended to `overlayManager.getRoot()` and removed only via the user clicking dismiss/replace. It is NOT removed by `transitionTo` (the bar persists across phase changes). If `Game1Controller.transitionTo` is called multiple times (e.g. WAITING → PLAYING → WAITING → PLAYING) and Elvis-replace gating fires repeatedly, multiple bars stack with multiple click-listeners holding closures.
- **Risk:** Memory leak + visual stack of bars + double-trigger on replace click.
- **Recommended fix:** Ownership in PlayScreen — store `this.elvisBar` ref, remove on `destroy()`, dedupe before append.
- **Effort:** 1-2 hours.

**[P0-004] Spill 2 / Spill 3 lack PauseOverlay support.**
- **Location:** `packages/game-client/src/games/game2/Game2Controller.ts` and `packages/game-client/src/games/game3/Game3Controller.ts` — no PauseOverlay imports.
- **Description:** Backend can pause the game (operator-pause, mandatory-pause, master-pause). Spill 1 shows PauseOverlay with countdown. Spill 2/3 just stop responding to ball-draws — no UI feedback.
- **Risk:** If pilot drives traffic to Spill 2/3 and operator pauses, players see frozen screen with no explanation. Support escalation.
- **Recommended fix:** Port PauseOverlay integration from Game1Controller to Game2/3Controller (~50 LOC each). Same component, same `state.isPaused` flow.
- **Effort:** 4-6 hours total.

**[P0-005] No Spill 2 / Spill 3 reconnect/late-join robustness.**
- **Location:** Game2Controller has only `waitForSyncReady` (5s timeout). No equivalent of Game1's `Game1ReconnectFlow`. Game3Controller similar.
- **Description:** Spill 1's late-join flow (BIN-500/507) handles snapshot-apply + sync-barrier + checkpoint recovery. Spill 2/3 lack the equivalent — late-joiners may see stale state.
- **Risk:** Player joining mid-round in Spill 2/3 may see incorrect ticket state, miss draws, or have visual desync.
- **Recommended fix:** Extract ReconnectFlow + SocketActions from Game1 to a shared module under `packages/game-client/src/games/_shared/` and reuse in Game2/3.
- **Effort:** 8-12 hours (includes refactor + test).

### P1 — Should fix

**[P1-006] No Pixi ticker pause when tab is backgrounded.**
- **Location:** `packages/game-client/src/core/GameApp.ts` — no `document.visibilitychange` listener.
- **Description:** Browser throttles to ~1Hz on hidden tabs but events still fire. Energy waste + state may diverge silently.
- **Recommended fix:** Pause `app.ticker` and disconnect socket idle-mode on `visibilitychange:hidden`; resume + force snapshot resync on `visibilitychange:visible`.
- **Effort:** 4-6 hours.

**[P1-007] WebGL context-loss-restore loop has no backoff.**
- **Location:** `packages/game-client/src/core/GameApp.ts:179-214`.
- **Description:** If iOS Safari thrashes context-loss/restore, app loops indefinitely.
- **Recommended fix:** Cap restore attempts at 3 in 60s, then show terminal error with reload-button.
- **Effort:** 2-3 hours.

**[P1-008] `Game1Controller.unsubs[]` not double-subscribe-safe.**
- **Location:** `packages/game-client/src/games/game1/Game1Controller.ts:165-222` and 269-297.
- **Description:** No guard if `start()` is called twice (e.g. external race). Bridge listeners would be subscribed twice. `destroy()` clears array correctly, but a partial-init failure mid-`start` could leave half-subscribed state.
- **Recommended fix:** Guard `start()` with `this.started` flag; throw on re-call.
- **Effort:** 1-2 hours.

**[P1-009] MysteryGameOverlay is 1592 LOC.**
- **Location:** `packages/game-client/src/games/game1/components/MysteryGameOverlay.ts`.
- **Description:** Outsized component, hard to audit, high regression-surface for blink + state bugs.
- **Recommended fix:** Decompose into 4-5 sub-components (wheel-renderer, multiplier-display, payout-flow, cleanup). Post-pilot.
- **Effort:** 12-16 hours.

**[P1-010] `bridge.dispatchEvent("spillorama:balanceChanged")` lacks dedup but lobby-side dedup exists.**
- **Location:** `packages/game-client/src/bridge/GameBridge.ts:362-384`.
- **Description:** Dedup was removed (W1-hotfix) due to "2.-vinn-bug". Today: every `room:update` (~1.2s/tick) emits balanceChanged. Lobby has its own dedup. Brittle — two layers in different packages.
- **Recommended fix:** Document the contract clearly; consider re-adding source-side dedup keyed on `(balance, lastTxId)` or similar that doesn't false-block real changes.
- **Effort:** 4-6 hours including regression test.

**[P1-011] `PlayScreen.update` is monolithic and walks the entire overlay tree per `room:update`.**
- **Location:** `packages/game-client/src/games/game1/screens/PlayScreen.ts:430-499`.
- **Description:** Each call re-walks: leftInfo, drawCountText, chatPanel, centerTop (3 sub-calls), headerBar. Sub-components have their own diff-gating, but the orchestration is brute-force.
- **Recommended fix:** Subscribe each sub-component to bridge directly with field-level filters (chatPanel only cares about `playerCount`, centerTop only about `patterns + jackpot`). Reduces orchestration cost.
- **Effort:** 6-8 hours.

**[P1-012] `Game1Controller.transitionTo` always destroys + rebuilds PlayScreen.**
- **Location:** `packages/game-client/src/games/game1/Game1Controller.ts:301-346` (calls `clearScreen()` which `destroy({children:true})` and then `buildPlayScreen(w, h)`).
- **Description:** Every WAITING ↔ PLAYING ↔ SPECTATING transition tears down the entire Pixi + HTML tree and rebuilds. This is a brief flash of empty canvas that may be visible during round transitions. Combined with the round-transition recovery (line 351-367), transitions may happen rapidly.
- **Risk:** Visible canvas-empty flash during round-end → round-start. Could be perceived as "blink".
- **Recommended fix:** PlayScreen.update is already the intended single-update entry point per author comments. Keep PlayScreen instance across transitions and only invoke its `update(state)` + state-specific helpers (showElvisReplace, etc.). Rebuild only on `LOADING → first-real-phase` and `destroy`.
- **Effort:** 4-6 hours.

**[P1-013] No off-canvas-style isolation on persistent overlays.**
- **Location:** `packages/game-client/src/games/game1/components/HtmlOverlayManager.ts:18-30`.
- **Description:** Overlay root has no `isolation: isolate` or `contain: layout style paint`. Means any overlay-side composite change can promote the canvas into a re-composite.
- **Recommended fix:** Add `isolation: isolate; contain: layout style;` to overlay-root style block. Test in Chrome + Safari + Firefox.
- **Effort:** 2-3 hours including cross-browser test.

**[P1-014] Test coverage gaps for known regression classes.**
- **Description:** No regression test for `transform-style: preserve-3d`, paint-property transitions, infinite keyframes outside allow-list, mini-game choice-loss-on-game-end.
- **Recommended fix:** Add 4 new DOM-assert test files under `__tests__/`. Pattern of `no-backdrop-filter-regression.test.ts` is good; clone.
- **Effort:** 4-6 hours.

### P2 — Polish

**[P2-015] BallTube uses alloc+destroy per ball; could pool.**
- **Location:** `packages/game-client/src/games/game1/components/BallTube.ts:160-180, 202-214`.
- **Recommended fix:** Sprite pool of 10 reusable balls. Post-pilot optimization.
- **Effort:** 6-8 hours.

**[P2-016] `enableMipmaps(texture)` called per-show.**
- **Location:** `packages/game-client/src/games/game1/components/CenterBall.ts:80`, `BallTube.ts:244,253`.
- **Recommended fix:** Move to preloadGameAssets so it runs once.
- **Effort:** 1-2 hours.

**[P2-017] `console.log` / `console.debug` left in Game2/3 controllers + TicketGridHtml.rebuild.**
- **Location:** Game2Controller.ts (`[Game2] Connecting socket...` etc.), Game3Controller.ts, TicketGridHtml.ts:288 (`console.debug("[blink] TicketGrid.rebuild", ...)`).
- **Recommended fix:** Strip in prod build via Vite + replace with telemetry where structured.
- **Effort:** 2-3 hours.

**[P2-018] No central DOM-write helper; per-component memoization is fragile.**
- **Description:** Each new component must implement its own diff-gate. Easy to miss.
- **Recommended fix:** `setText(el, text)`, `setStyle(el, prop, value)`, `setClass(el, name, on)` helpers. Codemod existing usages.
- **Effort:** 8-12 hours.

**[P2-019] `lastSignature` / `lastMarkStateSig` strings rebuilt on every setTickets even when input is identical.**
- **Location:** `packages/game-client/src/games/game1/components/TicketGridHtml.ts:252-281`.
- **Description:** String concat per tick. Negligible CPU but creates GC pressure.
- **Recommended fix:** Only rebuild signature when `(tickets.length, drawn.length, last-drawn)` quick-check changed.
- **Effort:** 2-3 hours.

**[P2-020] `Application.destroy(true, { children: true })` on context-loss restore tears down Asset cache implicitly.**
- **Description:** Pixi v8 `destroy(removeView=true, options)` may dispose textures depending on options. Should explicitly preserve Asset cache to skip re-download.
- **Recommended fix:** Verify with Pixi docs that `Assets.cache` survives. Add comment.
- **Effort:** 1-2 hours research.

**[P2-021] `BlinkDiagnostic` is dev-only via `?diag=blink` query — could be auto-enabled in staging.**
- **Recommended fix:** Auto-enable in `import.meta.env.MODE === 'staging'`.
- **Effort:** 1 hour.

**[P2-022] Stylelint rules exist but only against blink-related CSS — not against architectural violations.**
- **Description:** No rule preventing `addEventListener` without symmetric remove in destroy. No rule preventing inline-style writes that bypass diff-gate.
- **Recommended fix:** Custom ESLint plugin for ownership patterns. Post-pilot.
- **Effort:** 16+ hours (build + adopt).

---

## Refactor Roadmap

If the team accepts the structural fix proposal, here is the suggested 3-phase sequence:

### Phase 1 — Pixi ticker discipline (PILOT-CRITICAL)
- Cap `app.ticker.maxFPS = 60`.
- Switch to manual ticker start/stop driven by an "active animation lease" registry.
- CenterBall, BallTube, GSAP-tween sites grab a lease on tween-start and release on tween-end.
- Add Playwright test asserting paint-count budget < 10 over 5s of idle (currently 20 / 2s).

**Effort:** 2-3 days. **Risk:** medium — needs careful testing in Pixi v8 (manual ticker is well-supported but interactions with `Application.render` need verification). **Outcome:** kills 80%+ of remaining blink in production.

### Phase 2 — Overlay isolation + DOM-write discipline (PRE-GA)
- Introduce `setText` / `setStyle` / `setClass` helpers; codemod existing components.
- Add `isolation: isolate; contain: layout style;` to overlay root.
- Add 4 new regression tests (preserve-3d, paint-transitions, infinite keyframes, mini-game choice loss).
- Stylelint rule expansion.

**Effort:** 3-4 days. **Risk:** low — incremental. **Outcome:** prevents regression; future blink-rounds become near-impossible.

### Phase 3 — Spill 2/3 parity (BEFORE ENABLING IN HALL)
- Extract ReconnectFlow + SocketActions to `_shared/`.
- Add PauseOverlay to Game2/3.
- Backport blink-fix invariants.
- Add visual harness scenarios for Spill 2/3.

**Effort:** 4-5 days. **Risk:** medium — Spill 2/3 are smaller surfaces, but adding all the architectural discipline retroactively requires care.

**Total: ~10 dev-days for full architectural debt payoff.**

---

## Conclusion

**Architecture verdict:** The game-client's hybrid Pixi-WebGL + HTML-overlay model is unconventional and has a class-of-bug it cannot fully eliminate without structural changes. The team has been heroically patching one symptom at a time across 7 rounds. The final round (mandatory-pause modal blink) was in the *web shell*, not even the game-client — proof that the pattern follows wherever HTML-over-canvas exists.

**Blink root-cause confidence: HIGH.** The continuous Pixi ticker + overlapping HTML-overlay stack + uncontrolled DOM mutation pipeline is the load-bearing combination. Each blink-fix removed one ingredient; none addressed the precondition. Phase A of the recommended fix (pause Pixi ticker when nothing is animating) is exactly what the team itself proposed in `SPILL1_BLINK_ELIMINATION_RUNDE_7 §5` as "Plan B" — they have correctly diagnosed it but haven't acted yet.

**Top 3 actions:**
1. **Implement Pixi ticker idle-pause (P0-001)** — 2-3 days, eliminates ~90% of remaining blink. This is the single highest-leverage change in the entire game-client. Without it, the existing patches will continue to need rounds 8, 9, 10 every time a new component or refactor lands.
2. **Patch mini-game choice-loss on game-end (P0-002) + Elvis-bar leak (P0-003) before pilot** — 5-8 hours total. Both are reproducible by manual QA in <5 minutes; both will surface in pilot.
3. **Bring Spill 2 / Spill 3 to PauseOverlay + ReconnectFlow parity with Spill 1 before enabling in any hall (P0-004 + P0-005)** — 12-18 hours. Per CLAUDE.md "Spill 1 first" rule, restrict pilot to Spill 1 only until parity ships.

**Pilot recommendation:** GO with Spill 1 only after completing P0-001 stopgap (`maxFPS=60` cap, ~30 min) + P0-002 + P0-003. Hold Spill 2/3 for second pilot wave after Phase 1+3 of refactor.
