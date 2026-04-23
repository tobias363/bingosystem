import { Container, Sprite, Text, Assets, Texture } from "pixi.js";
import gsap from "gsap";
import { getBallAssetPath } from "./BallTube.js";

const BALL_SIZE = 170; // mockup .game-number-ring

/** Bridge-state shape used for pause-awareness. */
interface PauseAwareBridge {
  getState(): { isPaused: boolean };
}

/**
 * Large animated bingo ball displayed between the ball-tube and the center
 * panel — mockup `.game-number-ring` (170×170). Swaps the PNG texture on
 * every new draw so the ring colour matches the Bingo75 column of the
 * drawn number.
 *
 * Animation (mockup-parity):
 *  - scale(0.6) + alpha(0) on number swap
 *  - fade/scale back to 1 with back-overshoot (cubic-bezier 0.34, 1.56, 0.64, 1)
 *
 * Countdown mode + pause-awareness: unchanged from prior implementation
 * (Game1GamePlayPanel.SocketFlow.cs:672-696 mirrors the freeze).
 */
export class CenterBall extends Container {
  private ballSprite: Sprite | null = null;
  private currentTextureUrl: string | null = null;
  private numberText: Text;
  private drawProgressText: Text;
  private currentNumber: number | null = null;
  private idleTween: gsap.core.Tween | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private countdownDeadline = 0;
  private countdownRemainingMs = 0;
  private bridge: PauseAwareBridge | null = null;
  private isDestroyed = false;

  constructor(bridge?: PauseAwareBridge) {
    super();
    this.bridge = bridge ?? null;

    this.numberText = new Text({
      text: "",
      style: {
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: 50,
        fill: 0x1a0a0a,
        fontWeight: "800",
        align: "center",
        letterSpacing: -0.5,
      },
    });
    this.numberText.anchor.set(0.5);
    this.numberText.x = BALL_SIZE / 2 - 4;
    this.numberText.y = BALL_SIZE / 2 - 1;
    this.addChild(this.numberText);

    // Draw progress ("X/Y") — sits just below the ball so it follows the
    // idle float animation. Empty until setDrawProgress is called.
    this.drawProgressText = new Text({
      text: "",
      style: {
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: 15,
        fill: 0xffffff,
        fontWeight: "700",
        align: "center",
        letterSpacing: 0.5,
        dropShadow: {
          color: 0x000000,
          alpha: 0.8,
          blur: 4,
          distance: 1,
        },
      },
    });
    this.drawProgressText.anchor.set(0.5);
    this.drawProgressText.x = BALL_SIZE / 2;
    this.drawProgressText.y = BALL_SIZE + 16;
    this.addChild(this.drawProgressText);

    // Default sprite — red (central colour for idle/countdown), swapped per
    // drawn number by showNumber/setNumber.
    void this.swapTexture("/web/games/assets/game1/design/balls/red.png");
  }

  /**
   * Update the "X/Y" draw counter below the ball. Pass 0/0 or either arg
   * as 0/null to hide the label (e.g. between rounds).
   */
  setDrawProgress(drawCount: number, totalDrawCapacity: number): void {
    if (!totalDrawCapacity || totalDrawCapacity <= 0) {
      this.drawProgressText.text = "";
      return;
    }
    this.drawProgressText.text = `${drawCount}/${totalDrawCapacity}`;
  }

  private async swapTexture(url: string): Promise<void> {
    if (this.isDestroyed || url === this.currentTextureUrl) return;
    try {
      let tex = Assets.cache.get(url) as Texture | undefined;
      if (!tex) tex = (await Assets.load(url)) as Texture;
      if (this.isDestroyed) return;
      this.currentTextureUrl = url;
      if (this.ballSprite) {
        this.ballSprite.texture = tex;
      } else {
        this.ballSprite = new Sprite(tex);
        this.ballSprite.width = BALL_SIZE;
        this.ballSprite.height = BALL_SIZE;
        this.addChildAt(this.ballSprite, 0);
        this.startIdleFloat();
      }
    } catch {
      console.warn(`[CenterBall] Could not load ${url}`);
    }
  }

  /** Show a new drawn number with mockup-parity scale-in + overshoot. */
  showNumber(number: number): void {
    this.stopCountdown();
    this.currentNumber = number;
    this.numberText.text = String(number).padStart(2, "0");
    this.numberText.style.fontSize = 50;
    void this.swapTexture(getBallAssetPath(number));

    this.idleTween?.kill();

    // Mockup: scale 0.6 → 1 over 400ms with back overshoot, alpha 0 → 1.
    this.scale.set(0.6);
    this.alpha = 0;
    gsap.to(this, { alpha: 1, duration: 0.4, ease: "power2.out" });
    gsap.to(this.scale, {
      x: 1,
      y: 1,
      duration: 0.4,
      ease: "back.out(1.7)",
      onComplete: () => this.startIdleFloat(),
    });
  }

  /** Set number without animation (state restore). */
  setNumber(number: number | null): void {
    this.stopCountdown();
    this.currentNumber = number;
    this.numberText.text = number !== null ? String(number).padStart(2, "0") : "";
    this.numberText.style.fontSize = 50;
    if (number !== null) void this.swapTexture(getBallAssetPath(number));
    if (!this.idleTween) this.startIdleFloat();
  }

  getNumber(): number | null {
    return this.currentNumber;
  }

  startCountdown(millisUntilStart: number): void {
    this.stopCountdown();
    this.currentNumber = null;
    this.numberText.style.fontSize = 44;

    if (millisUntilStart <= 0) {
      this.numberText.text = "...";
      this.startIdleFloat();
      return;
    }

    this.countdownDeadline = Date.now() + millisUntilStart;
    this.countdownRemainingMs = millisUntilStart;
    this.updateCountdownDisplay();

    this.countdownInterval = setInterval(() => {
      if (this.isDestroyed) {
        this.stopCountdown();
        return;
      }
      if (this.bridge?.getState().isPaused) {
        this.countdownDeadline += 250;
        return;
      }
      this.updateCountdownDisplay();
    }, 250);

    this.startIdleFloat();
  }

  setBridge(bridge: PauseAwareBridge): void {
    this.bridge = bridge;
  }

  showWaiting(): void {
    this.stopCountdown();
    this.currentNumber = null;
    this.numberText.text = "...";
    this.numberText.style.fontSize = 44;
    this.startIdleFloat();
  }

  stopCountdown(): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  private updateCountdownDisplay(): void {
    const remaining = Math.ceil((this.countdownDeadline - Date.now()) / 1000);
    if (remaining <= 0) {
      this.numberText.text = "...";
      this.stopCountdown();
    } else {
      this.numberText.text = String(remaining);
    }
  }

  private startIdleFloat(): void {
    this.idleTween?.kill();
    this.idleTween = gsap.to(this, {
      y: this.y - 4,
      duration: 2.4,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
  }

  destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.isDestroyed = true;
    this.stopCountdown();
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.scale);
    this.idleTween = null;
    super.destroy(options);
  }
}
