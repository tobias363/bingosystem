import { Container, Graphics, Text } from "pixi.js";
import gsap from "gsap";

export interface BingoCellOptions {
  size: number;
  number: number;
  isFreeSpace?: boolean;
}

/**
 * A single cell in a bingo grid.
 * Handles rendering, marking, blinking (1-to-go), and pattern highlighting.
 */
export class BingoCell extends Container {
  readonly cellNumber: number;
  private bg: Graphics;
  private numberText: Text;
  private marked = false;
  private blinking = false;
  private highlighted = false;
  private blinkTween: gsap.core.Tween | null = null;
  private size: number;
  private isFreeSpace: boolean;

  // Colors
  private static readonly BG_DEFAULT = 0x2a2a4a;
  private static readonly BG_MARKED = 0x4caf50;
  private static readonly BG_HIGHLIGHT = 0xffc107;
  private static readonly BG_FREE = 0x666688;
  private static readonly TEXT_COLOR = 0xffffff;

  constructor(options: BingoCellOptions) {
    super();
    this.cellNumber = options.number;
    this.size = options.size;
    this.isFreeSpace = options.isFreeSpace ?? false;

    // Background
    this.bg = new Graphics();
    this.drawBg(this.isFreeSpace ? BingoCell.BG_FREE : BingoCell.BG_DEFAULT);
    this.addChild(this.bg);

    // Number label
    this.numberText = new Text({
      text: this.isFreeSpace ? "F" : String(options.number),
      style: {
        fontFamily: "Arial",
        fontSize: Math.floor(this.size * 0.4),
        fill: BingoCell.TEXT_COLOR,
        fontWeight: "bold",
        align: "center",
      },
    });
    this.numberText.anchor.set(0.5);
    this.numberText.x = this.size / 2;
    this.numberText.y = this.size / 2;
    this.addChild(this.numberText);

    // Free space is always marked
    if (this.isFreeSpace) {
      this.marked = true;
    }

    // Make interactive for click-to-mark
    this.eventMode = "static";
    this.cursor = "pointer";
  }

  // ── State ─────────────────────────────────────────────────────────────

  isMarked(): boolean {
    return this.marked;
  }

  mark(): void {
    if (this.marked) return;
    this.marked = true;
    this.drawBg(BingoCell.BG_MARKED);
    this.stopBlink();

    // Pulse animation
    gsap.to(this.scale, {
      x: 1.15,
      y: 1.15,
      duration: 0.15,
      yoyo: true,
      repeat: 1,
      ease: "power2.out",
    });
  }

  unmark(): void {
    if (!this.marked || this.isFreeSpace) return;
    this.marked = false;
    this.drawBg(BingoCell.BG_DEFAULT);
    this.stopBlink();
  }

  /** Start 1-to-go blink animation. */
  startBlink(): void {
    if (this.blinking || this.marked) return;
    this.blinking = true;
    this.blinkTween = gsap.to(this.scale, {
      x: 1.12,
      y: 1.12,
      duration: 0.4,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
  }

  stopBlink(): void {
    if (!this.blinking) return;
    this.blinking = false;
    if (this.blinkTween) {
      this.blinkTween.kill();
      this.blinkTween = null;
    }
    gsap.to(this.scale, { x: 1, y: 1, duration: 0.15 });
  }

  /** Highlight cell as part of a winning pattern. */
  setHighlight(on: boolean): void {
    this.highlighted = on;
    if (on) {
      this.drawBg(BingoCell.BG_HIGHLIGHT);
    } else {
      this.drawBg(this.marked ? BingoCell.BG_MARKED : BingoCell.BG_DEFAULT);
    }
  }

  /** Reset to initial state. */
  reset(): void {
    this.stopBlink();
    this.highlighted = false;
    if (!this.isFreeSpace) {
      this.marked = false;
      this.drawBg(BingoCell.BG_DEFAULT);
    }
  }

  // ── Drawing ───────────────────────────────────────────────────────────

  private drawBg(color: number): void {
    this.bg.clear();
    this.bg.roundRect(1, 1, this.size - 2, this.size - 2, 6);
    this.bg.fill(color);
  }
}
