import { describe, it, expect, vi } from "vitest";
import { StateInspector } from "./StateInspector.js";
import { DebugLogger } from "./debugLogger.js";

describe("StateInspector", () => {
  it("returns a JSON-safe clone of state and tolerates non-serialisable values", () => {
    const inspector = new StateInspector();
    inspector.setLogger(new DebugLogger("test"));
    const live = { a: 1, fn: () => 42, dom: { nodeType: 1 }, big: BigInt(5) };
    inspector.setStateGetter(() => live);
    const snapshot = inspector.state() as Record<string, unknown>;
    expect(snapshot.a).toBe(1);
    expect(snapshot.fn).toBe("[function]");
    expect(snapshot.dom).toBe("[dom-or-pixi]");
    expect(typeof snapshot.big).toBe("string");
  });

  it("watch() fires the listener when the path value changes", () => {
    const inspector = new StateInspector();
    let live = { foo: { bar: 1 } };
    inspector.setStateGetter(() => live);
    const listener = vi.fn();
    inspector.watch("foo.bar", listener);
    // First snapshot — no change yet.
    inspector.recordSnapshot();
    expect(listener).not.toHaveBeenCalled();
    live = { foo: { bar: 2 } };
    inspector.recordSnapshot();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(2, 1, "foo.bar");
  });

  it("unsubscribes cleanly", () => {
    const inspector = new StateInspector();
    let live = { x: 0 };
    inspector.setStateGetter(() => live);
    const listener = vi.fn();
    const unsub = inspector.watch("x", listener);
    unsub();
    live = { x: 99 };
    inspector.recordSnapshot();
    expect(listener).not.toHaveBeenCalled();
  });

  it("diff() produces added/removed/changed paths between snapshots", async () => {
    const inspector = new StateInspector();
    let live: unknown = { a: 1, b: 2 };
    inspector.setStateGetter(() => live);
    inspector.recordSnapshot();
    const start = Date.now();
    // Move time forward so snapshots have distinct ts.
    await new Promise((r) => setTimeout(r, 5));
    live = { a: 1, c: 3 };
    inspector.recordSnapshot();
    const result = inspector.diff(start - 1);
    expect(result).not.toBeNull();
    expect(result!.removed.b).toBe(2);
    expect(result!.added.c).toBe(3);
  });
});
