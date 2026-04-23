/**
 * PR-C1b: master.stopGame → drawEngine room-cleanup integrasjon.
 *
 * Verifiserer at Game1MasterControlService.stopGame() delegerer room-
 * cleanup korrekt basert på priorStatus:
 *   - running/paused  → drawEngine.stopGame(...) (som i sin tur rydder rom)
 *   - purchase_open / ready_to_start → drawEngine.destroyRoomForScheduledGameSafe
 *     (cancel-before-start-flyt; engine-state finnes ikke, men BingoEngine-
 *     rommet kan være opprettet av tidlige joiners).
 *
 * Vi wirer ikke hele drawEngine — bruker en minimal fake som sporer hvilke
 * metoder som ble kalt.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  Game1MasterControlService,
  type MasterActor,
} from "./Game1MasterControlService.js";
import type { Game1DrawEngineService } from "./Game1DrawEngineService.js";

// ── Stub pool ───────────────────────────────────────────────────────────────

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

interface StubResponse {
  match: (sql: string) => boolean;
  rows: unknown[] | (() => unknown[]);
  rowCount?: number;
  once?: boolean;
}

function createStubPool(responses: StubResponse[] = []): {
  pool: {
    connect: () => Promise<{
      query: (
        sql: string,
        params?: unknown[]
      ) => Promise<{ rows: unknown[]; rowCount: number }>;
      release: () => void;
    }>;
    query: (
      sql: string,
      params?: unknown[]
    ) => Promise<{ rows: unknown[]; rowCount: number }>;
  };
  queries: RecordedQuery[];
} {
  const queue = responses.slice();
  const queries: RecordedQuery[] = [];
  const runQuery = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    for (let i = 0; i < queue.length; i++) {
      const r = queue[i]!;
      if (r.match(sql)) {
        const rows = typeof r.rows === "function" ? r.rows() : r.rows;
        if (r.once !== false) queue.splice(i, 1);
        return { rows, rowCount: r.rowCount ?? rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    pool: {
      connect: async () => ({ query: runQuery, release: () => undefined }),
      query: runQuery,
    },
    queries,
  };
}

// ── Fake drawEngine ─────────────────────────────────────────────────────────

interface FakeDrawEngine {
  stopGameCalls: Array<{
    scheduledGameId: string;
    reason: string;
    actorUserId: string;
  }>;
  destroyRoomCalls: Array<{
    scheduledGameId: string;
    context: "completion" | "cancellation";
  }>;
}

function makeFakeDrawEngine(): {
  fake: FakeDrawEngine;
  service: Game1DrawEngineService;
} {
  const fake: FakeDrawEngine = {
    stopGameCalls: [],
    destroyRoomCalls: [],
  };
  const service = {
    async stopGame(
      scheduledGameId: string,
      reason: string,
      actorUserId: string
    ) {
      fake.stopGameCalls.push({ scheduledGameId, reason, actorUserId });
    },
    async destroyRoomForScheduledGameSafe(
      scheduledGameId: string,
      context: "completion" | "cancellation"
    ) {
      fake.destroyRoomCalls.push({ scheduledGameId, context });
    },
  } as unknown as Game1DrawEngineService;
  return { fake, service };
}

// ── Fixture-helpers ─────────────────────────────────────────────────────────

function gameRow(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "sg-1",
    status: "running",
    master_hall_id: "hall-master",
    group_hall_id: "group-1",
    participating_halls_json: ["hall-master", "hall-a"],
    actual_start_time: "2026-04-21T10:00:00Z",
    actual_end_time: null,
    ...overrides,
  };
}

function adminActor(): MasterActor {
  return {
    userId: "user-admin",
    role: "ADMIN",
    hallId: "hall-master",
  };
}

function stopStubs(priorStatus: string, scheduledGameId = "sg-1"): StubResponse[] {
  return [
    { match: (sql) => /^BEGIN/i.test(sql), rows: [] },
    {
      match: (sql) =>
        /FROM.+app_game1_scheduled_games[\s\S]+FOR UPDATE/i.test(sql),
      rows: [gameRow({ id: scheduledGameId, status: priorStatus })],
    },
    {
      match: (sql) =>
        /UPDATE.+app_game1_scheduled_games[\s\S]+status\s*=\s*'cancelled'/i.test(
          sql
        ),
      rows: [
        gameRow({
          id: scheduledGameId,
          status: "cancelled",
          actual_end_time: "2026-04-21T10:30:00Z",
        }),
      ],
      rowCount: 1,
    },
    {
      match: (sql) => /FROM.+app_game1_hall_ready_status/i.test(sql),
      rows: [],
    },
    {
      match: (sql) => /INSERT INTO.+app_game1_master_audit/i.test(sql),
      rows: [],
      rowCount: 1,
    },
    { match: (sql) => /^COMMIT/i.test(sql), rows: [] },
  ];
}

// ── Tester ──────────────────────────────────────────────────────────────────

test("PR-C1b: master.stop fra 'running' → drawEngine.stopGame kalles (ikke destroyRoomForScheduledGameSafe)", async () => {
  const { pool } = createStubPool(stopStubs("running"));
  const { fake, service: drawEngineFake } = makeFakeDrawEngine();

  const svc = new Game1MasterControlService({
    pool: pool as never,
    drawEngine: drawEngineFake,
  });

  await svc.stopGame({
    gameId: "sg-1",
    reason: "running-stop",
    actor: adminActor(),
  });

  assert.equal(
    fake.stopGameCalls.length,
    1,
    "drawEngine.stopGame skal kalles for running-flyt"
  );
  assert.equal(fake.stopGameCalls[0]!.scheduledGameId, "sg-1");
  assert.equal(fake.stopGameCalls[0]!.reason, "running-stop");
  assert.equal(
    fake.destroyRoomCalls.length,
    0,
    "destroyRoomForScheduledGameSafe skal IKKE kalles direkte for running-flyt — cleanup skjer inne i drawEngine.stopGame"
  );
});

test("PR-C1b: master.stop fra 'paused' → drawEngine.stopGame kalles", async () => {
  const { pool } = createStubPool(stopStubs("paused"));
  const { fake, service: drawEngineFake } = makeFakeDrawEngine();

  const svc = new Game1MasterControlService({
    pool: pool as never,
    drawEngine: drawEngineFake,
  });

  await svc.stopGame({
    gameId: "sg-1",
    reason: "paused-stop",
    actor: adminActor(),
  });

  assert.equal(fake.stopGameCalls.length, 1);
  assert.equal(fake.destroyRoomCalls.length, 0);
});

test("PR-C1b: master.stop fra 'purchase_open' (cancel-before-start) → destroyRoomForScheduledGameSafe kalles", async () => {
  const { pool } = createStubPool(stopStubs("purchase_open"));
  const { fake, service: drawEngineFake } = makeFakeDrawEngine();

  const svc = new Game1MasterControlService({
    pool: pool as never,
    drawEngine: drawEngineFake,
  });

  await svc.stopGame({
    gameId: "sg-1",
    reason: "no-sale-cancel",
    actor: adminActor(),
  });

  assert.equal(
    fake.stopGameCalls.length,
    0,
    "drawEngine.stopGame skal IKKE kalles når spillet ikke var running/paused (ingen engine-state)"
  );
  assert.equal(
    fake.destroyRoomCalls.length,
    1,
    "destroyRoomForScheduledGameSafe skal kalles for cancel-before-start"
  );
  assert.equal(fake.destroyRoomCalls[0]!.scheduledGameId, "sg-1");
  assert.equal(fake.destroyRoomCalls[0]!.context, "cancellation");
});

test("PR-C1b: master.stop fra 'ready_to_start' (cancel-before-start) → destroyRoomForScheduledGameSafe kalles", async () => {
  const { pool } = createStubPool(stopStubs("ready_to_start"));
  const { fake, service: drawEngineFake } = makeFakeDrawEngine();

  const svc = new Game1MasterControlService({
    pool: pool as never,
    drawEngine: drawEngineFake,
  });

  await svc.stopGame({
    gameId: "sg-1",
    reason: "cancel-before-start",
    actor: adminActor(),
  });

  assert.equal(fake.stopGameCalls.length, 0);
  assert.equal(fake.destroyRoomCalls.length, 1);
  assert.equal(fake.destroyRoomCalls[0]!.context, "cancellation");
});

test("PR-C1b: master.stop uten drawEngine → ingen crash, ingen delegering", async () => {
  const { pool } = createStubPool(stopStubs("running"));

  const svc = new Game1MasterControlService({
    pool: pool as never,
    // Ingen drawEngine.
  });

  // Skal ikke kaste.
  const result = await svc.stopGame({
    gameId: "sg-1",
    reason: "no-engine",
    actor: adminActor(),
  });

  assert.equal(result.status, "cancelled");
});
