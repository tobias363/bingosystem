import { describe, it, expect } from "vitest";
import { EventBuffer, makeEventBufferAPI } from "./EventBuffer.js";
import type { DebugEvent } from "./types.js";

function ev(seq: number, type = "x", source: DebugEvent["source"] = "engine"): DebugEvent {
  return {
    seq,
    timestamp: Date.now() + seq,
    performanceTime: seq,
    source,
    type,
    traceId: `CLI-${seq}`,
  };
}

describe("EventBuffer", () => {
  it("records events oldest-first up to the configured cap", () => {
    const buf = new EventBuffer(3);
    buf.record(ev(1));
    buf.record(ev(2));
    buf.record(ev(3));
    buf.record(ev(4));
    const all = buf.all();
    expect(all.map((e) => e.seq)).toEqual([2, 3, 4]);
    expect(buf.size()).toBe(3);
    expect(buf.capacity()).toBe(3);
  });

  it("last(n) returns the n newest events", () => {
    const buf = new EventBuffer(10);
    for (let i = 1; i <= 5; i++) buf.record(ev(i));
    expect(buf.last(2).map((e) => e.seq)).toEqual([4, 5]);
    expect(buf.last(0)).toEqual([]);
  });

  it("filter / byType / bySource discriminate correctly", () => {
    const buf = new EventBuffer(10);
    buf.record(ev(1, "draw:new"));
    buf.record(ev(2, "draw:new"));
    buf.record(ev(3, "room:update"));
    buf.record(ev(4, "draw:new", "ui"));
    expect(buf.byType("draw:new").map((e) => e.seq)).toEqual([1, 2, 4]);
    expect(buf.bySource("ui").map((e) => e.seq)).toEqual([4]);
    expect(buf.filter((e) => e.seq % 2 === 0).map((e) => e.seq)).toEqual([2, 4]);
  });

  it("clear empties the buffer", () => {
    const buf = new EventBuffer(5);
    buf.record(ev(1));
    buf.record(ev(2));
    buf.clear();
    expect(buf.size()).toBe(0);
    expect(buf.all()).toEqual([]);
  });

  it("onWrite delivers each new event to subscribers", () => {
    const buf = new EventBuffer(5);
    const seen: number[] = [];
    const unsub = buf.onWrite((e) => seen.push(e.seq));
    buf.record(ev(1));
    buf.record(ev(2));
    unsub();
    buf.record(ev(3));
    expect(seen).toEqual([1, 2]);
  });

  it("replay walks events in order with speed=0 (fast as possible)", async () => {
    const buf = new EventBuffer(10);
    buf.record(ev(1));
    buf.record(ev(2));
    buf.record(ev(3));
    const seen: number[] = [];
    await buf.replay({ onEvent: (e) => seen.push(e.seq), speed: 0 });
    expect(seen).toEqual([1, 2, 3]);
  });

  it("replay respects from/to filtering", async () => {
    const buf = new EventBuffer(10);
    const t = 1_000_000;
    buf.record({ ...ev(1), timestamp: t });
    buf.record({ ...ev(2), timestamp: t + 100 });
    buf.record({ ...ev(3), timestamp: t + 200 });
    const seen: number[] = [];
    await buf.replay({ onEvent: (e) => seen.push(e.seq), speed: 0, from: t + 50, to: t + 150 });
    expect(seen).toEqual([2]);
  });

  it("makeEventBufferAPI returns method-bound functions safe to destructure", () => {
    const buf = new EventBuffer(5);
    buf.record(ev(1));
    const api = makeEventBufferAPI(buf);
    const { last, size } = api;
    expect(size()).toBe(1);
    expect(last(1)[0].seq).toBe(1);
  });
});
