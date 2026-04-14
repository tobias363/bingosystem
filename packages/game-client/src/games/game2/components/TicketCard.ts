import { Container, Graphics, Text } from "pixi.js";
import type { Ticket } from "@spillorama/shared-types/game";
import { BingoGrid, type GridSize } from "../../../components/BingoGrid.js";

export interface TicketCardOptions {
  gridSize?: GridSize;
  cellSize?: number;
}

/**
 * Ticket card with Unity-matching design: header bar + BingoGrid + to-go counter.
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

  // Unity colors
  private static readonly CARD_BG = 0xfff2ce;       // Light cream
  private static readonly HEADER_BG = 0x790001;      // Dark maroon
  private static readonly HEADER_TEXT = 0xffe83d;     // Bright yellow
  private static readonly TOGO_NORMAL = 0x790001;     // Maroon
  private static readonly TOGO_CLOSE = 0xe63946;      // Red when close

  constructor(index: number, options?: TicketCardOptions) {
    super();
    const gridSize = options?.gridSize ?? "3x5";
    const cellSize = options?.cellSize ?? (gridSize === "5x5" ? 36 : 44);

    // Grid first to get dimensions
    this.grid = new BingoGrid({ gridSize, cellSize, gap: 2 });
    this.cardW = this.grid.gridWidth + 16;
    const headerH = 28;
    const toGoH = 24;
    this.cardH = headerH + this.grid.gridHeight + toGoH + 20;

    // Card background
    this.cardBg = new Graphics();
    this.cardBg.roundRect(0, 0, this.cardW, this.cardH, 8);
    this.cardBg.fill(TicketCard.CARD_BG);
    this.addChild(this.cardBg);

    // Header bar (maroon)
    this.headerBg = new Graphics();
    this.headerBg.roundRect(0, 0, this.cardW, headerH, 8);
    this.headerBg.fill(TicketCard.HEADER_BG);
    this.addChild(this.headerBg);

    // Header text (ticket number)
    this.headerText = new Text({
      text: `${index + 1}-standard`,
      style: {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 13,
        fontWeight: "bold",
        fill: TicketCard.HEADER_TEXT,
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
        fill: TicketCard.HEADER_TEXT,
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
        fill: TicketCard.TOGO_NORMAL,
        align: "center",
      },
    });
    this.toGoText.anchor.set(0.5, 0);
    this.toGoText.x = this.cardW / 2;
    this.toGoText.y = headerH + this.grid.gridHeight + 8;
    this.addChild(this.toGoText);
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
  }

  get cardWidth(): number {
    return this.cardW;
  }

  get cardHeight(): number {
    return this.cardH;
  }

  private updateToGo(): void {
    const remaining = this.grid.getRemainingCount();
    if (remaining === 0) {
      this.toGoText.text = "Ferdig!";
      this.toGoText.style.fill = 0x2a9d8f;
    } else {
      this.toGoText.text = `${remaining} ToGo`;
      this.toGoText.style.fill = remaining <= 2 ? TicketCard.TOGO_CLOSE : TicketCard.TOGO_NORMAL;
    }
  }
}
