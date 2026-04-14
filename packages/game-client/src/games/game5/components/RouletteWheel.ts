import { Container, Graphics, Text } from "pixi.js";
import gsap from "gsap";

const NUM_SEGMENTS = 8;
const SEGMENT_COLORS = [
  0xe63946, // Red
  0xf77f00, // Orange
  0xffba00, // Gold
  0x2a9d8f, // Teal
  0x457b9d, // Blue
  0x9b59b6, // Purple
  0xe63946, // Red
  0x2a9d8f, // Teal
];

/**
 * Visual roulette wheel for Game 5 (Spillorama Bingo).
 *
 * Port of Unity's Game5RouletteWheelController:
 * - Colored segments with numbers
 * - Spin animation: 5 full rotations + target (GSAP easeOutCubic)
 * - Center zoom when number lands
 * - Arrow pointer at top
 *
 * The roulette is purely visual — the drawn number is determined server-side.
 */
export class RouletteWheel extends Container {
  private wheelContainer: Container;
  private segmentNumbers: number[] = [];
  private centerText: Text;
  private centerBg: Graphics;
  private isSpinning = false;
  private radius: number;

  constructor(radius = 100) {
    super();
    this.radius = radius;

    // Wheel container (rotates)
    this.wheelContainer = new Container();
    this.addChild(this.wheelContainer);

    // Draw segments
    this.drawWheel();

    // Arrow pointer (top, static — does not rotate)
    const arrow = new Graphics();
    arrow.moveTo(0, -radius - 14);
    arrow.lineTo(-10, -radius - 28);
    arrow.lineTo(10, -radius - 28);
    arrow.closePath();
    arrow.fill(0xffe83d);
    arrow.stroke({ color: 0x790001, width: 1.5 });
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
   * Spin the wheel to land on the given number.
   * Assigns numbers to segments and animates rotation.
   */
  spinTo(drawnNumber: number): void {
    if (this.isSpinning) return;
    this.isSpinning = true;

    // Hide center display
    this.centerBg.visible = false;
    this.centerText.visible = false;

    // Assign drawn number to a random segment and fill rest
    const targetSegment = Math.floor(Math.random() * NUM_SEGMENTS);
    this.segmentNumbers = [];
    for (let i = 0; i < NUM_SEGMENTS; i++) {
      if (i === targetSegment) {
        this.segmentNumbers.push(drawnNumber);
      } else {
        // Random nearby numbers for visual variety
        this.segmentNumbers.push(Math.floor(Math.random() * 60) + 1);
      }
    }
    this.updateSegmentLabels();

    // Calculate target rotation
    const segmentAngle = 360 / NUM_SEGMENTS;
    // Arrow is at top (270° in math coords = -90° in screen coords)
    // We need the target segment's center to align with the top
    const targetAngle = targetSegment * segmentAngle + segmentAngle / 2;
    // 5 full rotations + offset to land on target
    const totalRotation = 360 * 5 + (360 - targetAngle);

    // Reset rotation for clean animation
    this.wheelContainer.rotation = 0;

    // Spin animation — matches Unity LeanTween.rotateZ with easeOutCubic
    gsap.to(this.wheelContainer, {
      rotation: (totalRotation * Math.PI) / 180,
      duration: 5,
      ease: "power3.out", // easeOutCubic equivalent
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

  private drawWheel(): void {
    const segmentAngle = (2 * Math.PI) / NUM_SEGMENTS;

    for (let i = 0; i < NUM_SEGMENTS; i++) {
      const startAngle = i * segmentAngle - Math.PI / 2;
      const endAngle = startAngle + segmentAngle;

      // Segment wedge
      const seg = new Graphics();
      seg.moveTo(0, 0);
      seg.arc(0, 0, this.radius, startAngle, endAngle);
      seg.closePath();
      seg.fill(SEGMENT_COLORS[i % SEGMENT_COLORS.length]);
      seg.stroke({ color: 0x1a0a0a, width: 1.5 });
      this.wheelContainer.addChild(seg);

      // Segment label (positioned at midpoint of arc)
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

    // Outer ring
    const ring = new Graphics();
    ring.circle(0, 0, this.radius);
    ring.stroke({ color: 0x790001, width: 3 });
    // Inner hub
    ring.circle(0, 0, this.radius * 0.15);
    ring.fill(0x2e0000);
    ring.stroke({ color: 0x790001, width: 2 });
    this.wheelContainer.addChild(ring);
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

    // Zoom-in animation — matches Unity HighlightBall (scale 7x → 1x)
    this.centerBg.scale.set(0.3);
    this.centerText.scale.set(0.3);
    gsap.to(this.centerBg.scale, {
      x: 1.8,
      y: 1.8,
      duration: 0.6,
      ease: "power2.out",
    });
    gsap.to(this.centerText.scale, {
      x: 1.8,
      y: 1.8,
      duration: 0.6,
      ease: "power2.out",
      onComplete: () => {
        // Shrink back
        gsap.to(this.centerBg.scale, { x: 1, y: 1, duration: 0.3, ease: "power2.in" });
        gsap.to(this.centerText.scale, { x: 1, y: 1, duration: 0.3, ease: "power2.in" });
      },
    });
  }
}
