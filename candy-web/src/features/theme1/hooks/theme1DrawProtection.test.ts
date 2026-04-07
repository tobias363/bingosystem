import { describe, expect, it } from "vitest";
import {
  shouldHoldPendingPresentationVisuals,
  resolvePendingDrawNumberForSnapshot,
  shouldFreezeBoardsForUnarmedPlayer,
  freezeBoardsFromPreviousModel,
} from "@/features/theme1/hooks/theme1LiveSync";
import type { Theme1RoundRenderModel } from "@/domain/theme1/renderModel";

function createMinimalSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    code: "CANDY1",
    hostPlayerId: "host-1",
    players: [],
    preRoundTickets: {},
    currentGame: {
      id: "game-1",
      status: "RUNNING" as const,
      drawnNumbers: [] as number[],
      tickets: {},
      claims: [],
      ...(overrides.currentGame as Record<string, unknown> ?? {}),
    },
    scheduler: {
      enabled: true,
      nextStartAt: null,
      millisUntilNextStart: null,
      serverTime: null,
      entryFee: 0,
      armedPlayerIds: [] as string[],
      ...(overrides.scheduler as Record<string, unknown> ?? {}),
    },
    ...overrides,
  };
}

function createMinimalModel(overrides: Partial<Theme1RoundRenderModel> = {}): Theme1RoundRenderModel {
  return {
    boards: [],
    toppers: [],
    hud: {
      trekk: "0 / 30",
      saldo: "1 000 kr",
      gevinst: "0 kr",
      innsats: "0 kr",
      nesteTrekkOm: "",
    },
    meta: {
      roomCode: "CANDY1",
      connectionLabel: "Live",
      gameStatus: "RUNNING",
      drawCount: 0,
      source: "live",
    },
    recentBalls: [],
    featuredBallNumber: null,
    featuredBallIsPending: false,
    ...overrides,
  };
}

// ── shouldHoldPendingPresentationVisuals ──

describe("shouldHoldPendingPresentationVisuals", () => {
  it("returns false when no pending draw", () => {
    const snapshot = createMinimalSnapshot({
      currentGame: { drawnNumbers: [1, 2, 3] },
    });
    expect(
      shouldHoldPendingPresentationVisuals({ snapshot, pendingDrawNumber: null }),
    ).toBe(false);
  });

  it("returns true when pending draw is in server drawnNumbers", () => {
    const snapshot = createMinimalSnapshot({
      currentGame: { drawnNumbers: [10, 20, 30] },
    });
    expect(
      shouldHoldPendingPresentationVisuals({ snapshot, pendingDrawNumber: 20 }),
    ).toBe(true);
  });

  it("returns false when pending draw is NOT in server drawnNumbers", () => {
    const snapshot = createMinimalSnapshot({
      currentGame: { drawnNumbers: [10, 20, 30] },
    });
    expect(
      shouldHoldPendingPresentationVisuals({ snapshot, pendingDrawNumber: 42 }),
    ).toBe(false);
  });
});

// ── resolvePendingDrawNumberForSnapshot ──

describe("resolvePendingDrawNumberForSnapshot", () => {
  it("returns null when no pending draw", () => {
    const snapshot = createMinimalSnapshot();
    expect(resolvePendingDrawNumberForSnapshot(snapshot, null)).toBe(null);
  });

  it("returns null when pending draw is already confirmed by server", () => {
    const snapshot = createMinimalSnapshot({
      currentGame: { drawnNumbers: [5, 10, 15] },
    });
    expect(resolvePendingDrawNumberForSnapshot(snapshot, 10)).toBe(null);
  });

  it("keeps pending draw when server has not confirmed it yet", () => {
    const snapshot = createMinimalSnapshot({
      currentGame: { drawnNumbers: [5, 10] },
    });
    expect(resolvePendingDrawNumberForSnapshot(snapshot, 15)).toBe(15);
  });
});

// ── shouldFreezeBoardsForUnarmedPlayer ──

describe("shouldFreezeBoardsForUnarmedPlayer", () => {
  const modelWithActivity = createMinimalModel({
    meta: { ...createMinimalModel().meta, source: "live" },
    recentBalls: [1, 2, 3],
  });

  it("returns false when no player ID", () => {
    expect(
      shouldFreezeBoardsForUnarmedPlayer({
        previousModel: modelWithActivity,
        snapshot: createMinimalSnapshot(),
        playerId: "",
      }),
    ).toBe(false);
  });

  it("returns false when previous model is not live", () => {
    const mockModel = createMinimalModel({
      meta: { ...createMinimalModel().meta, source: "mock" },
      recentBalls: [1, 2, 3],
    });
    expect(
      shouldFreezeBoardsForUnarmedPlayer({
        previousModel: mockModel,
        snapshot: createMinimalSnapshot(),
        playerId: "player-1",
      }),
    ).toBe(false);
  });

  it("returns false when no board activity", () => {
    const emptyModel = createMinimalModel({
      meta: { ...createMinimalModel().meta, source: "live" },
      recentBalls: [],
    });
    expect(
      shouldFreezeBoardsForUnarmedPlayer({
        previousModel: emptyModel,
        snapshot: createMinimalSnapshot(),
        playerId: "player-1",
      }),
    ).toBe(false);
  });

  it("returns false when player is armed", () => {
    const snapshot = createMinimalSnapshot({
      scheduler: { armedPlayerIds: ["player-1"] },
    });
    expect(
      shouldFreezeBoardsForUnarmedPlayer({
        previousModel: modelWithActivity,
        snapshot,
        playerId: "player-1",
      }),
    ).toBe(false);
  });

  it("returns true for unarmed player when game is not running", () => {
    const snapshot = createMinimalSnapshot({
      currentGame: { status: "ENDED", drawnNumbers: [1, 2, 3] },
      scheduler: { armedPlayerIds: [] },
    });
    expect(
      shouldFreezeBoardsForUnarmedPlayer({
        previousModel: modelWithActivity,
        snapshot,
        playerId: "player-1",
      }),
    ).toBe(true);
  });

  it("returns true for unarmed player early in round (below threshold)", () => {
    const snapshot = createMinimalSnapshot({
      currentGame: { status: "RUNNING", drawnNumbers: [1, 2, 3] },
      scheduler: { armedPlayerIds: [] },
    });
    expect(
      shouldFreezeBoardsForUnarmedPlayer({
        previousModel: modelWithActivity,
        snapshot,
        playerId: "player-1",
      }),
    ).toBe(true);
  });

  it("returns false for unarmed player late in round (above threshold)", () => {
    const manyDraws = Array.from({ length: 20 }, (_, i) => i + 1);
    const snapshot = createMinimalSnapshot({
      currentGame: { status: "RUNNING", drawnNumbers: manyDraws },
      scheduler: { armedPlayerIds: [] },
    });
    expect(
      shouldFreezeBoardsForUnarmedPlayer({
        previousModel: modelWithActivity,
        snapshot,
        playerId: "player-1",
      }),
    ).toBe(false);
  });
});

// ── freezeBoardsFromPreviousModel ──

describe("freezeBoardsFromPreviousModel", () => {
  it("preserves previous boards on the next model", () => {
    const previousBoards = [{ id: "board-1", cells: [], label: "Bong 1" }] as Theme1RoundRenderModel["boards"];
    const nextBoards = [{ id: "board-2", cells: [], label: "Bong 2" }] as Theme1RoundRenderModel["boards"];
    const previous = createMinimalModel({ boards: previousBoards, recentBalls: [1, 2] });
    const next = createMinimalModel({ boards: nextBoards, recentBalls: [1, 2, 3] });

    const result = freezeBoardsFromPreviousModel(previous, next);
    expect(result.boards).toBe(previousBoards);
    expect(result.recentBalls).toEqual([1, 2]);
  });

  it("uses next model recentBalls when previous has none", () => {
    const previous = createMinimalModel({ recentBalls: [] });
    const next = createMinimalModel({ recentBalls: [10, 20] });

    const result = freezeBoardsFromPreviousModel(previous, next);
    expect(result.recentBalls).toEqual([10, 20]);
  });
});
