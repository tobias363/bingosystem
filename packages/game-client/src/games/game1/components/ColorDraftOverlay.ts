/**
 * BIN-690 PR-M6: Color Draft overlay — wired to M6 protocol.
 *
 * Trigger payload (from M4 MiniGameColordraftEngine):
 *   `{ numberOfSlots, targetColor, slotColors: string[], winPrizeNok, consolationPrizeNok }`
 *
 * Choice payload: `{ chosenIndex: number }`
 *
 * Result payload:
 *   `{ chosenIndex, chosenColor, targetColor, matched, prizeAmountKroner, allSlotColors, numberOfSlots }`
 *
 * UX: the player sees `targetColor` prominently, then picks the slot whose
 * colour matches. Match ⇒ winPrizeNok; mismatch ⇒ consolationPrizeNok (usually
 * 0). Auto-select after 10 s if the player doesn't choose.
 *
 * Unlike Chest, here slot colours ARE visible in trigger — Color Draft is an
 * observation puzzle, not a hidden-information game. The server is still
 * authoritative via seeded-RNG reconstruction in `handleChoice`.
 */

import { Container, Graphics, Text } from "pixi.js";
import gsap from "gsap";

const CARD_SIZE = 68;
const CARD_GAP = 12;
const AUTO_SELECT_SECONDS = 10;
const AUTO_DISMISS_AFTER_RESULT_SECONDS = 4;

/** Map server-side palette-name → UI fill colour. Graceful fallback to gray. */
const PALETTE_COLOR_MAP: Readonly<Record<string, number>> = {
  yellow: 0xf5c103,
  gul: 0xf5c103,
  blue: 0x3a7adf,
  blaa: 0x3a7adf,
  "blå": 0x3a7adf,
  red: 0xd20000,
  rod: 0xd20000,
  "rød": 0xd20000,
  green: 0x199600,
  gronn: 0x199600,
  "grønn": 0x199600,
  purple: 0xaf91ff,
  lilla: 0xaf91ff,
  orange: 0xff6400,
  oransje: 0xff6400,
  white: 0xffffff,
  hvit: 0xffffff,
  black: 0x333333,
  svart: 0x333333,
  pink: 0xff69b4,
  rosa: 0xff69b4,
  brown: 0x8b4513,
  brun: 0x8b4513,
};

function colorNameToFill(name: string): number {
  const key = name.toLowerCase();
  return PALETTE_COLOR_MAP[key] ?? 0x888888;
}

/** Norsk label for visning. Faller tilbake til input-navnet hvis ukjent. */
const LABEL_MAP: Readonly<Record<string, string>> = {
  yellow: "Gul",
  gul: "Gul",
  blue: "Blå",
  "blå": "Blå",
  blaa: "Blå",
  red: "Rød",
  "rød": "Rød",
  rod: "Rød",
  green: "Grønn",
  "grønn": "Grønn",
  gronn: "Grønn",
  purple: "Lilla",
  lilla: "Lilla",
  orange: "Oransje",
  oransje: "Oransje",
  white: "Hvit",
  hvit: "Hvit",
  black: "Svart",
  svart: "Svart",
  pink: "Rosa",
  rosa: "Rosa",
  brown: "Brun",
  brun: "Brun",
};

function colorNameToLabel(name: string): string {
  const key = name.toLowerCase();
  return LABEL_MAP[key] ?? name;
}

interface ColordraftTriggerPayload {
  numberOfSlots?: number;
  targetColor?: string;
  slotColors?: string[];
  winPrizeNok?: number;
  consolationPrizeNok?: number;
}

interface ColordraftResultJson {
  chosenIndex: number;
  chosenColor?: string;
  targetColor?: string;
  matched?: boolean;
  prizeAmountKroner?: number;
  allSlotColors?: string[];
  numberOfSlots?: number;
}

export class ColorDraftOverlay extends Container {
  private bg: Graphics;
  private title: Text;
  private subtitle: Text;
  private targetSwatch: Graphics;
  private targetLabel: Text;
  private prizeText: Text;
  private resultText: Text;
  private errorText: Text;
  private timerText: Text;
  private cards: Container[] = [];
  private slotColors: string[] = [];
  private onChoice: ((choiceJson: Readonly<Record<string, unknown>>) => void) | null = null;
  private onDismiss: (() => void) | null = null;
  private autoTimer: ReturnType<typeof setInterval> | null = null;
  private autoCountdown = AUTO_SELECT_SECONDS;
  private choiceSent = false;
  private revealed = false;
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
      text: "FARGETREKNING",
      style: { fontFamily: "Arial", fontSize: 28, fontWeight: "bold", fill: 0xffe83d },
    });
    this.title.anchor.set(0.5);
    this.title.x = w / 2;
    this.title.y = h * 0.14;
    this.addChild(this.title);

    this.subtitle = new Text({
      text: "Finn luken som matcher målfargen!",
      style: { fontFamily: "Arial", fontSize: 16, fill: 0xcccccc },
    });
    this.subtitle.anchor.set(0.5);
    this.subtitle.x = w / 2;
    this.subtitle.y = h * 0.20;
    this.addChild(this.subtitle);

    // Target swatch — big, centred above the grid. The player's primary cue.
    this.targetSwatch = new Graphics();
    this.addChild(this.targetSwatch);

    this.targetLabel = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 18, fontWeight: "bold", fill: 0xffffff },
    });
    this.targetLabel.anchor.set(0.5);
    this.targetLabel.x = w / 2;
    this.targetLabel.y = h * 0.30;
    this.addChild(this.targetLabel);

    this.prizeText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 14, fill: 0xcccccc },
    });
    this.prizeText.anchor.set(0.5);
    this.prizeText.x = w / 2;
    this.prizeText.y = h * 0.34;
    this.addChild(this.prizeText);

    this.resultText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 24, fontWeight: "bold", fill: 0xffe83d },
    });
    this.resultText.anchor.set(0.5);
    this.resultText.x = w / 2;
    this.resultText.y = h * 0.82;
    this.resultText.visible = false;
    this.addChild(this.resultText);

    this.errorText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 14, fill: 0xff6464 },
    });
    this.errorText.anchor.set(0.5);
    this.errorText.x = w / 2;
    this.errorText.y = h * 0.88;
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
    const data = triggerPayload as unknown as ColordraftTriggerPayload;
    const slotColors = Array.isArray(data.slotColors) ? data.slotColors : [];
    const numberOfSlots = slotColors.length || data.numberOfSlots || 12;
    const targetColor = data.targetColor ?? "";

    this.slotColors = slotColors.slice(0, numberOfSlots);
    this.choiceSent = false;
    this.revealed = false;
    this.resultText.visible = false;
    this.errorText.visible = false;

    // Draw target swatch as a large rounded square.
    const swatchSize = 64;
    const swatchX = this.screenW / 2;
    const swatchY = this.screenH * 0.26;
    this.targetSwatch.clear();
    this.targetSwatch.roundRect(swatchX - swatchSize / 2, swatchY - swatchSize / 2, swatchSize, swatchSize, 10);
    this.targetSwatch.fill(colorNameToFill(targetColor));
    this.targetSwatch.stroke({ color: 0xffffff, width: 3 });

    this.targetLabel.text = `Mål: ${colorNameToLabel(targetColor)}`;

    // Prize info.
    const win = typeof data.winPrizeNok === "number" ? data.winPrizeNok : 0;
    const consolation = typeof data.consolationPrizeNok === "number" ? data.consolationPrizeNok : 0;
    this.prizeText.text = consolation > 0
      ? `Match: ${win} kr — Bom: ${consolation} kr`
      : `Match: ${win} kr`;

    // Clear old cards, build new.
    for (const c of this.cards) c.destroy({ children: true });
    this.cards = [];

    // Layout: up to 6 per row, centred.
    const perRow = Math.min(6, numberOfSlots);
    const rowCount = Math.ceil(numberOfSlots / perRow);
    const gridW = perRow * CARD_SIZE + (perRow - 1) * CARD_GAP;
    const startX = (this.screenW - gridW) / 2;
    const startY = this.screenH * 0.45;

    for (let i = 0; i < numberOfSlots; i++) {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const color = this.slotColors[i] ?? "gray";
      const card = this.createCard(i, color);
      card.x = startX + col * (CARD_SIZE + CARD_GAP) + CARD_SIZE / 2;
      card.y = startY + row * (CARD_SIZE + CARD_GAP) + CARD_SIZE / 2;
      this.addChild(card);
      this.cards.push(card);
    }
    // Stretch backdrop to re-center if needed.
    this.visible = true;

    // Auto-select countdown.
    this.autoCountdown = AUTO_SELECT_SECONDS;
    this.timerText.text = `Auto-valg om ${this.autoCountdown}s`;
    this.autoTimer = setInterval(() => {
      this.autoCountdown -= 1;
      if (this.autoCountdown <= 0) {
        this.clearAutoTimer();
        this.timerText.text = "";
        const randomIdx = Math.floor(Math.random() * numberOfSlots);
        this.selectCard(randomIdx);
      } else {
        this.timerText.text = `Auto-valg om ${this.autoCountdown}s`;
      }
    }, 1000);

    void rowCount; // Silence unused — kept for readability above.
  }

  animateResult(resultJson: Readonly<Record<string, unknown>>, payoutCents: number): void {
    const result = resultJson as unknown as ColordraftResultJson;
    this.revealed = true;
    this.clearAutoTimer();
    this.timerText.text = "";
    this.errorText.visible = false;

    // Highlight chosen card.
    const card = this.cards[result.chosenIndex];
    if (card) {
      gsap.to(card.scale, { x: 1.2, y: 1.2, duration: 0.3 });
    }

    // If server echoes back `allSlotColors`, re-render any cards whose colour
    // we might have mis-rendered (future-proofing — currently trigger already
    // sends them).
    if (Array.isArray(result.allSlotColors)) {
      for (let i = 0; i < this.cards.length; i += 1) {
        const serverColor = result.allSlotColors[i];
        if (serverColor && serverColor !== this.slotColors[i]) {
          // Recolor card with server-authoritative value.
          const c = this.cards[i];
          if (c) {
            const rect = c.children[0] as Graphics | undefined;
            if (rect) {
              rect.clear();
              rect.roundRect(-CARD_SIZE / 2, -CARD_SIZE / 2, CARD_SIZE, CARD_SIZE, 12);
              rect.fill(colorNameToFill(serverColor));
              rect.stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
            }
          }
        }
      }
    }

    const amountKroner = typeof result.prizeAmountKroner === "number"
      ? result.prizeAmountKroner
      : Math.round(payoutCents / 100);
    const matched = result.matched === true;
    this.resultText.text = matched
      ? `TREFF! Du vant ${amountKroner} kr!`
      : amountKroner > 0
        ? `Bom — trøstepremie ${amountKroner} kr`
        : "Bom! Ingen premie denne gang.";
    this.resultText.style.fill = matched ? 0xffe83d : 0xcccccc;
    this.resultText.visible = true;

    setTimeout(() => this.onDismiss?.(), AUTO_DISMISS_AFTER_RESULT_SECONDS * 1000);
  }

  showChoiceError(err: { code: string; message: string }): void {
    this.errorText.text = `Feil: ${err.message}`;
    this.errorText.visible = true;
    this.choiceSent = false;
    for (const c of this.cards) {
      c.eventMode = "static";
      c.cursor = "pointer";
    }
  }

  destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.clearAutoTimer();
    gsap.killTweensOf(this);
    super.destroy(options);
  }

  private selectCard(index: number): void {
    if (this.revealed || this.choiceSent) return;
    this.choiceSent = true;
    this.clearAutoTimer();
    this.timerText.text = "";
    for (const c of this.cards) {
      c.eventMode = "none";
      c.cursor = "default";
    }
    this.onChoice?.({ chosenIndex: index });
  }

  private clearAutoTimer(): void {
    if (this.autoTimer) {
      clearInterval(this.autoTimer);
      this.autoTimer = null;
    }
  }

  private createCard(index: number, color: string): Container {
    const card = new Container();
    card.eventMode = "static";
    card.cursor = "pointer";

    const rect = new Graphics();
    rect.roundRect(-CARD_SIZE / 2, -CARD_SIZE / 2, CARD_SIZE, CARD_SIZE, 12);
    rect.fill(colorNameToFill(color));
    rect.stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
    card.addChild(rect);

    const label = new Text({
      text: colorNameToLabel(color),
      style: { fontFamily: "Arial", fontSize: 11, fill: 0xffffff, fontWeight: "bold" },
    });
    label.alpha = 0.95;
    label.anchor.set(0.5);
    label.y = CARD_SIZE / 2 - 12;
    card.addChild(label);

    card.on("pointerdown", () => this.selectCard(index));
    card.on("pointerover", () => { if (!this.revealed && !this.choiceSent) gsap.to(card.scale, { x: 1.08, y: 1.08, duration: 0.15 }); });
    card.on("pointerout", () => { if (!this.revealed && !this.choiceSent) gsap.to(card.scale, { x: 1, y: 1, duration: 0.15 }); });

    return card;
  }
}

/** Exposed for tests. */
export const __ColorDraft_AUTO_SELECT_SECONDS__ = AUTO_SELECT_SECONDS;
export const __colorNameToFill = colorNameToFill;
export const __colorNameToLabel = colorNameToLabel;
