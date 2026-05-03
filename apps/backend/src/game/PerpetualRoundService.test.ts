/**
 * Tester for PerpetualRoundService.
 *
 * Bruker `node:test` (samme som resten av backend) i stedet for vitest.
 * Tjenesten har ingen eksterne avhengigheter (DB, Redis, sockets), så vi
 * kan stubbe `engine`, `variantLookup` og `setTimeoutFn` direkte.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  PerpetualRoundService,
  PERPETUAL_SLUGS,
  NATURAL_END_REASONS,
  type PerpetualEngine,
  type VariantConfigLookup,
  type PerpetualRoundServiceConfig,
} from "./PerpetualRoundService.js";
import type { GameEndedInput } from "../adapters/BingoSystemAdapter.js";

// ── Stubs ────────────────────────────────────────────────────────────────────

interface StubEngineState {
  rooms: Map<
    string,
    {
      code: string;
      hostPlayerId: string;
      hallId: string;
      gameSlug: string;
      players: Array<{ id: string }>;
      currentGame?: { status: string; id: string };
    }
  >;
  startGameCalls: Array<Parameters<PerpetualEngine["startGame"]>[0]>;
  startGameImpl: (input: Parameters<PerpetualEngine["startGame"]>[0]) => Promise<void>;
}

function makeStubEngine(initialRooms: StubEngineState["rooms"] = new Map()): {
  engine: PerpetualEngine;
  state: StubEngineState;
} {
  const state: StubEngineState = {
    rooms: initialRooms,
    startGameCalls: [],
    startGameImpl: async () => {},
  };

  const engine: PerpetualEngine = {
    getRoomSnapshot(roomCode) {
      const room = state.rooms.get(roomCode);
      if (!room) {
        throw Object.assign(new Error("ROOM_NOT_FOUND"), { code: "ROOM_NOT_FOUND" });
      }
      return room;
    },
    async startGame(input) {
      state.startGameCalls.push(input);
      await state.startGameImpl(input);
    },
  };

  return { engine, state };
}

function makeStubVariantLookup(
  byRoom: Record<string, { gameType?: string; config?: import("./variantConfig.js").GameVariantConfig } | null> = {},
): VariantConfigLookup {
  return {
    getVariantConfig(roomCode) {
      return byRoom[roomCode] ?? null;
    },
  };
}

interface FakeTimer {
  setTimeoutFn: NonNullable<PerpetualRoundServiceConfig["setTimeoutFn"]>;
  clearTimeoutFn: NonNullable<PerpetualRoundServiceConfig["clearTimeoutFn"]>;
  /** Trigger the most-recently-scheduled callback. Throws if none pending. */
  runNext: () => Promise<void>;
  pendingCount: () => number;
}

function makeFakeTimer(): FakeTimer {
  const pending: Array<{
    handle: { __id: number };
    fn: () => void;
    cancelled: boolean;
  }> = [];
  let nextId = 1;

  const setTimeoutFn = ((fn: () => void, _ms: number) => {
    const handle = { __id: nextId++ };
    pending.push({ handle, fn, cancelled: false });
    return handle as unknown as ReturnType<typeof setTimeout>;
  }) as NonNullable<PerpetualRoundServiceConfig["setTimeoutFn"]>;

  const clearTimeoutFn = ((handle: ReturnType<typeof setTimeout>) => {
    const id = (handle as unknown as { __id: number }).__id;
    const found = pending.find((p) => p.handle.__id === id);
    if (found) found.cancelled = true;
  }) as NonNullable<PerpetualRoundServiceConfig["clearTimeoutFn"]>;

  return {
    setTimeoutFn,
    clearTimeoutFn,
    async runNext() {
      // Find the last not-cancelled task (LIFO so we trigger the most
      // recently scheduled). Caller controls order via single trigger.
      for (let i = pending.length - 1; i >= 0; i -= 1) {
        const task = pending[i]!;
        if (!task.cancelled) {
          task.cancelled = true; // mark so it won't fire again
          task.fn();
          // Yield microtasks so promises chained inside fn() resolve.
          await Promise.resolve();
          await Promise.resolve();
          return;
        }
      }
      throw new Error("No pending timer to run");
    },
    pendingCount() {
      return pending.filter((p) => !p.cancelled).length;
    },
  };
}

function makeRoom(overrides: {
  code: string;
  gameSlug: string;
  hostPlayerId?: string;
  hallId?: string;
  playerCount?: number;
  currentGameStatus?: string;
  currentGameId?: string;
}): {
  code: string;
  hostPlayerId: string;
  hallId: string;
  gameSlug: string;
  players: Array<{ id: string }>;
  currentGame?: { status: string; id: string };
} {
  const playerCount = overrides.playerCount ?? 1;
  const players: Array<{ id: string }> = [];
  for (let i = 0; i < playerCount; i += 1) {
    players.push({ id: `player-${i + 1}` });
  }
  return {
    code: overrides.code,
    hostPlayerId: overrides.hostPlayerId ?? "player-1",
    hallId: overrides.hallId ?? "hall-1",
    gameSlug: overrides.gameSlug,
    players,
    ...(overrides.currentGameStatus
      ? {
          currentGame: {
            status: overrides.currentGameStatus,
            id: overrides.currentGameId ?? "game-1",
          },
        }
      : {}),
  };
}

function makeGameEndedInput(overrides: Partial<GameEndedInput> = {}): GameEndedInput {
  return {
    roomCode: "ROCKET",
    hallId: "hall-1",
    gameId: "game-prev-1",
    entryFee: 50,
    endedReason: "G2_WINNER",
    drawnNumbers: [],
    claims: [],
    playerIds: ["player-1"],
    ...overrides,
  };
}

function makeService(args: {
  engine: PerpetualEngine;
  variantLookup?: VariantConfigLookup;
  timer: FakeTimer;
  enabled?: boolean;
  delayMs?: number;
  disabledSlugs?: ReadonlySet<string>;
  emitRoomUpdate?: PerpetualRoundServiceConfig["emitRoomUpdate"];
}): PerpetualRoundService {
  return new PerpetualRoundService({
    enabled: args.enabled ?? true,
    delayMs: args.delayMs ?? 5000,
    disabledSlugs: args.disabledSlugs ?? new Set(),
    engine: args.engine,
    variantLookup: args.variantLookup ?? makeStubVariantLookup(),
    defaultTicketsPerPlayer: 4,
    defaultPayoutPercent: 80,
    defaultEntryFee: 0,
    ...(args.emitRoomUpdate ? { emitRoomUpdate: args.emitRoomUpdate } : {}),
    setTimeoutFn: args.timer.setTimeoutFn,
    clearTimeoutFn: args.timer.clearTimeoutFn,
  });
}

// ── Constants ────────────────────────────────────────────────────────────────

test("PERPETUAL_SLUGS dekker rocket og monsterbingo", () => {
  assert.equal(PERPETUAL_SLUGS.size, 2);
  assert.ok(PERPETUAL_SLUGS.has("rocket"));
  assert.ok(PERPETUAL_SLUGS.has("monsterbingo"));
});

test("NATURAL_END_REASONS inkluderer G2_WINNER og G3_FULL_HOUSE", () => {
  assert.ok(NATURAL_END_REASONS.has("G2_WINNER"));
  assert.ok(NATURAL_END_REASONS.has("G3_FULL_HOUSE"));
  assert.ok(NATURAL_END_REASONS.has("MAX_DRAWS_REACHED"));
  assert.ok(NATURAL_END_REASONS.has("DRAW_BAG_EMPTY"));
  assert.ok(!NATURAL_END_REASONS.has("MANUAL_END"));
  assert.ok(!NATURAL_END_REASONS.has("SYSTEM_ERROR"));
});

// ── Happy path ───────────────────────────────────────────────────────────────

test("happy path Spill 2: schedulerer og kjører auto-restart etter G2_WINNER", async () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
  ]);
  const { engine, state } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET" }));

  assert.equal(timer.pendingCount(), 1, "én pending restart");
  assert.equal(service.pendingCountForTesting(), 1);
  assert.equal(state.startGameCalls.length, 0, "startGame ikke kalt før delay");

  await timer.runNext();

  assert.equal(state.startGameCalls.length, 1, "startGame kalt én gang");
  const call = state.startGameCalls[0]!;
  assert.equal(call.roomCode, "ROCKET");
  assert.equal(call.actorPlayerId, "player-1");
  assert.equal(call.payoutPercent, 80);
  assert.equal(call.ticketsPerPlayer, 4);
  assert.deepEqual(call.armedPlayerIds, []);
  assert.deepEqual(call.armedPlayerTicketCounts, {});
  assert.equal(service.pendingCountForTesting(), 0, "pending fjernes etter kjøring");
});

test("happy path Spill 3: schedulerer og kjører auto-restart etter G3_FULL_HOUSE", async () => {
  const rooms = new Map([
    [
      "MONSTERBINGO",
      makeRoom({ code: "MONSTERBINGO", gameSlug: "monsterbingo" }),
    ],
  ]);
  const { engine, state } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  service.handleGameEnded(
    makeGameEndedInput({
      roomCode: "MONSTERBINGO",
      endedReason: "G3_FULL_HOUSE",
    }),
  );

  await timer.runNext();

  assert.equal(state.startGameCalls.length, 1);
  assert.equal(state.startGameCalls[0]!.roomCode, "MONSTERBINGO");
});

test("happy path: variantConfig sendes med startGame", async () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
  ]);
  const { engine, state } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const variantLookup = makeStubVariantLookup({
    ROCKET: {
      gameType: "rocket",
      config: {
        ticketTypes: [{ name: "Standard", type: "small", price: 50 }],
        patterns: [],
      } as unknown as import("./variantConfig.js").GameVariantConfig,
    },
  });
  const service = makeService({ engine, variantLookup, timer });

  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET" }));
  await timer.runNext();

  const call = state.startGameCalls[0]!;
  assert.equal(call.gameType, "rocket");
  assert.ok(call.variantConfig, "variantConfig sendes med");
});

test("happy path: emitRoomUpdate kalles etter startGame", async () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
  ]);
  const { engine } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  let emitCalled = 0;
  const service = makeService({
    engine,
    timer,
    emitRoomUpdate: async (code) => {
      assert.equal(code, "ROCKET");
      emitCalled += 1;
    },
  });

  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET" }));
  await timer.runNext();

  assert.equal(emitCalled, 1, "emitRoomUpdate kalt én gang");
});

// ── Skip-pathways ────────────────────────────────────────────────────────────

test("skip: Spill 1 (slug=bingo) trigger ikke restart", async () => {
  const rooms = new Map([
    ["BINGO_HALL-1", makeRoom({ code: "BINGO_HALL-1", gameSlug: "bingo" })],
  ]);
  const { engine, state } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  service.handleGameEnded(
    makeGameEndedInput({ roomCode: "BINGO_HALL-1", endedReason: "BINGO_WON" }),
  );

  assert.equal(timer.pendingCount(), 0);
  assert.equal(state.startGameCalls.length, 0);
});

test("skip: SpinnGo (slug=spillorama) trigger ikke restart", async () => {
  const rooms = new Map([
    ["SPILLORAMA-HALL-1", makeRoom({ code: "SPILLORAMA-HALL-1", gameSlug: "spillorama" })],
  ]);
  const { engine, state } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  service.handleGameEnded(
    makeGameEndedInput({ roomCode: "SPILLORAMA-HALL-1", endedReason: "G2_WINNER" }),
  );

  assert.equal(timer.pendingCount(), 0);
  assert.equal(state.startGameCalls.length, 0);
});

test("skip: MANUAL_END trigger ikke restart", () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
  ]);
  const { engine } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  service.handleGameEnded(
    makeGameEndedInput({ roomCode: "ROCKET", endedReason: "MANUAL_END" }),
  );

  assert.equal(timer.pendingCount(), 0);
  assert.equal(service.pendingCountForTesting(), 0);
});

test("skip: SYSTEM_ERROR trigger ikke restart", () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
  ]);
  const { engine } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  service.handleGameEnded(
    makeGameEndedInput({ roomCode: "ROCKET", endedReason: "SYSTEM_ERROR" }),
  );

  assert.equal(timer.pendingCount(), 0);
});

test("skip: ukjent endedReason trigger ikke restart (fail-closed)", () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
  ]);
  const { engine } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  service.handleGameEnded(
    makeGameEndedInput({ roomCode: "ROCKET", endedReason: "WAT" }),
  );

  assert.equal(timer.pendingCount(), 0);
});

test("skip: tomt rom (ingen spillere) starter ikke ny runde", async () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket", playerCount: 0 })],
  ]);
  const { engine, state } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET" }));
  await timer.runNext();

  assert.equal(state.startGameCalls.length, 0, "startGame skal ikke kalles på tomt rom");
});

test("skip: rom som allerede har RUNNING currentGame mellom schedule og fire", async () => {
  const rooms = new Map([
    [
      "ROCKET",
      makeRoom({ code: "ROCKET", gameSlug: "rocket" }),
    ],
  ]);
  const { engine, state } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET" }));
  // Mellom schedule og fire: noen starter ny runde manuelt
  rooms.set(
    "ROCKET",
    makeRoom({
      code: "ROCKET",
      gameSlug: "rocket",
      currentGameStatus: "RUNNING",
      currentGameId: "game-manual",
    }),
  );
  await timer.runNext();

  assert.equal(state.startGameCalls.length, 0);
});

test("skip: rom destroyed mellom schedule og fire", async () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
  ]);
  const { engine, state } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET" }));
  rooms.delete("ROCKET");
  await timer.runNext();

  assert.equal(state.startGameCalls.length, 0);
});

test("skip: service disabled trigger ikke restart", () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
  ]);
  const { engine } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer, enabled: false });

  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET" }));

  assert.equal(timer.pendingCount(), 0);
});

test("skip: per-slug disabled trigger ikke restart for den slug-en", () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
    ["MONSTERBINGO", makeRoom({ code: "MONSTERBINGO", gameSlug: "monsterbingo" })],
  ]);
  const { engine } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({
    engine,
    timer,
    disabledSlugs: new Set(["monsterbingo"]),
  });

  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET" }));
  service.handleGameEnded(
    makeGameEndedInput({
      roomCode: "MONSTERBINGO",
      endedReason: "G3_FULL_HOUSE",
    }),
  );

  assert.equal(service.pendingCountForTesting(), 1, "kun rocket pending");
});

test("skip: rom med ukjent slug håndteres som ikke-perpetual", async () => {
  const rooms = new Map([
    ["X", makeRoom({ code: "X", gameSlug: "unknownslug" })],
  ]);
  const { engine, state } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  service.handleGameEnded(
    makeGameEndedInput({ roomCode: "X", endedReason: "G2_WINNER" }),
  );

  assert.equal(timer.pendingCount(), 0);
  assert.equal(state.startGameCalls.length, 0);
});

// ── Idempotens ───────────────────────────────────────────────────────────────

test("idempotens: dobbel onGameEnded med samme gameId schedulerer kun én restart", () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
  ]);
  const { engine } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  const input = makeGameEndedInput({ roomCode: "ROCKET", gameId: "game-end-1" });
  service.handleGameEnded(input);
  service.handleGameEnded(input); // duplikat
  service.handleGameEnded(input); // duplikat

  assert.equal(service.pendingCountForTesting(), 1, "kun én pending");
  assert.equal(timer.pendingCount(), 1, "kun én timer aktiv");
});

test("idempotens: ny gameId etter at restart fyrte schedulerer ny restart", async () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
  ]);
  const { engine, state } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET", gameId: "game-1" }));
  await timer.runNext(); // restart kjører

  assert.equal(state.startGameCalls.length, 1);
  assert.equal(service.pendingCountForTesting(), 0);

  // Andre runde slutter også
  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET", gameId: "game-2" }));
  assert.equal(service.pendingCountForTesting(), 1, "ny pending for game-2");

  await timer.runNext();
  assert.equal(state.startGameCalls.length, 2, "to startGame-kall totalt");
});

test("idempotens: ny gameId mens forrige fortsatt pending erstatter forrige", () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
  ]);
  const { engine } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET", gameId: "game-1" }));
  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET", gameId: "game-2" }));

  // Pending-map: kun én entry, men timer-pending teller har 1 (gammel cancelled)
  assert.equal(service.pendingCountForTesting(), 1, "kun siste pending tracket");
  assert.equal(timer.pendingCount(), 1, "gammel timer cancelled, ny aktiv");
});

// ── Failure handling ─────────────────────────────────────────────────────────

test("fail-soft: startGame kaster NOT_ENOUGH_PLAYERS → ingen unhandled rejection", async () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
  ]);
  const { engine, state } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });
  state.startGameImpl = async () => {
    throw Object.assign(new Error("Du trenger minst 2 spillere"), {
      code: "NOT_ENOUGH_PLAYERS",
    });
  };

  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET" }));
  // Skal ikke kaste — fail-soft
  await timer.runNext();

  assert.equal(state.startGameCalls.length, 1);
  assert.equal(service.pendingCountForTesting(), 0, "pending fjernes selv ved feil");
});

test("fail-soft: emitRoomUpdate kaster → ikke unhandled rejection", async () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
  ]);
  const { engine, state } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({
    engine,
    timer,
    emitRoomUpdate: async () => {
      throw new Error("socket emit failed");
    },
  });

  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET" }));
  await timer.runNext();

  assert.equal(state.startGameCalls.length, 1, "startGame ble fortsatt kalt");
});

// ── Helpers ──────────────────────────────────────────────────────────────────

test("cancelAllForTesting tømmer pending-map", () => {
  const rooms = new Map([
    ["ROCKET", makeRoom({ code: "ROCKET", gameSlug: "rocket" })],
    ["MONSTERBINGO", makeRoom({ code: "MONSTERBINGO", gameSlug: "monsterbingo" })],
  ]);
  const { engine } = makeStubEngine(rooms);
  const timer = makeFakeTimer();
  const service = makeService({ engine, timer });

  service.handleGameEnded(makeGameEndedInput({ roomCode: "ROCKET" }));
  service.handleGameEnded(
    makeGameEndedInput({
      roomCode: "MONSTERBINGO",
      endedReason: "G3_FULL_HOUSE",
    }),
  );
  assert.equal(service.pendingCountForTesting(), 2);

  service.cancelAllForTesting();
  assert.equal(service.pendingCountForTesting(), 0);
});
