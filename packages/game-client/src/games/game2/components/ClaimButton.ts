import { Container, Graphics, Text } from "pixi.js";
import gsap from "gsap";

export type ClaimType = "LINE" | "BINGO";
type ClaimState = "hidden" | "ready" | "submitted";

/**
 * Claim button for LINE or BINGO. Pulses when ready, disables when submitted.
 */
export class ClaimButton extends Container {
  private bg: Graphics;
  private btnText: Text;
  private claimType: ClaimType;
  private state: ClaimState = "hidden";
  private pulseTween: gsap.core.Tween | null = null;
  private onClaim: ((type: ClaimType) => void) | null = null;

  private static readonly COLORS = {
    LINE: { bg: 0x2196f3, text: "Rekke!" },
    BINGO: { bg: 0xf44336, text: "Bingo!" },
  };

  constructor(type: ClaimType, width = 140, height = 50) {
    super();
    this.claimType = type;
    const colors = ClaimButton.COLORS[type];

    this.bg = new Graphics();
    this.bg.roundRect(0, 0, width, height, 10);
    this.bg.fill(colors.bg);
    this.addChild(this.bg);

    this.btnText = new Text({
      text: colors.text,
      style: {
        fontFamily: "Arial",
        fontSize: 20,
        fontWeight: "bold",
        fill: 0xffffff,
        align: "center",
      },
    });
    this.btnText.anchor.set(0.5);
    this.btnText.x = width / 2;
    this.btnText.y = height / 2;
    this.addChild(this.btnText);

    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointerdown", () => {
      if (this.state === "ready" && this.onClaim) {
        this.setState("submitted");
        this.onClaim(this.claimType);
      }
    });

    this.visible = false;
  }

  setOnClaim(callback: (type: ClaimType) => void): void {
    this.onClaim = callback;
  }

  setState(state: ClaimState): void {
    this.state = state;
    this.visible = state !== "hidden";

    if (this.pulseTween) {
      this.pulseTween.kill();
      this.pulseTween = null;
      this.scale.set(1);
    }

    if (state === "ready") {
      this.alpha = 1;
      this.cursor = "pointer";
      this.pulseTween = gsap.to(this.scale, {
        x: 1.08,
        y: 1.08,
        duration: 0.5,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });
    } else if (state === "submitted") {
      this.alpha = 0.6;
      this.cursor = "default";
      this.btnText.text = "Sendt...";
    }
  }

  reset(): void {
    this.setState("hidden");
    this.btnText.text = ClaimButton.COLORS[this.claimType].text;
  }
}
