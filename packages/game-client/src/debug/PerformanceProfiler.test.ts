import { describe, it, expect } from "vitest";
import { PerformanceProfiler } from "./PerformanceProfiler.js";

describe("PerformanceProfiler", () => {
  it("start/end measures the elapsed time", async () => {
    const profiler = new PerformanceProfiler();
    profiler.start("op");
    await new Promise((r) => setTimeout(r, 10));
    const dur = profiler.end("op");
    expect(dur).not.toBeNull();
    expect(dur!).toBeGreaterThanOrEqual(5);
  });

  it("end() with no matching start returns null", () => {
    const profiler = new PerformanceProfiler();
    expect(profiler.end("nope")).toBeNull();
  });

  it("recordEventLatency drives p50/p95/p99 in the report", () => {
    const profiler = new PerformanceProfiler();
    for (let i = 1; i <= 100; i++) {
      profiler.recordEventLatency("draw:new", i);
    }
    const reports = profiler.report();
    const draw = reports.find((r) => r.label === "event:draw:new");
    expect(draw).toBeDefined();
    expect(draw!.count).toBe(100);
    expect(draw!.p50).toBeCloseTo(50.5, 0);
    expect(draw!.p95).toBeCloseTo(95.05, 0);
    expect(draw!.min).toBe(1);
    expect(draw!.max).toBe(100);
  });

  it("rejects negative or non-finite samples", () => {
    const profiler = new PerformanceProfiler();
    profiler.recordEventLatency("x", -1);
    profiler.recordEventLatency("x", Number.POSITIVE_INFINITY);
    expect(profiler.report()).toEqual([]);
  });

  it("reset() clears all bags", () => {
    const profiler = new PerformanceProfiler();
    profiler.recordEventLatency("x", 1);
    profiler.reset();
    expect(profiler.report()).toEqual([]);
  });

  it("report sorts by p95 descending", () => {
    const profiler = new PerformanceProfiler();
    profiler.recordEventLatency("slow", 100);
    profiler.recordEventLatency("slow", 200);
    profiler.recordEventLatency("fast", 1);
    profiler.recordEventLatency("fast", 2);
    const labels = profiler.report().map((r) => r.label);
    expect(labels[0]).toBe("event:slow");
    expect(labels[1]).toBe("event:fast");
  });
});
