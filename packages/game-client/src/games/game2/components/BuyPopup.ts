import { Container, Graphics, Text } from "pixi.js";
import gsap from "gsap";

/**
 * Between-rounds ticket purchase popup.
 * Player adjusts ticket count and clicks buy → triggers bet:arm.
 */
export class BuyPopup extends Container {
  private bg: Graphics;
  private titleText: Text;
  private countText: Text;
  private priceText: Text;
  private ticketCount = 1;
  private ticketPrice = 0;
  private maxTickets = 30;
  private onBuy: ((count: number) => void) | null = null;

  constructor(width = 320, height = 220) {
    super();

    // Background
    this.bg = new Graphics();
    this.bg.roundRect(0, 0, width, height, 12);
    this.bg.fill(0x2e0000); // Dark maroon
    this.bg.stroke({ color: 0x790001, width: 2 });
    this.addChild(this.bg);

    // Title
    this.titleText = new Text({
      text: "Kjøp billetter",
      style: { fontFamily: "Arial, Helvetica, sans-serif", fontSize: 22, fontWeight: "bold", fill: 0xffe83d },
    });
    this.titleText.x = width / 2;
    this.titleText.y = 20;
    this.titleText.anchor.set(0.5, 0);
    this.addChild(this.titleText);

    // Minus button
    const minusBtn = this.createButton("-", 40, 40, 0x790001);
    minusBtn.x = 40;
    minusBtn.y = 75;
    minusBtn.on("pointerdown", () => this.adjustCount(-1));
    this.addChild(minusBtn);

    // Count display
    this.countText = new Text({
      text: "1",
      style: { fontFamily: "Arial", fontSize: 36, fontWeight: "bold", fill: 0xffffff, align: "center" },
    });
    this.countText.anchor.set(0.5);
    this.countText.x = width / 2;
    this.countText.y = 95;
    this.addChild(this.countText);

    // Plus button
    const plusBtn = this.createButton("+", 40, 40, 0x790001);
    plusBtn.x = width - 80;
    plusBtn.y = 75;
    plusBtn.on("pointerdown", () => this.adjustCount(1));
    this.addChild(plusBtn);

    // Price
    this.priceText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 16, fill: 0xcccccc, align: "center" },
    });
    this.priceText.anchor.set(0.5, 0);
    this.priceText.x = width / 2;
    this.priceText.y = 125;
    this.addChild(this.priceText);

    // Buy button
    const buyBtn = this.createButton("Kjøp", 200, 44, 0xa00020);
    buyBtn.x = (width - 200) / 2;
    buyBtn.y = 160;
    buyBtn.on("pointerdown", () => {
      if (this.onBuy) this.onBuy(this.ticketCount);
    });
    this.addChild(buyBtn);

    this.visible = false;
  }

  show(ticketPrice: number, maxTickets = 30): void {
    this.ticketPrice = ticketPrice;
    this.maxTickets = maxTickets;
    this.ticketCount = 1;
    this.updateDisplay();
    this.visible = true;
    this.alpha = 0;
    gsap.to(this, { alpha: 1, duration: 0.2 });
  }

  hide(): void {
    gsap.to(this, { alpha: 0, duration: 0.15, onComplete: () => { this.visible = false; } });
  }

  setOnBuy(callback: (count: number) => void): void {
    this.onBuy = callback;
  }

  private adjustCount(delta: number): void {
    this.ticketCount = Math.max(1, Math.min(this.maxTickets, this.ticketCount + delta));
    this.updateDisplay();
  }

  private updateDisplay(): void {
    this.countText.text = String(this.ticketCount);
    const total = this.ticketCount * this.ticketPrice;
    this.priceText.text = `${this.ticketCount} × ${this.ticketPrice} kr = ${total} kr`;
  }

  private createButton(text: string, w: number, h: number, color: number): Container {
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, w, h, 8);
    bg.fill(color);
    btn.addChild(bg);
    const label = new Text({
      text,
      style: { fontFamily: "Arial", fontSize: 18, fontWeight: "bold", fill: 0xffffff, align: "center" },
    });
    label.anchor.set(0.5);
    label.x = w / 2;
    label.y = h / 2;
    btn.addChild(label);
    btn.eventMode = "static";
    btn.cursor = "pointer";
    return btn;
  }
}
