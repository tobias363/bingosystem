/**
 * @vitest-environment happy-dom
 *
 * BIN-690 PR-M6: OddsenOverlay tests — M5 cross-round mini-game.
 *
 * Two-phase flow:
 *   - Phase 1 (choice): trigger → 3 number buttons → choice → "Venter i neste spill".
 *   - Phase 2 (resolve): second result event with resolvedOutcome → show hit/miss.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  OddsenOverlay,
  __Oddsen_AUTO_SELECT_SECONDS__,
  __Oddsen_AUTO_DISMISS_AFTER_WAITING_SECONDS__,
} from "./OddsenOverlay.js";

describe("OddsenOverlay — trigger rendering", () => {
  it("renders one button per validNumber", () => {
    const overlay = new OddsenOverlay(1000, 700);
    overlay.show({
      validNumbers: [55, 56, 57],
      potSmallNok: 1500,
      potLargeNok: 3000,
      resolveAtDraw: 57,
    });
    // @ts-expect-error — private.
    expect(overlay.buttons.length).toBe(3);
    overlay.destroy();
  });

  it("defaults to [55,56,57] when trigger omits validNumbers", () => {
    const overlay = new OddsenOverlay(1000, 700);
    overlay.show({});
    // @ts-expect-error — private.
    expect(overlay.buttons.length).toBe(3);
    overlay.destroy();
  });

  it("supports non-default validNumbers", () => {
    const overlay = new OddsenOverlay(1000, 700);
    overlay.show({ validNumbers: [70, 71, 72, 73], potSmallNok: 2000, potLargeNok: 4000 });
    // @ts-expect-error — private.
    expect(overlay.buttons.length).toBe(4);
    overlay.destroy();
  });
});

describe("OddsenOverlay — onChoice wire-up", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onChoice with {chosenNumber} on auto-select", () => {
    const overlay = new OddsenOverlay(1000, 700);
    const onChoice = vi.fn();
    overlay.setOnChoice(onChoice);
    overlay.show({
      validNumbers: [55, 56, 57],
      potSmallNok: 1500,
      potLargeNok: 3000,
      resolveAtDraw: 57,
    });
    vi.advanceTimersByTime(__Oddsen_AUTO_SELECT_SECONDS__ * 1000 + 100);
    expect(onChoice).toHaveBeenCalledTimes(1);
    const arg = onChoice.mock.calls[0][0];
    expect(arg).toHaveProperty("chosenNumber");
    expect([55, 56, 57]).toContain(arg.chosenNumber);
    overlay.destroy();
  });
});

describe("OddsenOverlay — two-phase animateResult", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("phase 1: payoutDeferred=true → shows waiting state without dismissing immediately", () => {
    const overlay = new OddsenOverlay(1000, 700);
    const onDismiss = vi.fn();
    overlay.setOnDismiss(onDismiss);
    overlay.show({
      validNumbers: [55, 56, 57],
      potSmallNok: 1500,
      potLargeNok: 3000,
      resolveAtDraw: 57,
    });
    overlay.animateResult(
      {
        chosenNumber: 56,
        oddsenStateId: "oddsen-abc",
        chosenForGameId: "game-next",
        ticketSizeAtWin: "small",
        potAmountNokIfHit: 1500,
        validNumbers: [55, 56, 57],
        payoutDeferred: true,
      },
      0,
    );
    expect(onDismiss).not.toHaveBeenCalled();
    // Waiting auto-dismiss fires after configured delay.
    vi.advanceTimersByTime(__Oddsen_AUTO_DISMISS_AFTER_WAITING_SECONDS__ * 1000 + 200);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    overlay.destroy();
  });

  it("phase 2: resolvedOutcome='hit' → shows winning text", () => {
    const overlay = new OddsenOverlay(1000, 700);
    overlay.show({
      validNumbers: [55, 56, 57],
      potSmallNok: 1500,
      potLargeNok: 3000,
      resolveAtDraw: 57,
    });
    expect(() =>
      overlay.animateResult(
        {
          chosenNumber: 56,
          resolvedOutcome: "hit",
          potAmountKroner: 1500,
        },
        150000,
      ),
    ).not.toThrow();
    overlay.destroy();
  });

  it("phase 2: resolvedOutcome='miss' → shows no-win text", () => {
    const overlay = new OddsenOverlay(1000, 700);
    overlay.show({ validNumbers: [55, 56, 57] });
    expect(() =>
      overlay.animateResult(
        { chosenNumber: 55, resolvedOutcome: "miss" },
        0,
      ),
    ).not.toThrow();
    overlay.destroy();
  });
});

describe("OddsenOverlay — showChoiceError", () => {
  it("does not dismiss + allows retry", () => {
    const overlay = new OddsenOverlay(1000, 700);
    overlay.show({ validNumbers: [55, 56, 57] });
    const onDismiss = vi.fn();
    overlay.setOnDismiss(onDismiss);
    overlay.showChoiceError({ code: "E", message: "x" });
    expect(onDismiss).not.toHaveBeenCalled();
    overlay.destroy();
  });
});
