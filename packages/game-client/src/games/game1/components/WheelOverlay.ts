import { Container, Graphics, Text } from "pixi.js";
import gsap from "gsap";

/**
 * BIN-690 PR-M6: Wheel of Fortune overlay — wired to M6 protocol.
 *
 * Trigger payload (from M2 MiniGameWheelEngine):
 *   `{ totalBuckets: number, prizes: Array<{amount, buckets}>, spinCount: 1 }`
 *
 * Choice payload: `{}` (Wheel has no player decision; the click on "Snurr"
 * is just the signal that the player wants to start the spin).
 *
 * Result payload:
 *   `{ winningBucketIndex, prizeGroupIndex, amountKroner, totalBuckets, animationSeed }`
 *
 * Unity parity (legacy reference preserved — visuals unchanged):
 *   - `SpinWheelScript.cs:174,180,186` — 50 physical segments × 7.2° per segment
 *   - `SpinWheelScript.cs:85` — per-frame decay `rotationSpeed *= rMultiplier`
 *   - `SpinWheelScript.cs:199,236` — final jitter ± 3.25°
 *   - `SpinWheelScript.cs:490,497` — pause-hook
 *
 * The wheel is rendered with `totalBuckets` segments (defaulting to 50).
 * Segment colours are HSL-rotated; labels repeat modulo `prizes.length` so
 * a shorter prize list still covers the whole wheel.
 */

const DEFAULT_NUM_SEGMENTS = 50;
const INITIAL_Z_ROTATION_DEG = -3.6;
const STOP_JITTER_DEG = 3.25;
const R_MULTIPLIER = 0.96;
const STOP_SPEED_THRESHOLD = 0.005;
const AUTO_SPIN_SECONDS = 10;
const AUTO_DISMISS_AFTER_RESULT_SECONDS = 4;

function hslToInt(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return (r << 16) | (g << 8) | b;
}

interface PauseAwareBridge {
  getState(): { isPaused: boolean };
}

/** Trigger-payload shape (matches M2 MiniGameWheelEngine.ts:trigger.payload). */
interface WheelTriggerPayload {
  totalBuckets?: number;
  prizes?: Array<{ amount: number; buckets: number }>;
  spinCount?: number;
}

/** Result-payload shape (matches M2 WheelResultJson). */
interface WheelResultJson {
  winningBucketIndex: number;
  prizeGroupIndex?: number;
  amountKroner: number;
  totalBuckets: number;
  animationSeed?: number;
}

export class WheelOverlay extends Container {
  private backdrop: Graphics;
  private wheelContainer: Container;
  private wheelInner: Container;
  private spinBtn: Container;
  private spinBtnText: Text;
  private resultText: Text;
  private titleText: Text;
  private timerText: Text;
  private errorText: Text;
  private prizeLabels: number[] = [];
  private numSegments: number = DEFAULT_NUM_SEGMENTS;
  private isSpinning = false;
  private radius: number;
  private onChoice: ((choiceJson: Readonly<Record<string, unknown>>) => void) | null = null;
  private onDismiss: (() => void) | null = null;
  private autoSpinTimer: ReturnType<typeof setInterval> | null = null;
  private autoSpinCountdown = AUTO_SPIN_SECONDS;
  private rafId: number | null = null;
  private rotationSpeed = 0;
  private bridge: PauseAwareBridge | null;

  constructor(screenWidth: number, screenHeight: number, bridge?: PauseAwareBridge) {
    super();
    this.bridge = bridge ?? null;
    this.radius = Math.min(140, Math.floor(screenHeight * 0.25));

    this.backdrop = new Graphics();
    this.backdrop.rect(0, 0, screenWidth, screenHeight);
    this.backdrop.fill({ color: 0x000000, alpha: 0.75 });
    this.backdrop.eventMode = "static";
    this.addChild(this.backdrop);

    this.titleText = new Text({
      text: "LYKKEHJUL!",
      style: {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 36,
        fontWeight: "bold",
        fill: 0xffe83d,
        align: "center",
      },
    });
    this.titleText.anchor.set(0.5);
    this.titleText.x = screenWidth / 2;
    this.titleText.y = 50;
    this.addChild(this.titleText);

    this.wheelContainer = new Container();
    this.wheelContainer.x = screenWidth / 2;
    this.wheelContainer.y = screenHeight / 2 - 20;
    this.addChild(this.wheelContainer);
    this.wheelInner = new Container();
    this.wheelContainer.addChild(this.wheelInner);
    this.drawWheel();

    const arrow = new Graphics();
    arrow.moveTo(0, -this.radius - 14);
    arrow.lineTo(-10, -this.radius - 28);
    arrow.lineTo(10, -this.radius - 28);
    arrow.closePath();
    arrow.fill(0xffe83d);
    arrow.stroke({ color: 0x790001, width: 1.5 });
    arrow.x = screenWidth / 2;
    arrow.y = screenHeight / 2 - 20;
    this.addChild(arrow);

    this.timerText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 18, fill: 0xffffff, align: "center" },
    });
    this.timerText.anchor.set(0.5);
    this.timerText.x = screenWidth / 2;
    this.timerText.y = screenHeight / 2 + this.radius + 50;
    this.addChild(this.timerText);

    this.spinBtn = new Container();
    const btnBg = new Graphics();
    btnBg.roundRect(0, 0, 180, 50, 12);
    btnBg.fill(0x790001);
    btnBg.stroke({ color: 0xffe83d, width: 2 });
    this.spinBtn.addChild(btnBg);
    this.spinBtnText = new Text({
      text: "SPINN",
      style: { fontFamily: "Arial", fontSize: 22, fontWeight: "bold", fill: 0xffe83d, align: "center" },
    });
    this.spinBtnText.anchor.set(0.5);
    this.spinBtnText.x = 90;
    this.spinBtnText.y = 25;
    this.spinBtn.addChild(this.spinBtnText);
    this.spinBtn.x = screenWidth / 2 - 90;
    this.spinBtn.y = screenHeight / 2 + this.radius + 80;
    this.spinBtn.eventMode = "static";
    this.spinBtn.cursor = "pointer";
    this.spinBtn.on("pointerdown", () => this.handleSpinClick());
    this.addChild(this.spinBtn);

    this.resultText = new Text({
      text: "",
      style: {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 28,
        fontWeight: "bold",
        fill: 0xffe83d,
        align: "center",
      },
    });
    this.resultText.anchor.set(0.5);
    this.resultText.x = screenWidth / 2;
    this.resultText.y = screenHeight / 2 + this.radius + 150;
    this.resultText.visible = false;
    this.addChild(this.resultText);

    this.errorText = new Text({
      text: "",
      style: {
        fontFamily: "Arial",
        fontSize: 16,
        fill: 0xff6464,
        align: "center",
      },
    });
    this.errorText.anchor.set(0.5);
    this.errorText.x = screenWidth / 2;
    this.errorText.y = screenHeight / 2 + this.radius + 180;
    this.errorText.visible = false;
    this.addChild(this.errorText);

    this.visible = false;
  }

  setOnChoice(callback: (choiceJson: Readonly<Record<string, unknown>>) => void): void {
    this.onChoice = callback;
  }

  setOnDismiss(callback: () => void): void {
    this.onDismiss = callback;
  }

  setBridge(bridge: PauseAwareBridge): void {
    this.bridge = bridge;
  }

  /**
   * Handle `mini_game:trigger` payload from server. Re-renders the wheel with
   * the actual prize layout and starts the auto-spin countdown.
   */
  show(triggerPayload: Readonly<Record<string, unknown>>): void {
    const data = triggerPayload as unknown as WheelTriggerPayload;
    // Derive numSegments from totalBuckets (default 50 for Unity parity).
    const total =
      typeof data.totalBuckets === "number" && data.totalBuckets >= 1
        ? data.totalBuckets
        : DEFAULT_NUM_SEGMENTS;
    this.numSegments = total;
    // Flatten prizes into a per-segment label list (prize.amount repeated
    // `prize.buckets` times). Falls back to empty labels if the payload is
    // malformed — we still render segments for visual continuity.
    this.prizeLabels = [];
    if (Array.isArray(data.prizes)) {
      for (const p of data.prizes) {
        if (typeof p?.amount !== "number" || typeof p?.buckets !== "number") continue;
        for (let i = 0; i < p.buckets; i += 1) this.prizeLabels.push(p.amount);
      }
    }
    // Pad/trim to exactly numSegments so every segment has a label slot.
    while (this.prizeLabels.length < this.numSegments) {
      this.prizeLabels.push(this.prizeLabels[0] ?? 0);
    }
    this.prizeLabels = this.prizeLabels.slice(0, this.numSegments);

    this.drawWheel();
    this.isSpinning = false;
    this.spinBtn.visible = true;
    this.spinBtnText.text = "SPINN";
    this.resultText.visible = false;
    this.errorText.visible = false;
    this.visible = true;

    this.autoSpinCountdown = AUTO_SPIN_SECONDS;
    this.timerText.text = `Auto-spinn om ${this.autoSpinCountdown}s`;
    this.autoSpinTimer = setInterval(() => {
      if (this.bridge?.getState().isPaused) return;
      this.autoSpinCountdown -= 1;
      if (this.autoSpinCountdown <= 0) {
        this.clearAutoTimer();
        this.timerText.text = "";
        this.handleSpinClick();
      } else {
        this.timerText.text = `Auto-spinn om ${this.autoSpinCountdown}s`;
      }
    }, 1000);
  }

  /**
   * Handle `mini_game:result` payload. Spins the wheel to the server-picked
   * `winningBucketIndex`, then displays the payout text and auto-dismisses.
   */
  animateResult(resultJson: Readonly<Record<string, unknown>>, payoutCents: number): void {
    const result = resultJson as unknown as WheelResultJson;
    this.isSpinning = true;
    this.spinBtn.visible = false;
    this.errorText.visible = false;
    this.clearAutoTimer();
    this.timerText.text = "";

    const segmentAngleDeg = 360 / this.numSegments;
    const targetAngleDeg =
      result.winningBucketIndex * segmentAngleDeg + segmentAngleDeg / 2;
    const jitter = (Math.random() * 2 - 1) * STOP_JITTER_DEG;
    const finalAngleDeg = 360 * 6 + (360 - targetAngleDeg) + jitter;

    this.wheelInner.rotation = 0;
    this.rotationSpeed = finalAngleDeg * (1 - R_MULTIPLIER);
    let accumulatedDeg = 0;

    const tick = (): void => {
      if (this.bridge?.getState().isPaused) {
        this.rafId = requestAnimationFrame(tick);
        return;
      }
      accumulatedDeg += this.rotationSpeed;
      this.wheelInner.rotation = (accumulatedDeg * Math.PI) / 180;
      this.rotationSpeed *= R_MULTIPLIER;
      if (this.rotationSpeed <= STOP_SPEED_THRESHOLD) {
        this.wheelInner.rotation = (finalAngleDeg * Math.PI) / 180;
        this.rafId = null;
        this.onSpinComplete(result, payoutCents);
        return;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /**
   * Fail-closed display of a choice-error. Since Wheel sends `{}` immediately
   * on click, the error state lets the player retry without dismissing the
   * overlay (server tracks completion idempotently).
   */
  showChoiceError(err: { code: string; message: string }): void {
    this.errorText.text = `Feil: ${err.message}`;
    this.errorText.visible = true;
    // Re-enable spin button so player can retry.
    this.isSpinning = false;
    this.spinBtn.visible = true;
  }

  private onSpinComplete(result: WheelResultJson, payoutCents: number): void {
    this.isSpinning = false;
    // Prefer explicit amountKroner from result; fall back to payoutCents/100.
    const amountKroner =
      typeof result.amountKroner === "number"
        ? result.amountKroner
        : Math.round(payoutCents / 100);
    this.resultText.text = `Du vant ${amountKroner} kr!`;
    this.resultText.visible = true;

    gsap.delayedCall(AUTO_DISMISS_AFTER_RESULT_SECONDS, () => {
      this.visible = false;
      this.onDismiss?.();
    });
  }

  destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.clearAutoTimer();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    gsap.killTweensOf(this.wheelInner);
    super.destroy(options);
  }

  private handleSpinClick(): void {
    if (this.isSpinning) return;
    this.clearAutoTimer();
    this.timerText.text = "";
    this.errorText.visible = false;
    // Wheel has no choice UI — send empty choiceJson. Server decides the
    // outcome; we just signal the player is ready.
    this.onChoice?.({});
  }

  private clearAutoTimer(): void {
    if (this.autoSpinTimer) {
      clearInterval(this.autoSpinTimer);
      this.autoSpinTimer = null;
    }
  }

  private drawWheel(): void {
    this.wheelInner.removeChildren();
    const segmentAngleRad = (2 * Math.PI) / this.numSegments;
    const initialOffsetRad = (INITIAL_Z_ROTATION_DEG * Math.PI) / 180;

    for (let i = 0; i < this.numSegments; i++) {
      const startAngle = i * segmentAngleRad - Math.PI / 2 + initialOffsetRad;
      const endAngle = startAngle + segmentAngleRad;
      const hue = (i * 360) / this.numSegments;
      const lightness = i % 2 === 0 ? 0.45 : 0.55;
      const color = hslToInt(hue, 0.7, lightness);

      const seg = new Graphics();
      seg.moveTo(0, 0);
      seg.arc(0, 0, this.radius, startAngle, endAngle);
      seg.closePath();
      seg.fill(color);
      seg.stroke({ color: 0x1a0a0a, width: 0.5 });
      this.wheelInner.addChild(seg);

      const prize = this.prizeLabels[i] ?? 0;
      const midAngle = startAngle + segmentAngleRad / 2;
      const labelR = this.radius * 0.72;
      const label = new Text({
        text: `${prize}`,
        style: {
          fontFamily: "Arial",
          fontSize: Math.max(8, Math.floor(this.radius * 0.07)),
          fill: 0xffffff,
          fontWeight: "bold",
        },
      });
      label.anchor.set(0.5);
      label.x = Math.cos(midAngle) * labelR;
      label.y = Math.sin(midAngle) * labelR;
      label.rotation = midAngle + Math.PI / 2;
      this.wheelInner.addChild(label);
    }

    const ring = new Graphics();
    ring.circle(0, 0, this.radius);
    ring.stroke({ color: 0x790001, width: 3 });
    ring.circle(0, 0, this.radius * 0.12);
    ring.fill(0x2e0000);
    ring.stroke({ color: 0x790001, width: 2 });
    this.wheelInner.addChild(ring);
  }
}

/** Test-only accessor for default segment count. */
export const __WheelOverlay_DEFAULT_NUM_SEGMENTS__ = DEFAULT_NUM_SEGMENTS;
