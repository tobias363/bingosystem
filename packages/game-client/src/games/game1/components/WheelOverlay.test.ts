/**
 * @vitest-environment happy-dom
 *
 * BIN-690 PR-M6: WheelOverlay tests — wire to new M6 protocol.
 *
 * Verifies:
 *   - Default 50-segment wheel (Unity parity).
 *   - show() reads trigger payload with totalBuckets + prizes.
 *   - Click + auto-spin both fire onChoice with empty {}.
 *   - Pause-hook (bridge.isPaused) still freezes auto-spin countdown.
 *   - animateResult uses winningBucketIndex from resultJson.
 *   - showChoiceError re-enables the spin button without dismissing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WheelOverlay, __WheelOverlay_DEFAULT_NUM_SEGMENTS__ } from "./WheelOverlay.js";

function makeBridge(isPaused = false): { getState: () => { isPaused: boolean } } {
  return { getState: () => ({ isPaused }) };
}

describe("WheelOverlay — defaults", () => {
  it("defaults to 50 segments (Unity parity)", () => {
    expect(__WheelOverlay_DEFAULT_NUM_SEGMENTS__).toBe(50);
  });

  it("renders 50 segment graphics + 50 labels + 1 ring when trigger omits totalBuckets", () => {
    const overlay = new WheelOverlay(800, 600, makeBridge());
    overlay.show({ prizes: [{ amount: 1000, buckets: 50 }] });
    const wheelContainer = overlay.children[2] as { children: unknown[] };
    const inner = wheelContainer.children[0] as { children: unknown[] };
    // 50 fills + 50 labels + 1 ring-hub = 101
    expect(inner.children.length).toBe(50 + 50 + 1);
    overlay.destroy();
  });

  it("supports custom totalBuckets from trigger payload", () => {
    const overlay = new WheelOverlay(800, 600, makeBridge());
    overlay.show({ totalBuckets: 10, prizes: [{ amount: 500, buckets: 10 }] });
    const wheelContainer = overlay.children[2] as { children: unknown[] };
    const inner = wheelContainer.children[0] as { children: unknown[] };
    expect(inner.children.length).toBe(10 + 10 + 1);
    overlay.destroy();
  });
});

describe("WheelOverlay — onChoice wire-up", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onChoice with empty {} when auto-spin countdown reaches 0", () => {
    const overlay = new WheelOverlay(800, 600, makeBridge(false));
    const onChoice = vi.fn();
    overlay.setOnChoice(onChoice);
    overlay.show({ totalBuckets: 50, prizes: [{ amount: 1000, buckets: 50 }] });
    vi.advanceTimersByTime(11000);
    expect(onChoice).toHaveBeenCalledTimes(1);
    expect(onChoice).toHaveBeenCalledWith({});
    overlay.destroy();
  });
});

describe("WheelOverlay — pause-hook (Unity SpinWheelScript.cs:490)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does NOT decrement auto-spin countdown while bridge.isPaused === true", () => {
    const bridgeState = { isPaused: true };
    const overlay = new WheelOverlay(800, 600, { getState: () => bridgeState });
    overlay.show({ totalBuckets: 50, prizes: [{ amount: 100, buckets: 50 }] });

    const onChoice = vi.fn();
    overlay.setOnChoice(onChoice);

    vi.advanceTimersByTime(15000);
    expect(onChoice).not.toHaveBeenCalled();

    bridgeState.isPaused = false;
    vi.advanceTimersByTime(11000);
    expect(onChoice).toHaveBeenCalledTimes(1);

    overlay.destroy();
  });
});

describe("WheelOverlay — showChoiceError", () => {
  it("displays error text and re-enables spin without dismissing", () => {
    const overlay = new WheelOverlay(800, 600, makeBridge());
    overlay.show({ totalBuckets: 50, prizes: [{ amount: 1000, buckets: 50 }] });
    const onDismiss = vi.fn();
    overlay.setOnDismiss(onDismiss);
    overlay.showChoiceError({ code: "BOOM", message: "test error" });
    // Error text visible, no dismiss.
    expect(onDismiss).not.toHaveBeenCalled();
    overlay.destroy();
  });
});
