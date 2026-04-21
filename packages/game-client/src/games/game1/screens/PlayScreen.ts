import { Container, Sprite, Assets } from "pixi.js";
import gsap from "gsap";
import type { GameState } from "../../../bridge/GameBridge.js";
import type { PatternWonPayload, ChatMessage } from "@spillorama/shared-types/socket-events";
import type { AudioManager } from "../../../audio/AudioManager.js";
import type { SpilloramaSocket } from "../../../net/SpilloramaSocket.js";
import { BallTube } from "../components/BallTube.js";
import { HeaderBar } from "../components/HeaderBar.js";
import { HtmlOverlayManager } from "../components/HtmlOverlayManager.js";
import { LeftInfoPanel } from "../components/LeftInfoPanel.js";
import { CenterTopPanel } from "../components/CenterTopPanel.js";
import { ChatPanelV2 } from "../components/ChatPanelV2.js";
import { CalledNumbersOverlay } from "../components/CalledNumbersOverlay.js";
import { Game1BuyPopup } from "../components/Game1BuyPopup.js";
import { CenterBall } from "../components/CenterBall.js";
import { ClaimButton } from "../../game2/components/ClaimButton.js";
import { checkClaims } from "../../game2/logic/ClaimDetector.js";
import { stakeFromState } from "../logic/StakeCalculator.js";
import { TicketGridHtml } from "../components/TicketGridHtml.js";

const TUBE_COLUMN_WIDTH = 130;
const CHAT_WIDTH = 265;
const TICKET_TOP = 170;
/** Y offset below the ticket grid for the LINE/BINGO claim buttons. */
const CLAIM_AREA = 60;

type Callbacks = {
  onClaim?: (type: "LINE" | "BINGO") => void;
  onBuy?: (selections: Array<{ type: string; qty: number; name?: string }>) => void;
  onLuckyNumberTap?: () => void;
  onCancelTickets?: () => void;
  /** BIN-692: single-ticket × cancel. Fires with the ticket id. */
  onCancelTicket?: (ticketId: string) => void;
  onOpenSettings?: () => void;
  onOpenMarkerBg?: () => void;
  /** A6: host/admin manual start. */
  onStartGame?: () => void;
};

/**
 * Game 1 play screen — the slim rewrite.
 *
 * Prior iterations mixed four ticket-rendering paths (TicketCard, TicketGroup,
 * TicketGridScroller, TicketOverlay) and two buy popups (Game1BuyPopup +
 * UpcomingPurchase). That spaghetti was the source of the colour-propagation
 * bugs (BIN-688), the mid-row flip-bug (scroller mask), and the post-game
 * crash-loop (destroyed containers in the Pixi render tree).
 *
 * This version:
 *   - Uses {@link TicketGridHtml} — native-scroll HTML grid of
 *     {@link BingoTicketHtml}. CSS flip, CSS layout, no Pixi mask/hitArea.
 *   - Single `update(state)` entry point replaces the enterWaitingMode/
 *     buildTickets/updateInfo/updateWaitingState/renderPreRoundTickets/
 *     updateUpcomingPurchase set.
 *   - Popup lifecycle owned by Controller — PlayScreen just exposes
 *     `showBuyPopup` / `hideBuyPopup` / `showBuyPopupResult`.
 *   - Pixi stays where it earns its keep: ball tube, center ball, drawn
 *     balls. Everything UI-ish is HTML.
 */
export class PlayScreen extends Container {
  private readonly ballTube: BallTube;
  private readonly calledNumbers: CalledNumbersOverlay;
  private readonly overlayManager: HtmlOverlayManager;
  private readonly leftInfo: LeftInfoPanel;
  private readonly centerTop: CenterTopPanel;
  private readonly chatPanel: ChatPanelV2;
  private readonly headerBar: HeaderBar;
  private readonly centerBall: CenterBall;
  private readonly buyPopup: Game1BuyPopup;
  private readonly ticketGrid: TicketGridHtml;
  private readonly lineBtn: ClaimButton;
  private readonly bingoBtn: ClaimButton;
  private readonly audio: AudioManager;

  /** Chat-toggle tween on the jackpot header offset. See setupChatLayoutSync. */
  private headerShiftTween: gsap.core.Tween | null = null;

  private bgSprite: Sprite | null = null;
  private screenW: number;
  private screenH: number;

  private callbacks: Callbacks = {};
  private lastState: GameState | null = null;
  private lineAlreadyWon = false;
  private bingoAlreadyWon = false;
  /**
   * One-shot flag: auto-open the buy popup on the first `update()` where the
   * player lands on the screen without any armed brett and ticketTypes have
   * arrived. Subsequent state changes never re-auto-open — the player either
   * buys (popup auto-hides on success) or closes it manually and must use
   * the "Kjøp flere brett" button to re-open at qty=0. Product decision
   * 2026-04-20.
   */
  private autoShowBuyPopupDone = false;

  constructor(
    screenWidth: number,
    screenHeight: number,
    audio: AudioManager,
    socket: SpilloramaSocket,
    roomCode: string,
    container: HTMLElement,
    pauseAwareBridge?: { getState(): { isPaused: boolean } },
  ) {
    super();
    this.audio = audio;
    this.screenW = screenWidth;
    this.screenH = screenHeight;

    this.loadBackground(screenWidth, screenHeight);

    // ── Pixi components (ball animation + center ball) ────────────────────
    this.ballTube = new BallTube(screenHeight - 16);
    this.ballTube.x = (TUBE_COLUMN_WIDTH - 96) / 2 + 10;
    this.ballTube.y = 8;
    this.addChild(this.ballTube);

    this.centerBall = new CenterBall(pauseAwareBridge);
    this.centerBall.x = TUBE_COLUMN_WIDTH + (screenWidth - TUBE_COLUMN_WIDTH - CHAT_WIDTH) / 2 - 60;
    this.centerBall.y = 20;
    this.addChild(this.centerBall);
    this.centerBall.showWaiting();

    // ── Claim buttons (Pixi — small, self-contained, not worth HTML) ──────
    const ticketAreaLeft = TUBE_COLUMN_WIDTH;
    const ticketAreaWidth = screenWidth - TUBE_COLUMN_WIDTH - CHAT_WIDTH - 20;
    const btnY = screenHeight - 55;
    const btnCentreX = ticketAreaLeft + ticketAreaWidth / 2;

    this.lineBtn = new ClaimButton("LINE", 130, 44);
    this.lineBtn.x = btnCentreX - 140;
    this.lineBtn.y = btnY;
    this.lineBtn.setOnClaim((type) => this.callbacks.onClaim?.(type));
    this.addChild(this.lineBtn);

    this.bingoBtn = new ClaimButton("BINGO", 130, 44);
    this.bingoBtn.x = btnCentreX + 10;
    this.bingoBtn.y = btnY;
    this.bingoBtn.setOnClaim((type) => this.callbacks.onClaim?.(type));
    this.addChild(this.bingoBtn);

    // ── HTML overlay layer ────────────────────────────────────────────────
    this.overlayManager = new HtmlOverlayManager(container);
    const overlayRoot = this.overlayManager.getRoot();
    overlayRoot.style.display = "flex";
    overlayRoot.style.flexDirection = "row";

    // Spacer for ball tube column (PixiJS renders behind the HTML).
    const tubeSpacer = document.createElement("div");
    tubeSpacer.style.cssText = `width:${TUBE_COLUMN_WIDTH}px;flex-shrink:0;pointer-events:none;`;
    overlayRoot.appendChild(tubeSpacer);

    this.leftInfo = new LeftInfoPanel(this.overlayManager, pauseAwareBridge ?? undefined);
    this.calledNumbers = new CalledNumbersOverlay(this.overlayManager);

    // Buy popup — a single entry point. Controller owns show/hide.
    this.buyPopup = new Game1BuyPopup(this.overlayManager);
    this.buyPopup.setOnBuy((selections) => this.callbacks.onBuy?.(selections));

    // HTML ticket grid — replaces TicketGridScroller + TicketGroup + TicketCard.
    this.ticketGrid = new TicketGridHtml({
      onCancelTicket: (id) => this.callbacks.onCancelTicket?.(id),
    });
    this.ticketGrid.mount(overlayRoot);
    this.positionTicketGrid();

    this.centerTop = new CenterTopPanel(this.overlayManager, {
      onShowCalledNumbers: () => this.calledNumbers.toggle(),
      onPreBuy: () => this.openBuyPopup(),
      onBuyMoreTickets: () => this.openBuyPopup(),
      onSelectLuckyNumber: () => this.callbacks.onLuckyNumberTap?.(),
      onCancelTickets: () => this.callbacks.onCancelTickets?.(),
      onOpenSettings: () => this.callbacks.onOpenSettings?.(),
      onOpenMarkerBg: () => this.callbacks.onOpenMarkerBg?.(),
      onStartGame: () => this.callbacks.onStartGame?.(),
    });

    this.chatPanel = new ChatPanelV2(this.overlayManager, socket, roomCode);
    this.headerBar = new HeaderBar(this.overlayManager);

    this.setupChatLayoutSync();
    this.installBlinkDiagnostic(overlayRoot);
  }

  /**
   * TEMP diagnostic (2026-04-21): groups DOM mutations per animation frame
   * and logs which sub-tree + what kind (textContent / innerHTML / attribute)
   * changed. Helps identify residual "blinking" sources after the
   * CenterTopPanel + TicketGridHtml memo fixes. Remove when blinking is
   * fully resolved.
   */
  private installBlinkDiagnostic(overlayRoot: HTMLElement): void {
    const bucket: Record<string, number> = {};
    let rafScheduled = false;
    const flush = () => {
      rafScheduled = false;
      const entries = Object.entries(bucket).filter(([, n]) => n > 0);
      if (entries.length > 0) {
        console.log("[DIAG blink]", entries.map(([k, n]) => `${k}=${n}`).join(", "));
      }
      for (const key of Object.keys(bucket)) bucket[key] = 0;
    };
    const labelFor = (node: Node): string => {
      let el: HTMLElement | null = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
      // Walk up until we find a class/id we recognise (g1-*, ticket-*, etc.).
      while (el) {
        if (el.classList && el.classList.length > 0) {
          const c = Array.from(el.classList).find((x) => x.startsWith("g1-") || x.startsWith("ticket-"));
          if (c) return c;
        }
        if (el.id) return `#${el.id}`;
        el = el.parentElement;
      }
      return "(unknown)";
    };
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        const label = labelFor(m.target);
        const kind = m.type === "childList" ? "childList" : m.type === "characterData" ? "text" : `attr:${m.attributeName}`;
        const key = `${label}[${kind}]`;
        bucket[key] = (bucket[key] ?? 0) + 1;
      }
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(flush);
      }
    });
    obs.observe(overlayRoot, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style", "class", "disabled", "hidden"],
    });
  }

  // ── Callback setters (called once by Controller, not per-transition) ────

  setOnClaim(callback: (type: "LINE" | "BINGO") => void): void { this.callbacks.onClaim = callback; }
  setOnBuy(callback: (selections: Array<{ type: string; qty: number; name?: string }>) => void): void { this.callbacks.onBuy = callback; }
  setOnLuckyNumberTap(callback: () => void): void { this.callbacks.onLuckyNumberTap = callback; }
  setOnCancelTickets(callback: () => void): void { this.callbacks.onCancelTickets = callback; }
  setOnCancelTicket(callback: (ticketId: string) => void): void { this.callbacks.onCancelTicket = callback; }
  setOnOpenSettings(callback: () => void): void { this.callbacks.onOpenSettings = callback; }
  setOnOpenMarkerBg(callback: () => void): void { this.callbacks.onOpenMarkerBg = callback; }
  setOnStartGame(callback: () => void): void { this.callbacks.onStartGame = callback; }

  subscribeChatToBridge(onChat: (listener: (msg: ChatMessage) => void) => () => void): void {
    this.chatPanel.subscribeToBridge(onChat);
  }

  // ── Single state-sync entry point ──────────────────────────────────────

  /**
   * Idempotent render — called once per `stateChanged`. Picks what to show
   * based on `state.gameStatus` + ticket arrays. Safe to call many times per
   * second; `TicketGridHtml` diff-renders internally.
   */
  update(state: GameState): void {
    this.lastState = state;

    // Countdown / center-ball:
    //   - RUNNING → show the last drawn ball, stop countdown
    //   - Else with millisUntilNextStart > 0 → run countdown
    //   - Else → idle "waiting" view
    if (state.gameStatus === "RUNNING") {
      this.leftInfo.stopCountdown();
      this.centerBall.stopCountdown();
      if (state.lastDrawnNumber !== null) this.centerBall.setNumber(state.lastDrawnNumber);
    } else if (state.millisUntilNextStart !== null && state.millisUntilNextStart > 0) {
      this.leftInfo.startCountdown(state.millisUntilNextStart);
      this.centerBall.startCountdown(state.millisUntilNextStart);
    } else {
      this.leftInfo.stopCountdown();
      this.centerBall.showWaiting();
    }

    // Tickets displayed depend on game phase:
    //   - RUNNING with live brett → myTickets (markable) + preRoundTickets (preview
    //     for next round, not markable, cancelable via ×). Mid-round additive-arm.
    //   - Otherwise → preRoundTickets (pre-round queue, cancelable).
    // Cancelable is always true for preRoundTickets — players can drop them until
    // the next round locks in. myTickets (live) are never cancelable (already paid).
    const running = state.gameStatus === "RUNNING";
    const hasLive = running && state.myTickets.length > 0;
    const tickets = hasLive
      ? [...state.myTickets, ...(state.preRoundTickets ?? [])]
      : (state.preRoundTickets ?? []);

    this.ticketGrid.setTickets(tickets, {
      cancelable: !running,
      entryFee: state.entryFee || 10,
      state,
      liveTicketCount: hasLive ? state.myTickets.length : 0,
    });

    // Ball tube + called-numbers overlay reflect drawn history. We always sync
    // from state to survive reconnects + late-joiner snapshots.
    this.syncBallHistory(state.drawnNumbers);

    // Reset claim-won flags + button states when a new round starts or when
    // we land in a non-RUNNING state.
    if (!running) {
      this.lineAlreadyWon = false;
      this.bingoAlreadyWon = false;
      this.lineBtn.reset();
      this.bingoBtn.reset();
    } else {
      for (const result of state.patternResults) {
        if (result.isWon && result.claimType === "LINE") this.lineAlreadyWon = true;
        if (result.isWon && result.claimType === "BINGO") this.bingoAlreadyWon = true;
      }
      this.updateClaimButtons(state);
    }

    // Side panels.
    const totalStake = stakeFromState(state);
    // "Gevinst" in LeftInfoPanel = THIS player's accumulated winnings so far
    // this round, not the total prize pool. Sum payoutAmount from every
    // patternResult this player has won. Matches the toast copy in
    // Game1Controller.onPatternWon and avoids shadowing Innsats when this
    // player is the sole buyer (2026-04-21 Tobias-report).
    const myWinnings = state.myPlayerId
      ? state.patternResults.reduce(
          (sum, r) => sum + (r.isWon && r.winnerId === state.myPlayerId ? (r.payoutAmount ?? 0) : 0),
          0,
        )
      : 0;
    this.leftInfo.update(
      state.playerCount,
      totalStake,
      myWinnings,
      state.lastDrawnNumber,
      state.drawCount,
      state.totalDrawCapacity,
      state.players,
    );
    this.chatPanel.updatePlayerCount(state.playerCount);
    this.centerTop.setGameRunning(running);
    this.centerTop.updatePatterns(state.patterns, state.patternResults, state.prizePool);
    this.centerTop.setCanStartNow(state.canStartNow, running);
    this.headerBar.update(state.jackpot);

    // Auto-open the buy popup on entry so the player doesn't have to hunt for
    // the "Forhåndskjøp" button. One-shot per screen-session (see
    // autoShowBuyPopupDone doc) — applies to WAITING and SPECTATING mid-round
    // joiners. Skipped for active players (hasLive) and once ticketTypes
    // haven't arrived yet (first snapshot before gameVariant populates).
    if (
      !this.autoShowBuyPopupDone
      && !hasLive
      && state.ticketTypes.length > 0
      && (state.preRoundTickets?.length ?? 0) === 0
    ) {
      this.autoShowBuyPopupDone = true;
      this.showBuyPopup(state);
    }
  }

  // ── Buy popup (explicit lifecycle, owned by Controller) ────────────────

  /** Open the buy popup at qty=0 on every call. Controller hides it on
   *  successful arm — re-open starts fresh (matches product spec 2026-04-20). */
  showBuyPopup(state?: GameState): void {
    const ref = state ?? this.lastState;
    if (!ref) return;
    const fee = ref.entryFee || 10;
    const types = ref.ticketTypes ?? [];
    const alreadyPurchased = ref.preRoundTickets?.length ?? 0;
    this.buyPopup.showWithTypes(fee, types, alreadyPurchased);
  }

  hideBuyPopup(): void {
    this.buyPopup.hide();
  }

  /** Show success / error status inside the popup. On `ok`, popup auto-hides. */
  showBuyPopupResult(ok: boolean, errorMessage?: string): void {
    this.buyPopup.showResult(ok, errorMessage);
    if (ok) this.buyPopup.hide();
  }

  // ── Live-game events ────────────────────────────────────────────────────

  onNumberDrawn(number: number, _drawIndex: number, state: GameState): void {
    this.lastState = state;
    this.ballTube.addBall(number);
    this.centerBall.showNumber(number);
    this.calledNumbers.addNumber(number);
    this.audio.playNumber(number);

    // Mark on all live tickets; returns true if any ticket actually matched.
    // (HTML grid handles this per-child — no Pixi hit-test fights.)
    const anyMatched = this.ticketGrid.markNumberOnAll(number);
    if (anyMatched) this.audio.playSfx("mark");

    // Re-evaluate claim buttons after the new mark.
    this.updateClaimButtons(state);
  }

  /** Spectator / WAITING ball-draw — animate ball tube but don't mark tickets. */
  onSpectatorNumberDrawn(number: number, state: GameState): void {
    this.lastState = state;
    this.ballTube.addBall(number);
    this.centerBall.showNumber(number);
    this.calledNumbers.addNumber(number);
    this.audio.playNumber(number);
  }

  onPatternWon(payload: PatternWonPayload): void {
    const claimType = payload.claimType as "LINE" | "BINGO";
    if (claimType === "LINE") { this.lineAlreadyWon = true; this.lineBtn.reset(); }
    if (claimType === "BINGO") { this.bingoAlreadyWon = true; this.bingoBtn.reset(); }
  }

  // ── Lifecycle + misc ────────────────────────────────────────────────────

  /** BIN-451/409 (D2): buy-more disabled after server threshold. */
  disableBuyMore(): void {
    this.centerTop.setBuyMoreDisabled(true, "Kjøp er stengt — trekning pågår");
  }

  enableBuyMore(): void {
    this.centerTop.setBuyMoreDisabled(false);
  }

  /** BIN-420 G26: revert a claim button after server NACK. */
  resetClaimButton(type: "LINE" | "BINGO"): void {
    if (type === "LINE") {
      this.lineAlreadyWon = false;
      this.lineBtn.setState("ready");
    } else {
      this.bingoAlreadyWon = false;
      this.bingoBtn.setState("ready");
    }
  }

  /** BIN-419: Elvis replace — lets the player swap pre-round tickets for a fee. */
  showElvisReplace(replaceAmount: number, onReplace: () => void): void {
    if (replaceAmount <= 0) return;
    const bar = document.createElement("div");
    Object.assign(bar.style, {
      position: "absolute",
      bottom: "10px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(75,0,0,0.95)",
      border: "1.5px solid rgba(255,165,95,0.5)",
      borderRadius: "10px",
      padding: "10px 20px",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      zIndex: "55",
      pointerEvents: "auto",
    });
    const text = document.createElement("span");
    text.textContent = `Bytt bonger (${replaceAmount} kr)`;
    text.style.cssText = "color:#ffa55f;font-size:14px;font-weight:600;";
    bar.appendChild(text);
    const btn = document.createElement("button");
    btn.textContent = "Bytt";
    btn.style.cssText = "background:linear-gradient(180deg,#c41030,#8a0020);border:none;border-radius:6px;padding:6px 16px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;";
    btn.addEventListener("click", () => {
      onReplace();
      bar.remove();
    });
    bar.appendChild(btn);
    const dismissBtn = document.createElement("button");
    dismissBtn.textContent = "\u2715";
    dismissBtn.style.cssText = "background:none;border:none;color:#999;font-size:16px;cursor:pointer;";
    dismissBtn.addEventListener("click", () => bar.remove());
    bar.appendChild(dismissBtn);
    this.overlayManager.getRoot().appendChild(bar);
  }

  /** Called after game-end reset from Controller. */
  reset(): void {
    this.ballTube.clear();
    this.calledNumbers.clearNumbers();
    this.ticketGrid.clear();
    this.lineBtn.reset();
    this.bingoBtn.reset();
    this.lineAlreadyWon = false;
    this.bingoAlreadyWon = false;
    this.calledNumbers.hide();
  }

  resize(width: number, height: number): void {
    this.screenW = width;
    this.screenH = height;
    if (this.bgSprite) {
      this.bgSprite.width = width;
      this.bgSprite.height = height;
    }
    this.centerBall.x = TUBE_COLUMN_WIDTH + (width - TUBE_COLUMN_WIDTH - CHAT_WIDTH) / 2 - 60;
    this.positionTicketGrid();
    // Re-pin the claim buttons.
    const ticketAreaWidth = width - TUBE_COLUMN_WIDTH - (this.chatPanel.isCollapsed() ? 48 : CHAT_WIDTH) - 20;
    const btnY = height - 55;
    const btnCentreX = TUBE_COLUMN_WIDTH + ticketAreaWidth / 2;
    this.lineBtn.x = btnCentreX - 140;
    this.lineBtn.y = btnY;
    this.bingoBtn.x = btnCentreX + 10;
    this.bingoBtn.y = btnY;
  }

  destroy(): void {
    this.leftInfo.stopCountdown();
    this.buyPopup.destroy();
    this.ticketGrid.destroy();
    this.calledNumbers.destroy();
    this.headerShiftTween?.kill();
    this.headerShiftTween = null;
    this.headerBar.destroy();
    this.overlayManager.destroy();
    super.destroy({ children: true });
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private openBuyPopup(): void {
    if (!this.lastState) return;
    this.showBuyPopup(this.lastState);
  }

  private positionTicketGrid(): void {
    const chatW = this.chatPanel?.isCollapsed() ? 48 : CHAT_WIDTH;
    const left = TUBE_COLUMN_WIDTH;
    const top = TICKET_TOP;
    const width = this.screenW - TUBE_COLUMN_WIDTH - chatW - 20;
    const height = this.screenH - TICKET_TOP - CLAIM_AREA;
    this.ticketGrid.setBounds(left, top, Math.max(200, width), Math.max(100, height));
  }

  /** Resize ticket grid when the chat panel collapses / expands, and slide the
   *  jackpot header bar -80px when chat opens (Unity G17 BIN-431). */
  private setupChatLayoutSync(): void {
    this.chatPanel.setOnToggle((collapsed) => {
      this.positionTicketGrid();
      const targetOffset = collapsed ? 0 : -80;
      this.headerShiftTween?.kill();
      const proxy = { x: this.headerBar.currentOffsetX };
      this.headerShiftTween = gsap.to(proxy, {
        x: targetOffset,
        duration: 0.25,
        ease: "none",
        onUpdate: () => this.headerBar.setOffsetX(proxy.x),
      });
    });
  }

  private updateClaimButtons(state: GameState): void {
    const { canClaimLine, canClaimBingo } = checkClaims(state.myTickets, state.myMarks, state.drawnNumbers);
    // Auto-claim mirrors Unity: as soon as a pattern is complete we send the
    // claim. Guarded by the already-won flags so we never double-submit.
    if (canClaimLine && !this.lineAlreadyWon) {
      this.lineBtn.setState("ready");
      this.lineAlreadyWon = true;
      this.callbacks.onClaim?.("LINE");
    }
    if (canClaimBingo && !this.bingoAlreadyWon) {
      this.bingoBtn.setState("ready");
      this.bingoAlreadyWon = true;
      this.callbacks.onClaim?.("BINGO");
    }
  }

  private syncedHistoryKey = "";

  private syncBallHistory(drawnNumbers: number[]): void {
    // Only bulk-load the ball tube when history changes shape (new game, or
    // spectator mid-round join / reconnect). Live draws go through
    // onNumberDrawn → addBall. Without this guard every room:update would
    // wipe + re-populate the tube and cancel running animations.
    const key = drawnNumbers.length === 0 ? "empty" : `len=${drawnNumbers.length}:first=${drawnNumbers[0]}`;
    if (key === this.syncedHistoryKey) return;
    this.syncedHistoryKey = key;

    if (drawnNumbers.length === 0) {
      this.ballTube.clear();
      this.calledNumbers.clearNumbers();
    } else {
      this.ballTube.loadBalls(drawnNumbers);
      this.calledNumbers.setNumbers(drawnNumbers);
    }
  }

  private loadBackground(width: number, height: number): void {
    Assets.load("/web/games/assets/bg-game.png")
      .then((texture) => {
        if (!texture) return;
        this.bgSprite = new Sprite(texture);
        this.bgSprite.width = width;
        this.bgSprite.height = height;
        this.addChildAt(this.bgSprite, 0);
      })
      .catch(() => {
        // Missing asset is non-fatal — game still plays on the default bg.
      });
  }
}
