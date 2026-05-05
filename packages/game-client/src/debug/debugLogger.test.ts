import { describe, it, expect, vi } from "vitest";
import { DebugLogger } from "./debugLogger.js";

describe("DebugLogger", () => {
  it("trace-ids match backend convention CLI-{module}-{NNN}", () => {
    const log = new DebugLogger("game1");
    const id = log.newTraceId();
    expect(id).toMatch(/^CLI-GAME1-\d{4}$/);
  });

  it("subscribers receive each event before the level gate is applied", () => {
    const log = new DebugLogger("test");
    log.setLevel("error"); // only errors print
    const captured: string[] = [];
    log.subscribe((e) => captured.push(e.type));
    log.debug("ui", "click");
    log.warn("system", "timeout");
    log.error("error", "boom");
    expect(captured).toEqual(["click", "timeout", "boom"]);
  });

  it("payloads are shallow-cloned so top-level mutation doesn't pollute records", () => {
    const log = new DebugLogger("test");
    const captured: unknown[] = [];
    log.subscribe((e) => captured.push(e.payload));
    const live = { x: 1, y: 2 };
    log.info("engine", "snap", live);
    live.x = 99;
    const recorded = captured[0] as { x: number; y: number };
    // Top-level field copied — engine swap of `x` after log is harmless.
    expect(recorded.x).toBe(1);
    expect(recorded.y).toBe(2);
    // Documented limitation: shallow only. Nested arrays/objects share
    // the live reference. We chose shallow over deep for performance —
    // engine state is replaced (not mutated in place) on every tick.
  });

  it("setLevel filters console output but not subscribers", () => {
    const log = new DebugLogger("t");
    log.setLevel("warn");
    expect(log.getLevel()).toBe("warn");
    const calls: string[] = [];
    log.subscribe((e) => calls.push(e.type));
    // No throw expected even when listeners blow up.
    log.subscribe(() => {
      throw new Error("nope");
    });
    log.info("ui", "ignored-by-console-not-by-bus");
    expect(calls).toEqual(["ignored-by-console-not-by-bus"]);
  });

  it("does not throw when payload is undefined or null", () => {
    const log = new DebugLogger("t");
    expect(() => log.info("system", "n1")).not.toThrow();
    expect(() => log.info("system", "n2", null)).not.toThrow();
  });

  it("convenience helpers map to the right level", () => {
    const log = new DebugLogger("t");
    log.setLevel("debug");
    const calls: string[] = [];
    log.subscribe((e) => calls.push(e.type));
    log.debug("ui", "d");
    log.info("ui", "i");
    log.success("ui", "s");
    log.warn("ui", "w");
    log.error("ui", "e");
    expect(calls).toEqual(["d", "i", "s", "w", "e"]);
  });

  // Smoke test: logger never throws even when console is partially broken.
  it("survives console-throwing", () => {
    const original = console.log;
    console.log = vi.fn(() => {
      throw new Error("console blown");
    }) as typeof console.log;
    try {
      const log = new DebugLogger("t");
      expect(() => log.info("ui", "x")).not.toThrow();
    } finally {
      console.log = original;
    }
  });
});
