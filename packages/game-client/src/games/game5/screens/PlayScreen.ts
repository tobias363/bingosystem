import { Container, Text } from "pixi.js";
import type { GameState } from "../../../bridge/GameBridge.js";
import type { PatternWonPayload } from "@spillorama/shared-types/socket-events";
import type { AudioManager } from "../../../audio/AudioManager.js";
import { TicketScroller } from "../../game2/components/TicketScroller.js";
import { TicketCard } from "../../game2/components/TicketCard.js";
import { DrawnBallsPanel } from "../../game2/components/DrawnBallsPanel.js";
import { ClaimButton } from "../../game2/components/ClaimButton.js";
import { PlayerInfoBar } from "../../game2/components/PlayerInfoBar.js";
import { RouletteWheel } from "../components/RouletteWheel.js";
import { getTicketThemeByName } from "../../game1/colors/TicketColorThemes.js";
import { checkClaims } from "../../game2/logic/ClaimDetector.js";

/**
 * Game 5 (Spillorama Bingo) play screen.
 * Same as Game 2 (3x5 grids) but adds the roulette wheel —
 * the signature Game 5 visual.
 */
export class PlayScreen extends Container {
  private scroller: TicketScroller;
  private drawnBalls: DrawnBallsPanel;
  private roulette: RouletteWheel;
  private lineBtn: ClaimButton;
  private bingoBtn: ClaimButton;
  private infoBar: PlayerInfoBar;
  private luckyNumberText: Text;
  private audio: AudioManager;
  private onClaim: ((type: "LINE" | "BINGO") => void) | null = null;
  private lineAlreadyWon = false;
  private bingoAlreadyWon = false;

  constructor(screenWidth: number, screenHeight: number, audio: AudioManager) {
    super();
    this.audio = audio;

    // Layout: roulette on the right, tickets on the left
    const wheelRadius = Math.min(100, Math.floor(screenHeight * 0.22));
    const wheelAreaWidth = wheelRadius * 2 + 40;
    const gameAreaWidth = screenWidth - wheelAreaWidth;

    // Info bar (top)
    this.infoBar = new PlayerInfoBar();
    this.infoBar.x = 20;
    this.infoBar.y = 10;
    this.addChild(this.infoBar);

    // Lucky number display
    this.luckyNumberText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 16, fill: 0xffe83d },
    });
    this.luckyNumberText.x = gameAreaWidth - 130;
    this.luckyNumberText.y = 14;
    this.addChild(this.luckyNumberText);

    // Drawn balls panel
    this.drawnBalls = new DrawnBallsPanel();
    this.drawnBalls.x = 20;
    this.drawnBalls.y = 45;
    this.addChild(this.drawnBalls);

    // Roulette wheel (right side)
    this.roulette = new RouletteWheel(wheelRadius);
    this.roulette.x = gameAreaWidth + wheelAreaWidth / 2;
    this.roulette.y = wheelRadius + 50;
    this.addChild(this.roulette);

    // Ticket scroller (main area — left side)
    const scrollerY = 100;
    const scrollerHeight = screenHeight - scrollerY - 80;
    this.scroller = new TicketScroller(gameAreaWidth - 40, scrollerHeight);
    this.scroller.x = 20;
    this.scroller.y = scrollerY;
    this.addChild(this.scroller);

    // Claim buttons (bottom, centered in game area)
    this.lineBtn = new ClaimButton("LINE", 140, 50);
    this.lineBtn.x = gameAreaWidth / 2 - 150;
    this.lineBtn.y = screenHeight - 65;
    this.lineBtn.setOnClaim((type) => this.onClaim?.(type));
    this.addChild(this.lineBtn);

    this.bingoBtn = new ClaimButton("BINGO", 140, 50);
    this.bingoBtn.x = gameAreaWidth / 2 + 10;
    this.bingoBtn.y = screenHeight - 65;
    this.bingoBtn.setOnClaim((type) => this.onClaim?.(type));
    this.addChild(this.bingoBtn);
  }

  setOnClaim(callback: (type: "LINE" | "BINGO") => void): void {
    this.onClaim = callback;
  }

  buildTickets(state: GameState): void {
    this.scroller.clearCards();
    this.roulette.reset();
    this.lineAlreadyWon = false;
    this.bingoAlreadyWon = false;

    for (const result of state.patternResults) {
      if (result.isWon && result.claimType === "LINE") this.lineAlreadyWon = true;
      if (result.isWon && result.claimType === "BINGO") this.bingoAlreadyWon = true;
    }

    for (let i = 0; i < state.myTickets.length; i++) {
      const ticket = state.myTickets[i];
      const theme = getTicketThemeByName(ticket.color, i);
      const card = new TicketCard(i, {
        cardBg: theme.cardBg,
        headerBg: theme.headerBg,
        headerText: theme.headerText,
        toGoColor: theme.toGoColor,
        toGoCloseColor: theme.toGoCloseColor,
        cellColors: theme.cellColors,
      });
      card.loadTicket(ticket);

      if (state.myMarks[i]) {
        card.markNumbers(state.myMarks[i]);
      } else {
        for (const n of state.drawnNumbers) card.markNumber(n);
      }

      if (state.myLuckyNumber) card.highlightLuckyNumber(state.myLuckyNumber);
      this.scroller.addCard(card);
    }

    this.scroller.sortBestFirst();
    this.updateClaimButtons(state);
  }

  onNumberDrawn(number: number, drawIndex: number, state: GameState): void {
    this.scroller.markNumberOnAll(number);
    this.drawnBalls.addBall(number);
    this.roulette.spinTo(number); // Roulette spin animation
    this.audio.playNumber(number);
    this.scroller.sortBestFirst();
    this.updateClaimButtons(state);
    this.updateInfo(state);
  }

  onPatternWon(payload: PatternWonPayload): void {
    if (payload.claimType === "LINE") { this.lineAlreadyWon = true; this.lineBtn.reset(); }
    if (payload.claimType === "BINGO") { this.bingoAlreadyWon = true; this.bingoBtn.reset(); }
  }

  updateInfo(state: GameState): void {
    this.infoBar.update(state.playerCount, state.drawCount, state.totalDrawCapacity, state.prizePool);
    this.luckyNumberText.text = state.myLuckyNumber ? `Heldig tall: ${state.myLuckyNumber}` : "";
  }

  reset(): void {
    this.scroller.clearCards();
    this.drawnBalls.clear();
    this.roulette.reset();
    this.lineBtn.reset();
    this.bingoBtn.reset();
    this.lineAlreadyWon = false;
    this.bingoAlreadyWon = false;
  }

  private updateClaimButtons(state: GameState): void {
    const { canClaimLine, canClaimBingo } = checkClaims(state.myTickets, state.myMarks, state.drawnNumbers);
    if (canClaimLine && !this.lineAlreadyWon) this.lineBtn.setState("ready");
    if (canClaimBingo && !this.bingoAlreadyWon) this.bingoBtn.setState("ready");
  }
}
