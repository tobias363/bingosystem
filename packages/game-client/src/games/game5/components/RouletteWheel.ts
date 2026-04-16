import { Container, Graphics, Text, Sprite, Assets, Texture } from "pixi.js";
import gsap from "gsap";

const NUM_SEGMENTS = 8;

/** Fallback colors when sprite hasn't loaded yet. */
const SEGMENT_COLORS = [
  0xe63946, 0xf77f00, 0xffba00, 0x2a9d8f,
  0x457b9d, 0x9b59b6, 0xe63946, 0x2a9d8f,
];

const ASSET_BASE = import.meta.env.BASE_URL + "assets/game5/";

/**
 * Visual roulette wheel for Game 5 (Spillorama Bingo).
 *
 * Uses Unity sprite assets (Game5RouletteWheel.png, arrow, stand)
 * when available, with procedural fallback.
 */
export class RouletteWheel extends Container {
  private wheelContainer: Container;
  private segmentNumbers: number[] = [];
  private centerText: Text;
  private centerBg: Graphics;
  private isSpinning = false;
  private radius: number;
  private useSprites = false;

  constructor(radius = 100) {
    super();
    this.radius = radius;

    // Wheel container (rotates)
    this.wheelContainer = new Container();
    this.addChild(this.wheelContainer);

    // Draw procedural fallback immediately (replaced once sprites load)
    this.drawProceduralWheel();

    // Try to load sprites asynchronously
    this.loadSprites();

    // Arrow pointer (procedural fallback — replaced by sprite)
    const arrow = new Graphics();
    arrow.moveTo(0, -radius - 14);
    arrow.lineTo(-10, -radius - 28);
    arrow.lineTo(10, -radius - 28);
    arrow.closePath();
    arrow.fill(0xffe83d);
    arrow.stroke({ color: 0x790001, width: 1.5 });
    arrow.name = "arrow-fallback";
    this.addChild(arrow);

    // Center circle (shows drawn number after spin)
    this.centerBg = new Graphics();
    this.centerBg.circle(0, 0, radius * 0.28);
    this.centerBg.fill(0x790001);
    this.centerBg.stroke({ color: 0xffe83d, width: 2 });
    this.centerBg.visible = false;
    this.addChild(this.centerBg);

    this.centerText = new Text({
      text: "",
      style: {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: Math.floor(radius * 0.3),
        fill: 0xffe83d,
        fontWeight: "bold",
        align: "center",
      },
    });
    this.centerText.anchor.set(0.5);
    this.centerText.visible = false;
    this.addChild(this.centerText);
  }

  /**
   * Load Unity sprite assets and replace procedural graphics.
   */
  private async loadSprites(): Promise<void> {
    try {
      const [wheelTex, arrowTex, standTex] = await Promise.all([
        Assets.load<Texture>(ASSET_BASE + "roulette-wheel.png"),
        Assets.load<Texture>(ASSET_BASE + "roulette-arrow.png"),
        Assets.load<Texture>(ASSET_BASE + "roulette-stand.png"),
      ]);

      this.useSprites = true;

      // Remove procedural segments
      const toRemove = [...this.wheelContainer.children];
      for (const child of toRemove) child.destroy({ children: true });

      // Add wheel sprite (rotates)
      const wheelSprite = new Sprite(wheelTex);
      wheelSprite.anchor.set(0.5);
      const wheelScale = (this.radius * 2) / wheelTex.width;
      wheelSprite.scale.set(wheelScale);
      wheelSprite.name = "wheel-sprite";
      this.wheelContainer.addChild(wheelSprite);

      // Re-add segment labels on top of sprite
      this.addSegmentLabels();

      // Add stand sprite (static, behind everything but visually frames the wheel)
      const standSprite = new Sprite(standTex);
      standSprite.anchor.set(0.5);
      const standScale = (this.radius * 2.4) / standTex.width;
      standSprite.scale.set(standScale);
      standSprite.y = this.radius * 0.08; // slight offset for stand base
      // Insert behind wheel but in front of nothing — add to this, not wheelContainer
      this.addChildAt(standSprite, 0);

      // Replace procedural arrow with sprite arrow
      const fallbackArrow = this.getChildByName("arrow-fallback");
      if (fallbackArrow) fallbackArrow.destroy();

      const arrowSprite = new Sprite(arrowTex);
      arrowSprite.anchor.set(0.5, 1);
      const arrowScale = (this.radius * 0.3) / arrowTex.width;
      arrowSprite.scale.set(arrowScale);
      arrowSprite.y = -this.radius - 2;
      // Ensure arrow is on top of stand/wheel but below center display
      const centerIdx = this.getChildIndex(this.centerBg);
      this.addChildAt(arrowSprite, centerIdx);

    } catch (err) {
      console.warn("[RouletteWheel] Sprite load failed, using procedural fallback:", err);
    }
  }

  /**
   * Spin the wheel to land on the given number.
   */
  spinTo(drawnNumber: number): void {
    if (this.isSpinning) return;
    this.isSpinning = true;

    this.centerBg.visible = false;
    this.centerText.visible = false;

    // Assign drawn number to a random segment and fill rest
    const targetSegment = Math.floor(Math.random() * NUM_SEGMENTS);
    this.segmentNumbers = [];
    for (let i = 0; i < NUM_SEGMENTS; i++) {
      if (i === targetSegment) {
        this.segmentNumbers.push(drawnNumber);
      } else {
        this.segmentNumbers.push(Math.floor(Math.random() * 60) + 1);
      }
    }
    this.updateSegmentLabels();

    // Calculate target rotation
    const segmentAngle = 360 / NUM_SEGMENTS;
    const targetAngle = targetSegment * segmentAngle + segmentAngle / 2;
    const totalRotation = 360 * 5 + (360 - targetAngle);

    this.wheelContainer.rotation = 0;

    gsap.to(this.wheelContainer, {
      rotation: (totalRotation * Math.PI) / 180,
      duration: 5,
      ease: "power3.out",
      onComplete: () => {
        this.isSpinning = false;
        this.showCenter(drawnNumber);
      },
    });
  }

  /** Clear the wheel state for new round. */
  reset(): void {
    gsap.killTweensOf(this.wheelContainer);
    gsap.killTweensOf(this.centerBg);
    gsap.killTweensOf(this.centerBg.scale);
    this.wheelContainer.rotation = 0;
    this.centerBg.visible = false;
    this.centerText.visible = false;
    this.isSpinning = false;
  }

  // ── Private ───────────────────────────────────────────────────────────

  private drawProceduralWheel(): void {
    const segmentAngle = (2 * Math.PI) / NUM_SEGMENTS;

    for (let i = 0; i < NUM_SEGMENTS; i++) {
      const startAngle = i * segmentAngle - Math.PI / 2;
      const endAngle = startAngle + segmentAngle;

      const seg = new Graphics();
      seg.moveTo(0, 0);
      seg.arc(0, 0, this.radius, startAngle, endAngle);
      seg.closePath();
      seg.fill(SEGMENT_COLORS[i % SEGMENT_COLORS.length]);
      seg.stroke({ color: 0x1a0a0a, width: 1.5 });
      this.wheelContainer.addChild(seg);
    }

    this.addSegmentLabels();

    // Outer ring + inner hub
    const ring = new Graphics();
    ring.circle(0, 0, this.radius);
    ring.stroke({ color: 0x790001, width: 3 });
    ring.circle(0, 0, this.radius * 0.15);
    ring.fill(0x2e0000);
    ring.stroke({ color: 0x790001, width: 2 });
    this.wheelContainer.addChild(ring);
  }

  private addSegmentLabels(): void {
    const segmentAngle = (2 * Math.PI) / NUM_SEGMENTS;
    for (let i = 0; i < NUM_SEGMENTS; i++) {
      const startAngle = i * segmentAngle - Math.PI / 2;
      const midAngle = startAngle + segmentAngle / 2;
      const labelR = this.radius * 0.68;
      const label = new Text({
        text: "?",
        style: {
          fontFamily: "Arial",
          fontSize: Math.floor(this.radius * 0.18),
          fill: 0xffffff,
          fontWeight: "bold",
        },
      });
      label.anchor.set(0.5);
      label.x = Math.cos(midAngle) * labelR;
      label.y = Math.sin(midAngle) * labelR;
      label.rotation = midAngle + Math.PI / 2;
      label.name = `seg-label-${i}`;
      this.wheelContainer.addChild(label);
    }
  }

  private updateSegmentLabels(): void {
    for (let i = 0; i < NUM_SEGMENTS; i++) {
      const label = this.wheelContainer.getChildByName(`seg-label-${i}`) as Text | null;
      if (label) {
        label.text = String(this.segmentNumbers[i]);
      }
    }
  }

  private showCenter(number: number): void {
    this.centerText.text = String(number);
    this.centerBg.visible = true;
    this.centerText.visible = true;

    this.centerBg.scale.set(0.3);
    this.centerText.scale.set(0.3);
    gsap.to(this.centerBg.scale, {
      x: 1.8, y: 1.8, duration: 0.6, ease: "power2.out",
    });
    gsap.to(this.centerText.scale, {
      x: 1.8, y: 1.8, duration: 0.6, ease: "power2.out",
      onComplete: () => {
        gsap.to(this.centerBg.scale, { x: 1, y: 1, duration: 0.3, ease: "power2.in" });
        gsap.to(this.centerText.scale, { x: 1, y: 1, duration: 0.3, ease: "power2.in" });
      },
    });
  }
}
