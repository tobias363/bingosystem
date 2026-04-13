import { Container, Text } from "pixi.js";
import type { Ticket } from "@spillorama/shared-types/game";
import { BingoGrid, type GridSize } from "../../../components/BingoGrid.js";

export interface TicketCardOptions {
  gridSize?: GridSize;
  cellSize?: number;
}

/**
 * A single ticket card: BingoGrid + "to-go" counter + ticket index label.
 * Supports 3x5 (Game 2) and 5x5 (Game 1, 3) grids.
 */
export class TicketCard extends Container {
  readonly grid: BingoGrid;
  private toGoText: Text;
  private indexText: Text;
  private ticket: Ticket | null = null;

  constructor(index: number, options?: TicketCardOptions) {
    super();
    const gridSize = options?.gridSize ?? "3x5";
    const cellSize = options?.cellSize ?? (gridSize === "5x5" ? 40 : 48);

    // Ticket index label
    this.indexText = new Text({
      text: `#${index + 1}`,
      style: { fontFamily: "Arial", fontSize: 14, fill: 0x999999 },
    });
    this.indexText.x = 0;
    this.indexText.y = 0;
    this.addChild(this.indexText);

    // Bingo grid
    this.grid = new BingoGrid({ gridSize, cellSize, gap: 3 });
    this.grid.y = 22;
    this.addChild(this.grid);

    // "To go" text below grid
    this.toGoText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 16, fill: 0xcccccc, align: "center" },
    });
    this.toGoText.y = this.grid.y + this.grid.gridHeight + 8;
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
    if (cell) {
      cell.setHighlight(true);
    }
  }

  reset(): void {
    this.grid.reset();
    this.updateToGo();
  }

  get cardWidth(): number {
    return this.grid.gridWidth;
  }

  get cardHeight(): number {
    return 22 + this.grid.gridHeight + 30;
  }

  private updateToGo(): void {
    const remaining = this.grid.getRemainingCount();
    this.toGoText.text = remaining > 0 ? `${remaining} igjen` : "Ferdig!";
    this.toGoText.style.fill = remaining <= 1 ? 0xffc107 : 0xcccccc;
  }
}
