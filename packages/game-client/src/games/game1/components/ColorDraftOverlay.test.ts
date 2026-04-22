/**
 * @vitest-environment happy-dom
 *
 * BIN-690 PR-M6: ColorDraftOverlay tests — wired to M6 protocol.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ColorDraftOverlay,
  __ColorDraft_AUTO_SELECT_SECONDS__,
  __colorNameToFill,
  __colorNameToLabel,
} from "./ColorDraftOverlay.js";

describe("ColorDraftOverlay — color name mapping", () => {
  it("maps common Norwegian + English palette names to brand colours", () => {
    expect(__colorNameToFill("yellow")).toBe(0xf5c103);
    expect(__colorNameToFill("Gul")).toBe(0xf5c103);
    expect(__colorNameToFill("red")).toBe(0xd20000);
    expect(__colorNameToFill("rød")).toBe(0xd20000);
    expect(__colorNameToFill("blue")).toBe(0x3a7adf);
    expect(__colorNameToFill("green")).toBe(0x199600);
  });

  it("falls back to gray for unknown colour names", () => {
    expect(__colorNameToFill("infrared")).toBe(0x888888);
  });

  it("maps color names to Norwegian labels", () => {
    expect(__colorNameToLabel("yellow")).toBe("Gul");
    expect(__colorNameToLabel("red")).toBe("Rød");
    expect(__colorNameToLabel("unknown")).toBe("unknown");
  });
});

describe("ColorDraftOverlay — trigger rendering", () => {
  it("renders N slot cards per slotColors.length", () => {
    const overlay = new ColorDraftOverlay(1000, 700);
    overlay.show({
      numberOfSlots: 12,
      targetColor: "red",
      slotColors: ["red", "blue", "red", "green", "yellow", "blue", "red", "green", "yellow", "blue", "red", "green"],
      winPrizeNok: 1000,
      consolationPrizeNok: 0,
    });
    // @ts-expect-error — accessing private cards for test assertion.
    expect(overlay.cards.length).toBe(12);
    overlay.destroy();
  });

  it("respects smaller slotColors array (partial payload)", () => {
    const overlay = new ColorDraftOverlay(1000, 700);
    overlay.show({
      numberOfSlots: 6,
      targetColor: "blue",
      slotColors: ["blue", "red", "green", "yellow", "blue", "red"],
      winPrizeNok: 500,
    });
    // @ts-expect-error — private.
    expect(overlay.cards.length).toBe(6);
    overlay.destroy();
  });
});

describe("ColorDraftOverlay — onChoice wire-up", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onChoice with {chosenIndex} on auto-select", () => {
    const overlay = new ColorDraftOverlay(1000, 700);
    const onChoice = vi.fn();
    overlay.setOnChoice(onChoice);
    overlay.show({
      numberOfSlots: 4,
      targetColor: "green",
      slotColors: ["red", "green", "blue", "yellow"],
      winPrizeNok: 1000,
    });
    vi.advanceTimersByTime(__ColorDraft_AUTO_SELECT_SECONDS__ * 1000 + 100);
    expect(onChoice).toHaveBeenCalledTimes(1);
    const arg = onChoice.mock.calls[0][0];
    expect(arg).toHaveProperty("chosenIndex");
    expect(typeof arg.chosenIndex).toBe("number");
    overlay.destroy();
  });
});

describe("ColorDraftOverlay — animateResult + showChoiceError", () => {
  it("animateResult with matched=true shows winning text", () => {
    const overlay = new ColorDraftOverlay(1000, 700);
    overlay.show({
      numberOfSlots: 4,
      targetColor: "blue",
      slotColors: ["red", "blue", "green", "yellow"],
      winPrizeNok: 1000,
    });
    expect(() =>
      overlay.animateResult(
        {
          chosenIndex: 1,
          chosenColor: "blue",
          targetColor: "blue",
          matched: true,
          prizeAmountKroner: 1000,
          allSlotColors: ["red", "blue", "green", "yellow"],
          numberOfSlots: 4,
        },
        100000,
      ),
    ).not.toThrow();
    overlay.destroy();
  });

  it("animateResult with matched=false shows consolation text", () => {
    const overlay = new ColorDraftOverlay(1000, 700);
    overlay.show({
      numberOfSlots: 4,
      targetColor: "blue",
      slotColors: ["red", "blue", "green", "yellow"],
      winPrizeNok: 1000,
      consolationPrizeNok: 0,
    });
    expect(() =>
      overlay.animateResult(
        {
          chosenIndex: 0,
          chosenColor: "red",
          targetColor: "blue",
          matched: false,
          prizeAmountKroner: 0,
          allSlotColors: ["red", "blue", "green", "yellow"],
          numberOfSlots: 4,
        },
        0,
      ),
    ).not.toThrow();
    overlay.destroy();
  });

  it("showChoiceError does not dismiss", () => {
    const overlay = new ColorDraftOverlay(1000, 700);
    overlay.show({
      numberOfSlots: 4,
      targetColor: "blue",
      slotColors: ["red", "blue", "green", "yellow"],
      winPrizeNok: 1000,
    });
    const onDismiss = vi.fn();
    overlay.setOnDismiss(onDismiss);
    overlay.showChoiceError({ code: "E", message: "nope" });
    expect(onDismiss).not.toHaveBeenCalled();
    overlay.destroy();
  });
});
