import { Container, Graphics, Text } from "pixi.js";
import gsap from "gsap";

/**
 * Visual representation of a drawn bingo ball.
 * Used in the drawn-numbers display area.
 */
export class NumberBall extends Container {
  readonly ballNumber: number;
  private bg: Graphics;
  private numberText: Text;

  constructor(number: number, size = 44) {
    super();
    this.ballNumber = number;

    const radius = size / 2;

    // Circle background
    this.bg = new Graphics();
    this.bg.circle(radius, radius, radius - 1);
    this.bg.fill(this.getColorForNumber(number));
    this.addChild(this.bg);

    // Number text
    this.numberText = new Text({
      text: String(number),
      style: {
        fontFamily: "Arial",
        fontSize: Math.floor(size * 0.4),
        fill: 0xffffff,
        fontWeight: "bold",
        align: "center",
      },
    });
    this.numberText.anchor.set(0.5);
    this.numberText.x = radius;
    this.numberText.y = radius;
    this.addChild(this.numberText);

    // Entry animation
    this.scale.set(0);
    gsap.to(this.scale, {
      x: 1,
      y: 1,
      duration: 0.3,
      ease: "back.out(1.7)",
    });
  }

  /** Standard bingo ball colors by range. */
  private getColorForNumber(n: number): number {
    if (n <= 15) return 0x2196f3; // Blue (B)
    if (n <= 30) return 0xf44336; // Red (I)
    if (n <= 45) return 0xffffff; // White (N)
    if (n <= 60) return 0x4caf50; // Green (G)
    return 0xff9800; // Orange (O)
  }
}
