import { Container, Graphics, Text } from "pixi.js";
import gsap from "gsap";

export interface BingoCellOptions {
  size: number;
  number: number;
  isFreeSpace?: boolean;
}

/**
 * A single cell in a bingo grid.
 * Visual design matches Unity Spillorama: cream/tan cells with maroon markers.
 */
export class BingoCell extends Container {
  readonly cellNumber: number;
  private bg: Graphics;
  private marker: Graphics;
  private numberText: Text;
  private marked = false;
  private blinking = false;
  private highlighted = false;
  private blinkTween: gsap.core.Tween | null = null;
  private size: number;
  private isFreeSpace: boolean;

  // Unity color palette
  private static readonly BG_DEFAULT = 0xffd6a7; // Peachy tan (#FFD6A7)
  private static readonly BG_FREE = 0xffe83d;     // Bright yellow
  private static readonly BG_HIGHLIGHT = 0xffe83d; // Yellow highlight
  private static readonly MARKER_COLOR = 0x7e001b; // Deep maroon marker (#7E001B)
  private static readonly TEXT_DEFAULT = 0x1a0a0a; // Near black
  private static readonly TEXT_MARKED = 0xffd6a7;  // Tan (matches cell bg for contrast)
  private static readonly TEXT_FREE = 0x790001;    // Dark maroon
  private static readonly BORDER_COLOR = 0xd4a574; // Subtle border

  constructor(options: BingoCellOptions) {
    super();
    this.cellNumber = options.number;
    this.size = options.size;
    this.isFreeSpace = options.isFreeSpace ?? false;

    // Cell background
    this.bg = new Graphics();
    this.drawBg(this.isFreeSpace ? BingoCell.BG_FREE : BingoCell.BG_DEFAULT);
    this.addChild(this.bg);

    // Marker circle (hidden until marked)
    this.marker = new Graphics();
    this.marker.visible = false;
    this.addChild(this.marker);

    // Number text
    const fontSize = Math.floor(this.size * 0.42);
    this.numberText = new Text({
      text: this.isFreeSpace ? "F" : String(options.number),
      style: {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize,
        fill: this.isFreeSpace ? BingoCell.TEXT_FREE : BingoCell.TEXT_DEFAULT,
        fontWeight: "bold",
        align: "center",
      },
    });
    this.numberText.anchor.set(0.5);
    this.numberText.x = this.size / 2;
    this.numberText.y = this.size / 2;
    this.addChild(this.numberText);

    if (this.isFreeSpace) {
      this.marked = true;
    }

    this.eventMode = "static";
    this.cursor = "pointer";
  }

  isMarked(): boolean {
    return this.marked;
  }

  mark(): void {
    if (this.marked) return;
    this.marked = true;
    this.showMarker();
    this.stopBlink();

    gsap.to(this.scale, {
      x: 1.12,
      y: 1.12,
      duration: 0.12,
      yoyo: true,
      repeat: 1,
      ease: "power2.out",
    });
  }

  unmark(): void {
    if (!this.marked || this.isFreeSpace) return;
    this.marked = false;
    this.hideMarker();
    this.stopBlink();
  }

  startBlink(): void {
    if (this.blinking || this.marked) return;
    this.blinking = true;
    this.blinkTween = gsap.to(this.scale, {
      x: 1.15,
      y: 1.15,
      duration: 0.5,
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

  setHighlight(on: boolean): void {
    this.highlighted = on;
    if (on) {
      this.drawBg(BingoCell.BG_HIGHLIGHT);
      this.numberText.style.fill = BingoCell.TEXT_FREE;
    } else if (this.marked) {
      this.showMarker();
    } else {
      this.drawBg(BingoCell.BG_DEFAULT);
      this.numberText.style.fill = BingoCell.TEXT_DEFAULT;
    }
  }

  reset(): void {
    this.stopBlink();
    this.highlighted = false;
    if (!this.isFreeSpace) {
      this.marked = false;
      this.hideMarker();
      this.drawBg(BingoCell.BG_DEFAULT);
      this.numberText.style.fill = BingoCell.TEXT_DEFAULT;
    }
  }

  // ── Drawing ───────────────────────────────────────────────────────────

  private drawBg(color: number): void {
    this.bg.clear();
    // Outer border
    this.bg.roundRect(0, 0, this.size, this.size, 4);
    this.bg.fill(BingoCell.BORDER_COLOR);
    // Inner fill
    this.bg.roundRect(1, 1, this.size - 2, this.size - 2, 3);
    this.bg.fill(color);
  }

  private showMarker(): void {
    const radius = (this.size - 6) / 2;
    this.marker.clear();
    this.marker.circle(this.size / 2, this.size / 2, radius);
    this.marker.fill(BingoCell.MARKER_COLOR);
    this.marker.visible = true;
    this.numberText.style.fill = BingoCell.TEXT_MARKED;
  }

  private hideMarker(): void {
    this.marker.visible = false;
    this.marker.clear();
    this.numberText.style.fill = BingoCell.TEXT_DEFAULT;
  }
}
