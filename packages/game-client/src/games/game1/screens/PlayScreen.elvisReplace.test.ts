/**
 * @vitest-environment happy-dom
 *
 * PIXI-P0-003 (Bølge 2A pilot-blockers, 2026-04-28):
 *
 * The audit `docs/audit/GAME_CLIENT_PIXI_AUDIT_2026-04-28.md` flagged
 * `PlayScreen.showElvisReplace` as leaking DOM nodes + click-listeners
 * across rounds: the function appended a fresh `<div>` with two
 * `addEventListener` calls every time `Game1Controller.transitionTo
 * ("WAITING", …)` fired, with no dedupe and no teardown ownership beyond
 * `bar.remove()`. Over an 8h shift this leaks N nodes + N listeners per
 * round.
 *
 * The fix in `PlayScreen.ts`:
 *   1. Tracks the live bar via `this.elvisBar` + an `AbortController`
 *      (`this.elvisAbort`) that owns both click-listeners.
 *   2. Calls `removeElvisBar()` at the start of `showElvisReplace` so
 *      consecutive calls dedupe instead of stacking.
 *   3. Calls `removeElvisBar()` from `destroy()` so PlayScreen-teardown
 *      revokes any remaining listeners + detaches the DOM node.
 *   4. The "Bytt" + "✕" click handlers both go through `removeElvisBar()`
 *      (via the abort signal) so the closures become unreachable + GC-
 *      eligible.
 *
 * Mounting the real PlayScreen requires Pixi+GSAP+sprite-loading which
 * doesn't run cleanly in happy-dom (no WebGL, async Asset.load races).
 * Following the harness pattern established by
 * `Game1Controller.reconnect.test.ts`, this test mirrors the bar
 * lifecycle using the EXACT same DOM-construction code that ships in
 * `PlayScreen.ts`. If the production behaviour drifts, this test should
 * be updated to match — the contract is "no leaks across many calls + on
 * destroy".
 */
import { describe, it, expect } from "vitest";

/**
 * Mirror of `PlayScreen.showElvisReplace` + `removeElvisBar` — kept in
 * sync manually with `packages/game-client/src/games/game1/screens/
 * PlayScreen.ts:606-675`.
 *
 * The test instantiates this manager class once per scenario and exercises
 * its public surface (`showElvisReplace`, `destroy`). The harness keeps
 * the test stable against PlayScreen's heavy Pixi/GSAP dependencies while
 * still exercising the actual AbortController + DOM lifecycle that ships
 * in production.
 */
class ElvisBarHarness {
  private elvisBar: HTMLElement | null = null;
  private elvisAbort: AbortController | null = null;
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  showElvisReplace(replaceAmount: number, onReplace: () => void): void {
    if (replaceAmount <= 0) return;

    // Dedupe: a fresh call replaces the previous bar entirely.
    this.removeElvisBar();

    const abort = new AbortController();
    const { signal } = abort;

    const bar = document.createElement("div");
    bar.className = "elvis-bar";

    const text = document.createElement("span");
    text.textContent = `Bytt bonger (${replaceAmount} kr)`;
    bar.appendChild(text);

    const btn = document.createElement("button");
    btn.textContent = "Bytt";
    btn.addEventListener(
      "click",
      () => {
        onReplace();
        this.removeElvisBar();
      },
      { signal },
    );
    bar.appendChild(btn);

    const dismissBtn = document.createElement("button");
    dismissBtn.textContent = "✕";
    dismissBtn.addEventListener("click", () => this.removeElvisBar(), { signal });
    bar.appendChild(dismissBtn);

    this.root.appendChild(bar);
    this.elvisBar = bar;
    this.elvisAbort = abort;
  }

  /** Mirror of PlayScreen.destroy → calls removeElvisBar. */
  destroy(): void {
    this.removeElvisBar();
  }

  // Test-only window into private state.
  hasLiveBar(): boolean {
    return this.elvisBar !== null;
  }

  abortSignalAborted(): boolean | null {
    return this.elvisAbort?.signal.aborted ?? null;
  }

  private removeElvisBar(): void {
    if (this.elvisAbort) {
      this.elvisAbort.abort();
      this.elvisAbort = null;
    }
    if (this.elvisBar) {
      this.elvisBar.remove();
      this.elvisBar = null;
    }
  }
}

describe("PIXI-P0-003: Elvis-replace bar lifecycle (PlayScreen.showElvisReplace)", () => {
  function freshRoot(): HTMLElement {
    document.body.innerHTML = "";
    const root = document.createElement("div");
    document.body.appendChild(root);
    return root;
  }

  it("mounts a single bar with the expected fee text", () => {
    const root = freshRoot();
    const harness = new ElvisBarHarness(root);
    harness.showElvisReplace(50, () => {});

    const bars = root.querySelectorAll(".elvis-bar");
    expect(bars).toHaveLength(1);
    expect(bars[0].textContent).toContain("Bytt bonger (50 kr)");
  });

  it("no-ops on replaceAmount <= 0 (defensive guard from BIN-419)", () => {
    const root = freshRoot();
    const harness = new ElvisBarHarness(root);
    harness.showElvisReplace(0, () => {});
    harness.showElvisReplace(-100, () => {});
    expect(root.querySelectorAll(".elvis-bar")).toHaveLength(0);
    expect(harness.hasLiveBar()).toBe(false);
  });

  it("dedupes — calling showElvisReplace twice removes the old bar before mounting the new one", () => {
    const root = freshRoot();
    const harness = new ElvisBarHarness(root);

    harness.showElvisReplace(40, () => {});
    const firstBar = root.querySelector(".elvis-bar")!;
    expect(firstBar.textContent).toContain("(40 kr)");

    // Second call — old bar should be gone, new bar mounted with new fee.
    harness.showElvisReplace(75, () => {});
    expect(root.querySelectorAll(".elvis-bar")).toHaveLength(1);
    expect(root.contains(firstBar)).toBe(false);
    expect(root.querySelector(".elvis-bar")!.textContent).toContain("(75 kr)");
  });

  it("aborts the previous AbortController on dedupe so the old listeners can't fire", () => {
    const root = freshRoot();
    const harness = new ElvisBarHarness(root);

    let onReplaceCalls = 0;
    harness.showElvisReplace(40, () => {
      onReplaceCalls++;
    });
    const oldBar = root.querySelector(".elvis-bar")!;
    const oldBytt = oldBar.querySelector("button")! as HTMLButtonElement;

    harness.showElvisReplace(75, () => {
      onReplaceCalls++;
    });

    // Old "Bytt" button still exists in JS land but its listener was
    // attached with { signal }, and the controller was aborted by the
    // dedupe path. Clicking the detached button should be a no-op.
    oldBytt.click();
    expect(onReplaceCalls).toBe(0);
  });

  it("the 'Bytt' click invokes onReplace AND removes the bar", () => {
    const root = freshRoot();
    const harness = new ElvisBarHarness(root);
    let invoked = 0;
    harness.showElvisReplace(40, () => {
      invoked++;
    });

    const byttBtn = root.querySelector(".elvis-bar button")! as HTMLButtonElement;
    byttBtn.click();
    expect(invoked).toBe(1);
    expect(harness.hasLiveBar()).toBe(false);
    expect(root.querySelectorAll(".elvis-bar")).toHaveLength(0);
  });

  it("the dismiss '✕' click removes the bar without invoking onReplace", () => {
    const root = freshRoot();
    const harness = new ElvisBarHarness(root);
    let invoked = 0;
    harness.showElvisReplace(40, () => {
      invoked++;
    });

    const dismissBtn = root.querySelectorAll(".elvis-bar button")[1] as HTMLButtonElement;
    dismissBtn.click();
    expect(invoked).toBe(0);
    expect(harness.hasLiveBar()).toBe(false);
    expect(root.querySelectorAll(".elvis-bar")).toHaveLength(0);
  });

  it("destroy revokes the AbortController and removes the DOM node (no leak)", () => {
    const root = freshRoot();
    const harness = new ElvisBarHarness(root);
    harness.showElvisReplace(40, () => {});

    expect(harness.hasLiveBar()).toBe(true);
    expect(harness.abortSignalAborted()).toBe(false);

    harness.destroy();

    expect(harness.hasLiveBar()).toBe(false);
    expect(root.querySelectorAll(".elvis-bar")).toHaveLength(0);
    // Note: after destroy the controller ref is nulled; we can't observe
    // the signal anymore. The behavioural proof is that the DOM is gone
    // AND the next test ("simulated 8h shift") confirms no accumulation.
  });

  it("destroy is idempotent (safe to call after no-show or after the bar already auto-removed)", () => {
    const root = freshRoot();
    const harness = new ElvisBarHarness(root);
    expect(() => harness.destroy()).not.toThrow();

    harness.showElvisReplace(40, () => {});
    const dismissBtn = root.querySelectorAll(".elvis-bar button")[1] as HTMLButtonElement;
    dismissBtn.click(); // bar already cleaned up via dismiss path
    expect(() => harness.destroy()).not.toThrow();
  });

  it("simulated 8h shift: 200 round-transitions with showElvisReplace each — no DOM/listener accumulation", () => {
    // Audit's 1/90s blink hypothesis estimates ~30 GPU layers per minute
    // of HTML-over-Pixi accumulation. 200 rounds is the upper bound for a
    // reasonable shift (8h × ~25 rounds/h). After all of them, the DOM
    // should contain exactly ONE bar (the most recent one) and the
    // harness should hold exactly ONE AbortController, mirroring "live
    // bar only — no leak".
    const root = freshRoot();
    const harness = new ElvisBarHarness(root);
    let totalReplaces = 0;
    for (let i = 0; i < 200; i++) {
      harness.showElvisReplace(40 + i, () => {
        totalReplaces++;
      });
    }
    // Only the last bar should be in the DOM.
    expect(root.querySelectorAll(".elvis-bar")).toHaveLength(1);
    expect(root.querySelector(".elvis-bar")!.textContent).toContain(`(${40 + 199} kr)`);
    expect(harness.hasLiveBar()).toBe(true);

    // The current (i.e. live) abort signal should NOT yet be aborted.
    expect(harness.abortSignalAborted()).toBe(false);

    // Tearing the controller down at end-of-shift cleans up everything.
    harness.destroy();
    expect(root.querySelectorAll(".elvis-bar")).toHaveLength(0);
    expect(harness.hasLiveBar()).toBe(false);
    // Sanity: the Bytt-click contract still wires onReplace correctly
    // through the lifecycle (no clicks fired in this loop).
    expect(totalReplaces).toBe(0);
  });
});
