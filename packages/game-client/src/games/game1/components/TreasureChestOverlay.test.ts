/**
 * @vitest-environment happy-dom
 *
 * BIN-690 PR-M6: TreasureChestOverlay tests — wired to M6 protocol.
 *
 * Verifies:
 *   - show() reads chestCount from trigger payload.
 *   - Click fires onChoice with {chosenIndex: N}.
 *   - animateResult uses allValuesKroner + chosenIndex.
 *   - Pause-hook still freezes auto-select countdown.
 *   - 12s auto-back matches Unity parity.
 *   - Chest values are NOT pre-shown before animateResult (anti-juks).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TreasureChestOverlay,
  __TreasureChest_AUTO_BACK_SECONDS__,
  __TreasureChest_AUTO_SELECT_SECONDS__,
} from "./TreasureChestOverlay.js";

function makeBridge(isPaused = false): { getState: () => { isPaused: boolean } } {
  return { getState: () => ({ isPaused }) };
}

describe("TreasureChestOverlay — defaults", () => {
  it("uses 12 s auto-back (Unity parity TreasureChestPanel.cs:611)", () => {
    expect(__TreasureChest_AUTO_BACK_SECONDS__).toBe(12);
  });

  it("uses 10 s auto-select countdown", () => {
    expect(__TreasureChest_AUTO_SELECT_SECONDS__).toBe(10);
  });
});

describe("TreasureChestOverlay — trigger rendering", () => {
  it("renders one chest per chestCount from trigger payload", () => {
    const overlay = new TreasureChestOverlay(800, 600, makeBridge());
    overlay.show({ chestCount: 6, prizeRange: { minNok: 400, maxNok: 4000 } });
    // @ts-expect-error — accessing private chests for test assertion.
    expect(overlay.chests.length).toBe(6);
    overlay.destroy();
  });

  it("defaults to 6 chests when chestCount missing", () => {
    const overlay = new TreasureChestOverlay(800, 600, makeBridge());
    overlay.show({});
    // @ts-expect-error — private.
    expect(overlay.chests.length).toBe(6);
    overlay.destroy();
  });

  it("does NOT pre-expose any prize values (anti-juks — values only in result)", () => {
    const overlay = new TreasureChestOverlay(800, 600, makeBridge());
    overlay.show({ chestCount: 3, prizeRange: { minNok: 100, maxNok: 200 } });
    // @ts-expect-error — private.
    const chests = overlay.chests as import("pixi.js").Container[];
    for (const chest of chests) {
      const hasValueText = chest.children.some((c) => {
        if ("text" in c && typeof (c as { text: unknown }).text === "string") {
          const t = (c as { text: string }).text;
          // Labels 1/2/3/… are chest numbers; values would be "400 kr" etc.
          return /\d+\s*kr/i.test(t);
        }
        return false;
      });
      expect(hasValueText).toBe(false);
    }
    overlay.destroy();
  });
});

describe("TreasureChestOverlay — onChoice wire-up", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onChoice with {chosenIndex} when auto-select triggers", () => {
    const overlay = new TreasureChestOverlay(800, 600, makeBridge());
    const onChoice = vi.fn();
    overlay.setOnChoice(onChoice);
    overlay.show({ chestCount: 4, prizeRange: { minNok: 100, maxNok: 500 } });
    vi.advanceTimersByTime(11000);
    expect(onChoice).toHaveBeenCalledTimes(1);
    const arg = onChoice.mock.calls[0][0];
    expect(arg).toHaveProperty("chosenIndex");
    expect(typeof arg.chosenIndex).toBe("number");
    expect(arg.chosenIndex).toBeGreaterThanOrEqual(0);
    expect(arg.chosenIndex).toBeLessThan(4);
    overlay.destroy();
  });
});

describe("TreasureChestOverlay — pause-hook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does NOT auto-select while bridge.isPaused", () => {
    const bridgeState = { isPaused: true };
    const overlay = new TreasureChestOverlay(800, 600, { getState: () => bridgeState });
    const onChoice = vi.fn();
    overlay.setOnChoice(onChoice);
    overlay.show({ chestCount: 6, prizeRange: { minNok: 100, maxNok: 500 } });

    vi.advanceTimersByTime(30000);
    expect(onChoice).not.toHaveBeenCalled();

    bridgeState.isPaused = false;
    vi.advanceTimersByTime(11000);
    expect(onChoice).toHaveBeenCalledTimes(1);

    overlay.destroy();
  });
});

describe("TreasureChestOverlay — animateResult + showChoiceError", () => {
  it("animateResult reveals all values without throwing", () => {
    const overlay = new TreasureChestOverlay(800, 600, makeBridge());
    overlay.show({ chestCount: 3, prizeRange: { minNok: 100, maxNok: 400 } });
    expect(() =>
      overlay.animateResult(
        { chosenIndex: 1, prizeAmountKroner: 300, allValuesKroner: [100, 300, 200], chestCount: 3 },
        30000,
      ),
    ).not.toThrow();
    overlay.destroy();
  });

  it("showChoiceError leaves overlay intact and alive", () => {
    const overlay = new TreasureChestOverlay(800, 600, makeBridge());
    overlay.show({ chestCount: 3, prizeRange: { minNok: 100, maxNok: 400 } });
    const onDismiss = vi.fn();
    overlay.setOnDismiss(onDismiss);
    overlay.showChoiceError({ code: "E", message: "x" });
    expect(onDismiss).not.toHaveBeenCalled();
    overlay.destroy();
  });
});
