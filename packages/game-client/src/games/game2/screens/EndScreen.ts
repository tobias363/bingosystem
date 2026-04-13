import { Container, Graphics, Text } from "pixi.js";
import gsap from "gsap";
import type { GameState } from "../../../bridge/GameBridge.js";

/**
 * Results overlay shown after game ends.
 * Displays winners, payouts, and auto-transitions back to lobby.
 */
export class EndScreen extends Container {
  private onDismiss: (() => void) | null = null;

  constructor(screenWidth: number, screenHeight: number) {
    super();

    // Semi-transparent overlay
    const overlay = new Graphics();
    overlay.rect(0, 0, screenWidth, screenHeight);
    overlay.fill({ color: 0x000000, alpha: 0.7 });
    this.addChild(overlay);
  }

  show(state: GameState): void {
    const w = this.children[0] ? 400 : 400;
    const h = 280;
    const cx = (this.parent?.width ?? 800) / 2;
    const cy = (this.parent?.height ?? 600) / 2;

    // Results panel
    const panel = new Container();
    panel.x = cx - w / 2;
    panel.y = cy - h / 2;

    const bg = new Graphics();
    bg.roundRect(0, 0, w, h, 16);
    bg.fill(0x2a2a4a);
    bg.stroke({ color: 0x444466, width: 2 });
    panel.addChild(bg);

    const title = new Text({
      text: "Spill avsluttet!",
      style: { fontFamily: "Arial", fontSize: 28, fontWeight: "bold", fill: 0xffffff },
    });
    title.anchor.set(0.5, 0);
    title.x = w / 2;
    title.y = 20;
    panel.addChild(title);

    // Pattern results
    let y = 70;
    for (const result of state.patternResults) {
      const text = new Text({
        text: result.isWon
          ? `${result.patternName}: ${result.payoutAmount ?? 0} kr`
          : `${result.patternName}: Ikke vunnet`,
        style: {
          fontFamily: "Arial",
          fontSize: 18,
          fill: result.isWon ? 0x4caf50 : 0x888888,
        },
      });
      text.x = 30;
      text.y = y;
      panel.addChild(text);
      y += 30;
    }

    if (state.patternResults.length === 0) {
      const noResults = new Text({
        text: "Ingen vinnere denne runden",
        style: { fontFamily: "Arial", fontSize: 18, fill: 0x888888 },
      });
      noResults.x = 30;
      noResults.y = y;
      panel.addChild(noResults);
    }

    // "Next game" button
    const nextBtn = new Container();
    const nextBg = new Graphics();
    nextBg.roundRect(0, 0, 200, 44, 8);
    nextBg.fill(0x4caf50);
    nextBtn.addChild(nextBg);
    const nextText = new Text({
      text: "Neste spill",
      style: { fontFamily: "Arial", fontSize: 18, fontWeight: "bold", fill: 0xffffff },
    });
    nextText.anchor.set(0.5);
    nextText.x = 100;
    nextText.y = 22;
    nextBtn.addChild(nextText);
    nextBtn.x = (w - 200) / 2;
    nextBtn.y = h - 64;
    nextBtn.eventMode = "static";
    nextBtn.cursor = "pointer";
    nextBtn.on("pointerdown", () => this.dismiss());
    panel.addChild(nextBtn);

    this.addChild(panel);

    // Fade in
    this.alpha = 0;
    gsap.to(this, { alpha: 1, duration: 0.3 });

    // Auto-dismiss after 8 seconds
    gsap.delayedCall(8, () => this.dismiss());
  }

  setOnDismiss(callback: () => void): void {
    this.onDismiss = callback;
  }

  private dismiss(): void {
    if (this.onDismiss) this.onDismiss();
  }
}
