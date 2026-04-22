/**
 * BIN-690 PR-M6: Oddsen overlay — new component for M5 MiniGameOddsenEngine.
 *
 * Trigger payload:
 *   `{ validNumbers: [55, 56, 57], potSmallNok, potLargeNok, resolveAtDraw }`
 *
 * Choice payload: `{ chosenNumber: number }` where `chosenNumber ∈ validNumbers`.
 *
 * Result payload (from handleChoice — IMMEDIATE after choice):
 *   `{ chosenNumber, oddsenStateId, chosenForGameId, ticketSizeAtWin,
 *      potAmountNokIfHit, validNumbers, payoutDeferred: true }`
 *   — `payoutCents === 0` at this phase. Oddsen is CROSS-ROUND: the actual
 *   payout arrives via a SECOND `mini_game:result` event fired when the next
 *   game reaches `resolveAtDraw` (default draw #57).
 *
 * UX implication: after the player picks, the overlay switches to a "Valg
 * registrert. Resultat i neste spill." state and the overlay auto-dismisses
 * after a few seconds. The final hit/miss + payout are delivered later via a
 * new `mini_game:trigger` → `animateResult` cycle OR (depending on backend
 * wiring) a standalone `mini_game:result` with the resolved outcome.
 *
 * This overlay supports BOTH paths:
 *   - First trigger → show 3 number buttons → choice → "Venter på neste spill" state.
 *   - A later `animateResult` with `payoutDeferred: true` → keep the waiting state.
 *   - A later `animateResult` with `resolvedOutcome: "hit"|"miss"` → show outcome.
 *
 * Replaces the legacy MysteryGameOverlay (which was for a different game mode
 * and is removed in M6).
 */

import { Container, Graphics, Text } from "pixi.js";
import gsap from "gsap";

const BUTTON_SIZE = 96;
const BUTTON_GAP = 24;
const AUTO_SELECT_SECONDS = 20;
const AUTO_DISMISS_AFTER_WAITING_SECONDS = 6;
const AUTO_DISMISS_AFTER_OUTCOME_SECONDS = 5;

interface OddsenTriggerPayload {
  validNumbers?: number[];
  potSmallNok?: number;
  potLargeNok?: number;
  resolveAtDraw?: number;
}

interface OddsenChoiceResultJson {
  chosenNumber?: number;
  oddsenStateId?: string;
  chosenForGameId?: string;
  ticketSizeAtWin?: "small" | "large";
  potAmountNokIfHit?: number;
  validNumbers?: number[];
  payoutDeferred?: true;
  // For future "resolved" result events — not set by M5 handleChoice but
  // supported here for forward compat with the resolve-phase result emit.
  resolvedOutcome?: "hit" | "miss" | "expired";
  potAmountKroner?: number;
}

export class OddsenOverlay extends Container {
  private bg: Graphics;
  private title: Text;
  private subtitle: Text;
  private potText: Text;
  private resolveHintText: Text;
  private resultText: Text;
  private errorText: Text;
  private timerText: Text;
  private buttons: Container[] = [];
  private validNumbers: number[] = [];
  private chosenNumber: number | null = null;
  private choiceSent = false;
  private resolved = false;
  private onChoice: ((choiceJson: Readonly<Record<string, unknown>>) => void) | null = null;
  private onDismiss: (() => void) | null = null;
  private autoTimer: ReturnType<typeof setInterval> | null = null;
  private autoCountdown = AUTO_SELECT_SECONDS;
  private screenW: number;
  private screenH: number;

  constructor(w: number, h: number) {
    super();
    this.screenW = w;
    this.screenH = h;

    this.bg = new Graphics();
    this.bg.rect(0, 0, w, h);
    this.bg.fill({ color: 0x000000, alpha: 0.85 });
    this.bg.eventMode = "static";
    this.addChild(this.bg);

    this.title = new Text({
      text: "ODDSEN",
      style: { fontFamily: "Arial", fontSize: 32, fontWeight: "bold", fill: 0xffe83d },
    });
    this.title.anchor.set(0.5);
    this.title.x = w / 2;
    this.title.y = h * 0.16;
    this.addChild(this.title);

    this.subtitle = new Text({
      text: "Velg et tall — du vinner hvis det trekkes i neste spill!",
      style: { fontFamily: "Arial", fontSize: 16, fill: 0xcccccc, align: "center" },
    });
    this.subtitle.anchor.set(0.5);
    this.subtitle.x = w / 2;
    this.subtitle.y = h * 0.23;
    this.addChild(this.subtitle);

    this.potText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 14, fill: 0xffffff },
    });
    this.potText.anchor.set(0.5);
    this.potText.x = w / 2;
    this.potText.y = h * 0.28;
    this.addChild(this.potText);

    this.resolveHintText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 13, fill: 0x999999 },
    });
    this.resolveHintText.anchor.set(0.5);
    this.resolveHintText.x = w / 2;
    this.resolveHintText.y = h * 0.32;
    this.addChild(this.resolveHintText);

    this.resultText = new Text({
      text: "",
      style: {
        fontFamily: "Arial",
        fontSize: 22,
        fontWeight: "bold",
        fill: 0xffe83d,
        align: "center",
        wordWrap: true,
        wordWrapWidth: w * 0.7,
      },
    });
    this.resultText.anchor.set(0.5);
    this.resultText.x = w / 2;
    this.resultText.y = h * 0.64;
    this.resultText.visible = false;
    this.addChild(this.resultText);

    this.errorText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 14, fill: 0xff6464 },
    });
    this.errorText.anchor.set(0.5);
    this.errorText.x = w / 2;
    this.errorText.y = h * 0.86;
    this.errorText.visible = false;
    this.addChild(this.errorText);

    this.timerText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 16, fill: 0xffffff },
    });
    this.timerText.anchor.set(0.5);
    this.timerText.x = w / 2;
    this.timerText.y = h * 0.92;
    this.addChild(this.timerText);

    this.visible = false;
  }

  setOnChoice(callback: (choiceJson: Readonly<Record<string, unknown>>) => void): void {
    this.onChoice = callback;
  }

  setOnDismiss(callback: () => void): void {
    this.onDismiss = callback;
  }

  show(triggerPayload: Readonly<Record<string, unknown>>): void {
    const data = triggerPayload as unknown as OddsenTriggerPayload;
    this.validNumbers = Array.isArray(data.validNumbers) && data.validNumbers.length > 0
      ? data.validNumbers.slice()
      : [55, 56, 57];

    this.chosenNumber = null;
    this.choiceSent = false;
    this.resolved = false;
    this.resultText.visible = false;
    this.errorText.visible = false;

    // Pot preview (ticket-size is unknown client-side — show both).
    const potSmall = typeof data.potSmallNok === "number" ? data.potSmallNok : null;
    const potLarge = typeof data.potLargeNok === "number" ? data.potLargeNok : null;
    if (potSmall !== null && potLarge !== null) {
      this.potText.text =
        potSmall === potLarge
          ? `Premiepott: ${potSmall} kr`
          : `Premiepott: ${potSmall} kr (small) / ${potLarge} kr (large)`;
    } else if (potSmall !== null) {
      this.potText.text = `Premiepott: ${potSmall} kr`;
    } else {
      this.potText.text = "";
    }

    const resolveAt = typeof data.resolveAtDraw === "number" ? data.resolveAtDraw : 57;
    this.resolveHintText.text = `Avgjøres ved trekning #${resolveAt} i neste spill`;

    // Build number buttons.
    for (const b of this.buttons) b.destroy({ children: true });
    this.buttons = [];

    const count = this.validNumbers.length;
    const gridW = count * BUTTON_SIZE + (count - 1) * BUTTON_GAP;
    const startX = (this.screenW - gridW) / 2;
    const y = this.screenH * 0.47;

    for (let i = 0; i < count; i++) {
      const n = this.validNumbers[i]!;
      const btn = this.createNumberButton(n);
      btn.x = startX + i * (BUTTON_SIZE + BUTTON_GAP) + BUTTON_SIZE / 2;
      btn.y = y + BUTTON_SIZE / 2;
      this.addChild(btn);
      this.buttons.push(btn);
    }

    this.visible = true;

    this.autoCountdown = AUTO_SELECT_SECONDS;
    this.timerText.text = `Auto-valg om ${this.autoCountdown}s`;
    this.autoTimer = setInterval(() => {
      this.autoCountdown -= 1;
      if (this.autoCountdown <= 0) {
        this.clearAutoTimer();
        this.timerText.text = "";
        const randomIdx = Math.floor(Math.random() * this.validNumbers.length);
        this.selectNumber(this.validNumbers[randomIdx]!);
      } else {
        this.timerText.text = `Auto-valg om ${this.autoCountdown}s`;
      }
    }, 1000);
  }

  animateResult(resultJson: Readonly<Record<string, unknown>>, payoutCents: number): void {
    const result = resultJson as unknown as OddsenChoiceResultJson;
    this.clearAutoTimer();
    this.timerText.text = "";
    this.errorText.visible = false;

    // Two-phase dispatch:
    //   Phase 1 (choice-phase, `payoutDeferred: true`, payoutCents === 0):
    //     Show "Valg registrert. Resultat i neste spill." state.
    //   Phase 2 (resolve-phase, `resolvedOutcome` set):
    //     Show hit/miss and auto-dismiss.
    if (result.payoutDeferred === true && !result.resolvedOutcome) {
      this.showWaitingState(result);
      return;
    }

    // Resolved outcome path.
    this.resolved = true;
    this.disableButtons();

    const outcome = result.resolvedOutcome ?? (payoutCents > 0 ? "hit" : "miss");
    const potKroner = typeof result.potAmountKroner === "number"
      ? result.potAmountKroner
      : Math.round(payoutCents / 100);

    if (outcome === "hit") {
      this.resultText.text = `TREFF! Tall ${result.chosenNumber ?? this.chosenNumber ?? "?"} ble trukket.\nDu vant ${potKroner} kr!`;
      this.resultText.style.fill = 0xffe83d;
    } else if (outcome === "miss") {
      this.resultText.text = `Bom — tall ${result.chosenNumber ?? this.chosenNumber ?? "?"} ble ikke trukket.`;
      this.resultText.style.fill = 0xcccccc;
    } else {
      // expired
      this.resultText.text = "Oddsen utløp uten resultat.";
      this.resultText.style.fill = 0x999999;
    }
    this.resultText.visible = true;

    setTimeout(
      () => this.onDismiss?.(),
      AUTO_DISMISS_AFTER_OUTCOME_SECONDS * 1000,
    );
  }

  showChoiceError(err: { code: string; message: string }): void {
    this.errorText.text = `Feil: ${err.message}`;
    this.errorText.visible = true;
    this.choiceSent = false;
    // Re-enable buttons so player can retry.
    for (const b of this.buttons) {
      b.eventMode = "static";
      b.cursor = "pointer";
      b.alpha = 1;
    }
  }

  destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.clearAutoTimer();
    gsap.killTweensOf(this);
    super.destroy(options);
  }

  private showWaitingState(result: OddsenChoiceResultJson): void {
    this.disableButtons();
    // Highlight the chosen number button.
    if (typeof result.chosenNumber === "number") {
      const idx = this.validNumbers.indexOf(result.chosenNumber);
      if (idx >= 0) {
        const btn = this.buttons[idx];
        if (btn) {
          gsap.to(btn.scale, { x: 1.15, y: 1.15, duration: 0.3 });
          btn.alpha = 1;
        }
      }
    }
    const potNok = typeof result.potAmountNokIfHit === "number"
      ? result.potAmountNokIfHit
      : 0;
    this.resultText.text =
      `Valg registrert: tall ${result.chosenNumber ?? this.chosenNumber ?? "?"}.\n` +
      `Resultat avgjøres i neste spill — mulig premie ${potNok} kr.`;
    this.resultText.style.fill = 0xffe83d;
    this.resultText.visible = true;

    // Auto-dismiss the overlay after a few seconds — the resolution event
    // will fire its own fresh trigger/result cycle if/when it happens.
    setTimeout(
      () => this.onDismiss?.(),
      AUTO_DISMISS_AFTER_WAITING_SECONDS * 1000,
    );
  }

  private selectNumber(n: number): void {
    if (this.resolved || this.choiceSent) return;
    if (!this.validNumbers.includes(n)) return;
    this.choiceSent = true;
    this.chosenNumber = n;
    this.clearAutoTimer();
    this.timerText.text = "";
    this.disableButtons();
    // Visually mark the picked button.
    const idx = this.validNumbers.indexOf(n);
    if (idx >= 0) {
      const btn = this.buttons[idx];
      if (btn) {
        gsap.to(btn.scale, { x: 1.15, y: 1.15, duration: 0.2 });
      }
    }
    this.onChoice?.({ chosenNumber: n });
  }

  private disableButtons(): void {
    for (const b of this.buttons) {
      b.eventMode = "none";
      b.cursor = "default";
      if (b.alpha > 0.5) b.alpha = 0.6;
    }
    // Re-highlight chosen to alpha=1 if applicable.
    if (this.chosenNumber !== null) {
      const idx = this.validNumbers.indexOf(this.chosenNumber);
      if (idx >= 0) {
        const btn = this.buttons[idx];
        if (btn) btn.alpha = 1;
      }
    }
  }

  private clearAutoTimer(): void {
    if (this.autoTimer) {
      clearInterval(this.autoTimer);
      this.autoTimer = null;
    }
  }

  private createNumberButton(n: number): Container {
    const c = new Container();
    c.eventMode = "static";
    c.cursor = "pointer";

    const bg = new Graphics();
    bg.roundRect(-BUTTON_SIZE / 2, -BUTTON_SIZE / 2, BUTTON_SIZE, BUTTON_SIZE, 16);
    bg.fill(0x790001);
    bg.stroke({ color: 0xffe83d, width: 3 });
    c.addChild(bg);

    const label = new Text({
      text: `${n}`,
      style: { fontFamily: "Arial", fontSize: 42, fontWeight: "bold", fill: 0xffe83d },
    });
    label.anchor.set(0.5);
    c.addChild(label);

    c.on("pointerdown", () => this.selectNumber(n));
    c.on("pointerover", () => {
      if (!this.choiceSent && !this.resolved) gsap.to(c.scale, { x: 1.08, y: 1.08, duration: 0.15 });
    });
    c.on("pointerout", () => {
      if (!this.choiceSent && !this.resolved) gsap.to(c.scale, { x: 1, y: 1, duration: 0.15 });
    });

    return c;
  }
}

/** Exposed for tests. */
export const __Oddsen_AUTO_SELECT_SECONDS__ = AUTO_SELECT_SECONDS;
export const __Oddsen_AUTO_DISMISS_AFTER_WAITING_SECONDS__ = AUTO_DISMISS_AFTER_WAITING_SECONDS;
