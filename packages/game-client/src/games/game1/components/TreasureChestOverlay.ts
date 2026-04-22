import { Container, Graphics, Text } from "pixi.js";
import gsap from "gsap";

/**
 * BIN-690 PR-M6: Treasure Chest overlay — wired to M6 protocol.
 *
 * Trigger payload (from M3 MiniGameChestEngine):
 *   `{ chestCount: number, prizeRange: {minNok, maxNok}, hasDiscreteTiers: boolean }`
 *
 * Choice payload: `{ chosenIndex: number }`
 *
 * Result payload:
 *   `{ chosenIndex, prizeAmountKroner, allValuesKroner: number[], chestCount }`
 *
 * Critical anti-juks property: the trigger payload does NOT include the
 * actual prize values per chest — only the range. Values arrive in the
 * result after the server has picked them server-side. The overlay renders
 * N closed chests labelled only by index; values appear in `animateResult`.
 *
 * Unity parity (visuals unchanged):
 *   - `TreasureChestPanel.cs:107` — auto-select after countdown (10 s)
 *   - `TreasureChestPanel.cs:611` — 12 s auto-back after reveal
 *   - `TreasureChestPanel.cs:633,643` — pause-hook on countdowns
 */

const CHEST_COLORS = {
  closed: 0x8b4513,
  closedLight: 0xa0522d,
  lid: 0xdaa520,
  openBg: 0x2e0000,
  winner: 0xffe83d,
};

const AUTO_BACK_SECONDS = 12;
const AUTO_SELECT_SECONDS = 10;

interface PauseAwareBridge {
  getState(): { isPaused: boolean };
}

interface ChestTriggerPayload {
  chestCount?: number;
  prizeRange?: { minNok: number; maxNok: number };
  hasDiscreteTiers?: boolean;
}

interface ChestResultJson {
  chosenIndex: number;
  prizeAmountKroner: number;
  allValuesKroner: number[];
  chestCount: number;
}

export class TreasureChestOverlay extends Container {
  private backdrop: Graphics;
  private chestContainer: Container;
  private resultText: Text;
  private titleText: Text;
  private timerText: Text;
  private errorText: Text;
  private subtitleText: Text;
  private chestCount = 0;
  private chests: Container[] = [];
  private isRevealing = false;
  private choiceSent = false;
  private onChoice: ((choiceJson: Readonly<Record<string, unknown>>) => void) | null = null;
  private onDismiss: (() => void) | null = null;
  private autoSelectTimer: ReturnType<typeof setInterval> | null = null;
  private autoSelectCountdown = AUTO_SELECT_SECONDS;
  private bridge: PauseAwareBridge | null;

  constructor(
    private screenWidth: number,
    private screenHeight: number,
    bridge?: PauseAwareBridge,
  ) {
    super();
    this.bridge = bridge ?? null;

    this.backdrop = new Graphics();
    this.backdrop.rect(0, 0, screenWidth, screenHeight);
    this.backdrop.fill({ color: 0x000000, alpha: 0.75 });
    this.backdrop.eventMode = "static";
    this.addChild(this.backdrop);

    this.titleText = new Text({
      text: "SKATTEKISTE!",
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
    this.titleText.y = 40;
    this.addChild(this.titleText);

    this.subtitleText = new Text({
      text: "Velg en kiste!",
      style: { fontFamily: "Arial", fontSize: 20, fill: 0xffffff, align: "center" },
    });
    this.subtitleText.anchor.set(0.5);
    this.subtitleText.x = screenWidth / 2;
    this.subtitleText.y = 80;
    this.addChild(this.subtitleText);

    this.chestContainer = new Container();
    this.addChild(this.chestContainer);

    this.timerText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 18, fill: 0xffffff, align: "center" },
    });
    this.timerText.anchor.set(0.5);
    this.timerText.x = screenWidth / 2;
    this.timerText.y = screenHeight - 80;
    this.addChild(this.timerText);

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
    this.resultText.y = screenHeight - 40;
    this.resultText.visible = false;
    this.addChild(this.resultText);

    this.errorText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 16, fill: 0xff6464, align: "center" },
    });
    this.errorText.anchor.set(0.5);
    this.errorText.x = screenWidth / 2;
    this.errorText.y = screenHeight - 110;
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

  /**
   * Handle `mini_game:trigger` payload. Renders `chestCount` closed chests —
   * values are NOT shown (they arrive only in the result after the server
   * has picked them server-side).
   */
  show(triggerPayload: Readonly<Record<string, unknown>>): void {
    const data = triggerPayload as unknown as ChestTriggerPayload;
    this.chestCount =
      typeof data.chestCount === "number" && data.chestCount >= 2
        ? data.chestCount
        : 6;

    // Update subtitle with prize range hint.
    if (data.prizeRange) {
      const { minNok, maxNok } = data.prizeRange;
      this.subtitleText.text = `Velg en kiste! (${minNok}–${maxNok} kr)`;
    } else {
      this.subtitleText.text = "Velg en kiste!";
    }
    this.subtitleText.visible = true;

    this.isRevealing = false;
    this.choiceSent = false;
    this.resultText.visible = false;
    this.errorText.visible = false;

    this.buildChests();
    this.visible = true;

    this.autoSelectCountdown = AUTO_SELECT_SECONDS;
    this.timerText.text = `Auto-valg om ${this.autoSelectCountdown}s`;
    this.autoSelectTimer = setInterval(() => {
      if (this.bridge?.getState().isPaused) return;
      this.autoSelectCountdown -= 1;
      if (this.autoSelectCountdown <= 0) {
        this.clearAutoTimer();
        this.timerText.text = "";
        const randomIdx = Math.floor(Math.random() * this.chestCount);
        this.handleChestClick(randomIdx);
      } else {
        this.timerText.text = `Auto-valg om ${this.autoSelectCountdown}s`;
      }
    }, 1000);
  }

  /**
   * Handle `mini_game:result`. Opens every chest to reveal its value
   * (`allValuesKroner`), highlights the winning index, and auto-dismisses.
   */
  animateResult(resultJson: Readonly<Record<string, unknown>>, payoutCents: number): void {
    const result = resultJson as unknown as ChestResultJson;
    this.isRevealing = true;
    this.clearAutoTimer();
    this.timerText.text = "";
    this.subtitleText.visible = false;
    this.errorText.visible = false;

    // Reveal all chests with their server-picked values.
    const values = result.allValuesKroner ?? [];
    for (let i = 0; i < this.chests.length; i++) {
      const chest = this.chests[i];
      const prize = values[i] ?? 0;
      const isWinner = i === result.chosenIndex;
      this.revealChest(chest, prize, isWinner);
    }

    gsap.delayedCall(1, () => {
      const amountKroner =
        typeof result.prizeAmountKroner === "number"
          ? result.prizeAmountKroner
          : Math.round(payoutCents / 100);
      this.resultText.text = `Du vant ${amountKroner} kr!`;
      this.resultText.visible = true;
    });

    gsap.delayedCall(AUTO_BACK_SECONDS, () => {
      this.visible = false;
      this.onDismiss?.();
    });
  }

  /**
   * Fail-closed: show error + allow retry by re-enabling chest clicks.
   * The overlay stays open; server's `completed_at` lock prevents dupe-pays.
   */
  showChoiceError(err: { code: string; message: string }): void {
    this.errorText.text = `Feil: ${err.message}`;
    this.errorText.visible = true;
    this.choiceSent = false;
    // Re-enable chest clicks so player can retry.
    for (const chest of this.chests) {
      chest.eventMode = "static";
      chest.cursor = "pointer";
    }
    // Restart auto-select countdown.
    if (!this.autoSelectTimer) {
      this.autoSelectCountdown = AUTO_SELECT_SECONDS;
      this.timerText.text = `Auto-valg om ${this.autoSelectCountdown}s`;
      this.autoSelectTimer = setInterval(() => {
        if (this.bridge?.getState().isPaused) return;
        this.autoSelectCountdown -= 1;
        if (this.autoSelectCountdown <= 0) {
          this.clearAutoTimer();
          this.timerText.text = "";
          const randomIdx = Math.floor(Math.random() * this.chestCount);
          this.handleChestClick(randomIdx);
        } else {
          this.timerText.text = `Auto-valg om ${this.autoSelectCountdown}s`;
        }
      }, 1000);
    }
  }

  destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.clearAutoTimer();
    gsap.killTweensOf(this);
    super.destroy(options);
  }

  private handleChestClick(index: number): void {
    if (this.isRevealing || this.choiceSent) return;
    this.choiceSent = true;
    this.clearAutoTimer();
    this.timerText.text = "";
    this.errorText.visible = false;

    // Disable further clicks until we get a result (or error).
    for (const chest of this.chests) {
      chest.eventMode = "none";
      chest.cursor = "default";
    }

    const chest = this.chests[index];
    if (chest) {
      gsap.to(chest, { y: chest.y - 10, duration: 0.2, yoyo: true, repeat: 1 });
    }

    this.onChoice?.({ chosenIndex: index });
  }

  private clearAutoTimer(): void {
    if (this.autoSelectTimer) {
      clearInterval(this.autoSelectTimer);
      this.autoSelectTimer = null;
    }
  }

  private buildChests(): void {
    for (const chest of this.chests) chest.destroy({ children: true });
    this.chests = [];
    this.chestContainer.removeChildren();

    const count = this.chestCount;
    const chestSize = Math.min(70, Math.floor((this.screenWidth - 40) / count) - 10);
    const centerY = this.screenHeight / 2;
    const perRow = count <= 4 ? count : Math.ceil(count / 2);
    const rows = Math.ceil(count / perRow);

    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const rowCount = row === rows - 1 ? count - perRow * row : perRow;
      const rowWidth = rowCount * (chestSize + 10) - 10;
      const rowStartX = (this.screenWidth - rowWidth) / 2;

      const chest = this.drawClosedChest(chestSize, i + 1);
      chest.x = rowStartX + col * (chestSize + 10) + chestSize / 2;
      chest.y = centerY + row * (chestSize + 20) - (rows > 1 ? chestSize / 2 : 0);
      chest.eventMode = "static";
      chest.cursor = "pointer";
      const idx = i;
      chest.on("pointerdown", () => this.handleChestClick(idx));
      this.chestContainer.addChild(chest);
      this.chests.push(chest);
    }
  }

  private drawClosedChest(size: number, number: number): Container {
    const c = new Container();

    const body = new Graphics();
    body.roundRect(-size / 2, -size / 2, size, size, 6);
    body.fill(CHEST_COLORS.closed);
    body.stroke({ color: CHEST_COLORS.lid, width: 2 });
    c.addChild(body);

    const lid = new Graphics();
    lid.rect(-size / 2, -size / 2, size, size * 0.3);
    lid.fill(CHEST_COLORS.closedLight);
    lid.stroke({ color: CHEST_COLORS.lid, width: 1 });
    c.addChild(lid);

    const lock = new Graphics();
    lock.circle(0, -size * 0.05, size * 0.08);
    lock.fill(CHEST_COLORS.lid);
    c.addChild(lock);

    const label = new Text({
      text: `${number}`,
      style: { fontFamily: "Arial", fontSize: Math.floor(size * 0.3), fill: 0xffffff, fontWeight: "bold" },
    });
    label.anchor.set(0.5);
    label.y = size * 0.15;
    c.addChild(label);

    return c;
  }

  private revealChest(chest: Container, prize: number, isWinner: boolean): void {
    gsap.to(chest, {
      alpha: 0.5,
      duration: 0.3,
      onComplete: () => {
        chest.removeChildren();
        chest.alpha = 1;

        const size = 70;
        const body = new Graphics();
        body.roundRect(-size / 2, -size / 2, size, size, 6);
        body.fill(isWinner ? CHEST_COLORS.winner : CHEST_COLORS.openBg);
        body.stroke({ color: isWinner ? 0xffffff : CHEST_COLORS.lid, width: isWinner ? 3 : 2 });
        chest.addChild(body);

        const label = new Text({
          text: `${prize}\nkr`,
          style: {
            fontFamily: "Arial",
            fontSize: Math.floor(size * 0.22),
            fill: isWinner ? 0x000000 : 0xffffff,
            fontWeight: "bold",
            align: "center",
          },
        });
        label.anchor.set(0.5);
        chest.addChild(label);

        if (isWinner) {
          gsap.to(chest, { alpha: 0.7, duration: 0.4, yoyo: true, repeat: 3 });
        }
      },
    });
  }
}

/** Exposed for tests. */
export const __TreasureChest_AUTO_BACK_SECONDS__ = AUTO_BACK_SECONDS;
export const __TreasureChest_AUTO_SELECT_SECONDS__ = AUTO_SELECT_SECONDS;
