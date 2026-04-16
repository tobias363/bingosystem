import { Container, Graphics, Text } from "pixi.js";
import gsap from "gsap";
import type { Ticket } from "@spillorama/shared-types/game";
import { BingoGrid, type GridSize } from "../../../components/BingoGrid.js";
import type { BingoCellColors } from "../../../components/BingoCell.js";
import { ONE_TO_GO_COLOR } from "../../game1/colors/TicketColorThemes.js";

export interface TicketCardOptions {
  gridSize?: GridSize;
  cellSize?: number;
  /** Card-level color overrides (Unity TicketColorTheme) */
  cardBg?: number;
  headerBg?: number;
  headerText?: number;
  toGoColor?: number;
  toGoCloseColor?: number;
  /** Cell-level color overrides (Unity TicketColorData) */
  cellColors?: BingoCellColors;
}

/**
 * Ticket card with Unity-matching design: header bar + BingoGrid + to-go counter.
 *
 * Tap the header bar to flip the card and see ticket info on the back.
 * Auto-flips back after 3 seconds (matches Unity BingoTicket.ShowTicketDetails).
 */
export class TicketCard extends Container {
  readonly grid: BingoGrid;
  private cardBg: Graphics;
  private headerBg: Graphics;
  private headerText: Text;
  private priceText: Text;
  private toGoText: Text;
  private ticket: Ticket | null = null;
  private cardW: number;
  private cardH: number;

  // Flip state
  private backPanel: Container;
  private backInfoLabel: Text;
  private backInfoPrice: Text;
  private isFlipped = false;
  private flipAnimating = false;
  private flipTimer: ReturnType<typeof setTimeout> | null = null;
  private currentLabel = "";

  // Default Unity colors (overridable via options)
  private static readonly DEFAULT_CARD_BG = 0xfff2ce;
  private static readonly DEFAULT_HEADER_BG = 0x790001;
  private static readonly DEFAULT_HEADER_TEXT = 0xffe83d;
  private static readonly DEFAULT_TOGO_NORMAL = 0x790001;
  private static readonly DEFAULT_TOGO_CLOSE = 0xe63946;

  private toGoNormalColor: number;
  private toGoCloseColor: number;

  constructor(index: number, options?: TicketCardOptions) {
    super();
    const gridSize = options?.gridSize ?? "3x5";
    const cellSize = options?.cellSize ?? (gridSize === "5x5" ? 36 : 44);

    // Theme colors (from Unity TicketColorTheme or defaults)
    const cardBgColor = options?.cardBg ?? TicketCard.DEFAULT_CARD_BG;
    const headerBgColor = options?.headerBg ?? TicketCard.DEFAULT_HEADER_BG;
    const headerTextColor = options?.headerText ?? TicketCard.DEFAULT_HEADER_TEXT;
    this.toGoNormalColor = options?.toGoColor ?? TicketCard.DEFAULT_TOGO_NORMAL;
    this.toGoCloseColor = options?.toGoCloseColor ?? TicketCard.DEFAULT_TOGO_CLOSE;

    // Grid first to get dimensions
    this.grid = new BingoGrid({ gridSize, cellSize, gap: 2, cellColors: options?.cellColors });
    this.cardW = this.grid.gridWidth + 16;
    const headerH = 28;
    const toGoH = 24;
    this.cardH = headerH + this.grid.gridHeight + toGoH + 20;

    // Card background
    this.cardBg = new Graphics();
    this.cardBg.roundRect(0, 0, this.cardW, this.cardH, 8);
    this.cardBg.fill(cardBgColor);
    this.addChild(this.cardBg);

    // Header bar
    this.headerBg = new Graphics();
    this.headerBg.roundRect(0, 0, this.cardW, headerH, 8);
    this.headerBg.fill(headerBgColor);
    this.addChild(this.headerBg);

    // Header text (ticket number)
    this.headerText = new Text({
      text: `${index + 1}-standard`,
      style: {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 13,
        fontWeight: "bold",
        fill: headerTextColor,
      },
    });
    this.headerText.x = 8;
    this.headerText.y = 5;
    this.addChild(this.headerText);

    // Price text (right side of header)
    this.priceText = new Text({
      text: "20kr",
      style: {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 13,
        fontWeight: "bold",
        fill: headerTextColor,
      },
    });
    this.priceText.anchor.set(1, 0);
    this.priceText.x = this.cardW - 8;
    this.priceText.y = 5;
    this.addChild(this.priceText);

    // Grid
    this.grid.x = 8;
    this.grid.y = headerH + 4;
    this.addChild(this.grid);

    // "To go" text
    this.toGoText = new Text({
      text: "",
      style: {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 14,
        fontWeight: "bold",
        fill: this.toGoNormalColor,
        align: "center",
      },
    });
    this.toGoText.anchor.set(0.5, 0);
    this.toGoText.x = this.cardW / 2;
    this.toGoText.y = headerH + this.grid.gridHeight + 8;
    this.addChild(this.toGoText);

    // ── Back face (flip info panel) ──────────────────────────────────────────

    this.backPanel = new Container();
    this.backPanel.visible = false;

    // Back panel: same background as front card
    const backBg = new Graphics();
    backBg.roundRect(0, 0, this.cardW, this.cardH, 8);
    backBg.fill(cardBgColor);
    this.backPanel.addChild(backBg);

    // Back panel header (same styling as front)
    const backHeader = new Graphics();
    backHeader.roundRect(0, 0, this.cardW, headerH, 8);
    backHeader.fill(headerBgColor);
    this.backPanel.addChild(backHeader);

    const backHeaderText = new Text({
      text: `Bong ${index + 1}`,
      style: {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 13,
        fontWeight: "bold",
        fill: headerTextColor,
      },
    });
    backHeaderText.x = 8;
    backHeaderText.y = 5;
    this.backPanel.addChild(backHeaderText);

    // Central info block — label (large) + price (smaller)
    const centerY = headerH + (this.cardH - headerH) / 2 - 28;

    this.backInfoLabel = new Text({
      text: "",
      style: {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 16,
        fontWeight: "bold",
        fill: headerBgColor,
        align: "center",
        wordWrap: true,
        wordWrapWidth: this.cardW - 16,
      },
    });
    this.backInfoLabel.anchor.set(0.5, 0);
    this.backInfoLabel.x = this.cardW / 2;
    this.backInfoLabel.y = centerY;
    this.backPanel.addChild(this.backInfoLabel);

    this.backInfoPrice = new Text({
      text: "",
      style: {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 13,
        fontWeight: "600",
        fill: headerBgColor,
        align: "center",
      },
    });
    this.backInfoPrice.anchor.set(0.5, 0);
    this.backInfoPrice.x = this.cardW / 2;
    this.backInfoPrice.y = centerY + 36;
    this.backPanel.addChild(this.backInfoPrice);

    this.addChild(this.backPanel);

    // ── Header tap → flip ────────────────────────────────────────────────────
    this.headerBg.eventMode = "static";
    this.headerBg.cursor = "pointer";
    this.headerBg.on("pointerdown", (e) => {
      e.stopPropagation();
      this.flip();
    });
  }

  loadTicket(ticket: Ticket): void {
    this.ticket = ticket;
    this.grid.loadTicket(ticket);
    this.updateToGo();
  }

  markNumber(number: number): boolean {
    const marked = this.grid.markNumber(number);
    if (marked) this.updateToGo();
    return marked;
  }

  markNumbers(numbers: number[]): void {
    this.grid.markNumbers(numbers);
    this.updateToGo();
  }

  getRemainingCount(): number {
    return this.grid.getRemainingCount();
  }

  highlightLuckyNumber(luckyNumber: number): void {
    const cell = this.grid.getCell(luckyNumber);
    if (cell) cell.setHighlight(true);
  }

  reset(): void {
    this.grid.reset();
    this.updateToGo();
    // Force flip back if flipped
    if (this.isFlipped) {
      if (this.flipTimer) { clearTimeout(this.flipTimer); this.flipTimer = null; }
      this.isFlipped = false;
      this.flipAnimating = false;
      this.backPanel.visible = false;
      this.scale.set(1);
    }
  }

  get cardWidth(): number {
    return this.cardW;
  }

  get cardHeight(): number {
    return this.cardH;
  }

  /** Update the header label (e.g. for Elvis variant: "Elvis 1" or Traffic Light colors). */
  setHeaderLabel(label: string): void {
    this.headerText.text = label;
    this.currentLabel = label;
    this.backInfoLabel.text = label;
  }

  /** Set the price shown on the back face (e.g. "10 kr"). */
  setPrice(price: string): void {
    this.priceText.text = price;
    this.backInfoPrice.text = price;
  }

  /**
   * Flip the card to show info on the back (or flip back to front).
   * Matches Unity BingoTicket.ShowTicketDetails / HideTicketDetailsAnimation.
   */
  flip(): void {
    if (this.flipAnimating) return;
    this.flipAnimating = true;

    if (this.flipTimer) { clearTimeout(this.flipTimer); this.flipTimer = null; }

    // First half: scale X → 0 (card "turns edge-on")
    gsap.to(this.scale, {
      x: 0,
      duration: 0.2,
      ease: "power2.in",
      onComplete: () => {
        // At midpoint: toggle which face is visible
        this.isFlipped = !this.isFlipped;
        this.backPanel.visible = this.isFlipped;

        // Second half: scale X → 1 (new face expands into view)
        gsap.to(this.scale, {
          x: 1,
          duration: 0.2,
          ease: "power2.out",
          onComplete: () => {
            this.flipAnimating = false;
            if (this.isFlipped) {
              // Auto-flip back after 3 seconds (Unity: ticketDetailPageTime = 3s)
              this.flipTimer = setTimeout(() => this.flip(), 3000);
            }
          },
        });
      },
    });
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private updateToGo(): void {
    const remaining = this.grid.getRemainingCount();
    if (remaining === 0) {
      this.toGoText.text = "Ferdig!";
      this.toGoText.style.fill = 0x2a9d8f;
      // All rows complete — stop all blink animations (Unity: Stop_Blink)
      this.grid.stopAllBlinks();
    } else {
      this.toGoText.text = remaining === 1 ? "1 ToGo!" : `${remaining} ToGo`;
      this.toGoText.style.fill = remaining <= 3 ? this.toGoCloseColor : this.toGoNormalColor;
      // Per-row one-to-go detection: blink the single remaining cell in any row
      // that is one number away from completion (Unity: Start_NumberBlink per row)
      this.grid.updateOneToGo(ONE_TO_GO_COLOR);
    }
  }
}
