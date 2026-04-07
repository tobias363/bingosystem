import { describe, expect, it } from "vitest";
import {
  shouldIgnoreTheme1IncomingDrawNumber,
  resolveTheme1RecentBallsForLiveSync,
} from "@/features/theme1/hooks/useTheme1Store";

describe("shouldIgnoreTheme1IncomingDrawNumber", () => {
  it("ignores invalid draw numbers (NaN, 0, negative)", () => {
    const base = { visualRecentBalls: [], pendingDrawNumber: null };
    expect(shouldIgnoreTheme1IncomingDrawNumber({ ...base, nextDrawNumber: NaN })).toBe(true);
    expect(shouldIgnoreTheme1IncomingDrawNumber({ ...base, nextDrawNumber: 0 })).toBe(true);
    expect(shouldIgnoreTheme1IncomingDrawNumber({ ...base, nextDrawNumber: -5 })).toBe(true);
    expect(shouldIgnoreTheme1IncomingDrawNumber({ ...base, nextDrawNumber: Infinity })).toBe(true);
  });

  it("ignores draw that is already the pending draw", () => {
    expect(
      shouldIgnoreTheme1IncomingDrawNumber({
        visualRecentBalls: [1, 2, 3],
        pendingDrawNumber: 42,
        nextDrawNumber: 42,
      }),
    ).toBe(true);
  });

  it("ignores draw that already exists in visual recent balls", () => {
    expect(
      shouldIgnoreTheme1IncomingDrawNumber({
        visualRecentBalls: [10, 20, 30],
        pendingDrawNumber: null,
        nextDrawNumber: 20,
      }),
    ).toBe(true);
  });

  it("accepts a fresh draw number", () => {
    expect(
      shouldIgnoreTheme1IncomingDrawNumber({
        visualRecentBalls: [1, 2, 3],
        pendingDrawNumber: null,
        nextDrawNumber: 42,
      }),
    ).toBe(false);
  });

  it("truncates fractional draw numbers", () => {
    expect(
      shouldIgnoreTheme1IncomingDrawNumber({
        visualRecentBalls: [7],
        pendingDrawNumber: null,
        nextDrawNumber: 7.9,
      }),
    ).toBe(true);
  });
});

describe("resolveTheme1RecentBallsForLiveSync", () => {
  // ── Non room:update sources always use server balls ──

  it("uses server balls for room:resume", () => {
    const result = resolveTheme1RecentBallsForLiveSync({
      syncSource: "room:resume",
      clientBalls: [1, 2, 3],
      serverBalls: [10, 20, 30],
    });
    expect(result).toEqual([10, 20, 30]);
  });

  it("uses server balls for room:state", () => {
    const result = resolveTheme1RecentBallsForLiveSync({
      syncSource: "room:state",
      clientBalls: [1, 2, 3],
      serverBalls: [10, 20],
    });
    expect(result).toEqual([10, 20]);
  });

  // ── room:update: initial load ──

  it("uses server balls when client has none (initial load)", () => {
    const result = resolveTheme1RecentBallsForLiveSync({
      syncSource: "room:update",
      clientBalls: [],
      serverBalls: [5, 10, 15],
    });
    expect(result).toEqual([5, 10, 15]);
  });

  // ── room:update: new round detection ──

  it("resets to server balls when server has 3+ fewer than client (new round)", () => {
    const result = resolveTheme1RecentBallsForLiveSync({
      syncSource: "room:update",
      clientBalls: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
      serverBalls: [42],
    });
    expect(result).toEqual([42]);
  });

  it("does NOT reset when difference is only 1-2 balls (normal timing lag)", () => {
    const result = resolveTheme1RecentBallsForLiveSync({
      syncSource: "room:update",
      clientBalls: [1, 2, 3, 4, 5],
      serverBalls: [1, 2, 3, 4],
    });
    // Difference is 1 — keep client order
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  // ── room:update: game ended ──

  it("clears balls when server has none (game ended/waiting)", () => {
    const result = resolveTheme1RecentBallsForLiveSync({
      syncSource: "room:update",
      clientBalls: [1, 2, 3, 4, 5],
      serverBalls: [],
    });
    expect(result).toEqual([]);
  });

  // ── room:update: active round ──

  it("preserves client ball order during active round", () => {
    const result = resolveTheme1RecentBallsForLiveSync({
      syncSource: "room:update",
      clientBalls: [5, 10, 15],
      serverBalls: [5, 10, 15],
    });
    expect(result).toEqual([5, 10, 15]);
  });

  it("appends server-only balls (reconnect: missed draw:new events)", () => {
    const result = resolveTheme1RecentBallsForLiveSync({
      syncSource: "room:update",
      clientBalls: [5, 10],
      serverBalls: [5, 10, 15, 20],
    });
    // Client order preserved, server-only balls appended
    expect(result).toEqual([5, 10, 15, 20]);
  });

  it("does not duplicate balls already in client", () => {
    const result = resolveTheme1RecentBallsForLiveSync({
      syncSource: "room:update",
      clientBalls: [5, 10, 15],
      serverBalls: [5, 10, 15],
    });
    expect(result).toEqual([5, 10, 15]);
    // No duplicates
    expect(new Set(result).size).toBe(result.length);
  });

  it("returns new array reference (not original client array)", () => {
    const clientBalls = [5, 10, 15];
    const result = resolveTheme1RecentBallsForLiveSync({
      syncSource: "room:update",
      clientBalls,
      serverBalls: [5, 10, 15],
    });
    expect(result).not.toBe(clientBalls);
    expect(result).toEqual(clientBalls);
  });
});
