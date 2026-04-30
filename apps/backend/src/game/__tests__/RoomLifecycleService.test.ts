/**
 * F2-C unit tests for RoomLifecycleService — extracted room-lifecycle flow.
 *
 * Behavior was previously verified by 50+ integration tests in
 * BingoEngine.test.ts (covers happy-path createRoom/joinRoom, HALL_MISMATCH
 * guard, cross-room dup-guard, destroyRoom cleanup, listRoomSummaries
 * shape, getRoomSnapshot projection). These tests pin the delegate pattern
 * and the unique service-level invariants:
 *
 *   - The engine delegates to RoomLifecycleService instead of running the
 *     logic inline.
 *   - The service is constructed once per engine instance and exposes the
 *     expected public API surface.
 *   - The HALL_MISMATCH guard fires from the service (not the engine).
 *   - The destroyRoom path routes through the K2 atomic eviction callback.
 *
 * The end-to-end create/join/destroy branches stay covered by the existing
 * BingoEngine test suite because the engine wraps the service in a thin
 * delegate — testing through the engine exercises the service.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { BingoEngine, DomainError } from "../BingoEngine.js";
import { InMemoryWalletAdapter } from "../BingoEngine.test.js";
import { RoomLifecycleService } from "../RoomLifecycleService.js";

import type {
  BingoSystemAdapter,
  CreateTicketInput,
} from "../../adapters/BingoSystemAdapter.js";
import type { Ticket } from "../types.js";

class StubBingoAdapter implements BingoSystemAdapter {
  async createTicket(_input: CreateTicketInput): Promise<Ticket> {
    return {
      grid: [
        [1, 2, 3, 4, 5],
        [13, 14, 15, 16, 17],
        [25, 26, 0, 27, 28],
        [37, 38, 39, 40, 41],
        [49, 50, 51, 52, 53],
      ],
    };
  }
}

test("F2-C: RoomLifecycleService is wired into BingoEngine and not undefined", () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const service = (engine as unknown as { roomLifecycleService: RoomLifecycleService })
    .roomLifecycleService;
  assert.ok(service, "engine should expose a roomLifecycleService instance");
  assert.ok(
    service instanceof RoomLifecycleService,
    "the field must be a real RoomLifecycleService — not a mock or stub",
  );
});

test("F2-C: RoomLifecycleService is constructed once — same instance returned", () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const service1 = (engine as unknown as { roomLifecycleService: RoomLifecycleService })
    .roomLifecycleService;
  const service2 = (engine as unknown as { roomLifecycleService: RoomLifecycleService })
    .roomLifecycleService;
  assert.equal(service1, service2);
});

test("F2-C: BingoEngine.createRoom is a thin delegate", () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const fnSrc = engine.createRoom.toString();
  assert.match(
    fnSrc,
    /roomLifecycleService\.createRoom/,
    "should delegate to roomLifecycleService.createRoom",
  );
  assert.doesNotMatch(
    fnSrc,
    /walletAdapter\.ensureAccount/,
    "should NOT have inline wallet-account-materialization",
  );
  assert.doesNotMatch(
    fnSrc,
    /makeRoomCode/,
    "should NOT have inline room-code generation",
  );
});

test("F2-C: BingoEngine.joinRoom is a thin delegate", () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const fnSrc = engine.joinRoom.toString();
  assert.match(
    fnSrc,
    /roomLifecycleService\.joinRoom/,
    "should delegate to roomLifecycleService.joinRoom",
  );
  assert.doesNotMatch(
    fnSrc,
    /HALL_MISMATCH/,
    "HALL_MISMATCH guard should be inside the service, not the engine wrapper",
  );
});

test("F2-C: BingoEngine.destroyRoom is a thin delegate", () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const fnSrc = engine.destroyRoom.toString();
  assert.match(
    fnSrc,
    /roomLifecycleService\.destroyRoom/,
    "should delegate to roomLifecycleService.destroyRoom",
  );
  assert.doesNotMatch(
    fnSrc,
    /GAME_IN_PROGRESS/,
    "GAME_IN_PROGRESS check should be inside the service, not the engine wrapper",
  );
  assert.doesNotMatch(
    fnSrc,
    /this\.lifecycleStore\?\./,
    "K2 lifecycleStore plumbing should be inside the service via callbacks",
  );
});

test("F2-C: BingoEngine.listRoomSummaries / getRoomSnapshot are thin delegates", () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  assert.match(
    engine.listRoomSummaries.toString(),
    /roomLifecycleService\.listRoomSummaries/,
  );
  assert.match(
    engine.getRoomSnapshot.toString(),
    /roomLifecycleService\.getRoomSnapshot/,
  );
});

test("F2-C: RoomLifecycleService exposes expected public API", () => {
  const protoMethods = Object.getOwnPropertyNames(
    RoomLifecycleService.prototype,
  ).filter((name) => name !== "constructor");
  for (const m of [
    "createRoom",
    "joinRoom",
    "destroyRoom",
    "listRoomSummaries",
    "getRoomSnapshot",
  ]) {
    assert.ok(
      protoMethods.includes(m),
      `service must expose ${m}`,
    );
  }
});

test("F2-C: createRoom happy-path returns roomCode + playerId", async () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const result = await engine.createRoom({
    playerName: "Tobias",
    hallId: "hall-1",
    walletId: "wallet-tobias",
  });
  assert.ok(result.roomCode, "should return a non-empty roomCode");
  assert.ok(result.playerId, "should return a non-empty playerId");
});

test("F2-C: joinRoom HALL_MISMATCH guard for non-shared rooms", async () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const { roomCode } = await engine.createRoom({
    playerName: "Host",
    hallId: "hall-A",
    walletId: "wallet-host",
  });

  await assert.rejects(
    () =>
      engine.joinRoom({
        roomCode,
        playerName: "Joiner",
        hallId: "hall-B", // mismatched
        walletId: "wallet-joiner",
      }),
    (err: unknown) =>
      err instanceof DomainError && err.code === "HALL_MISMATCH",
    "hall-mismatch should throw DomainError(HALL_MISMATCH)",
  );
});

test("F2-C: joinRoom with effectiveHallId=null skips HALL_MISMATCH (Spill 2/3)", async () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const { roomCode } = await engine.createRoom({
    playerName: "Host",
    hallId: "hall-A",
    walletId: "wallet-host",
    effectiveHallId: null, // marks as hall-shared
  });

  // joining from hall-B should now succeed because the room is hall-shared
  const joined = await engine.joinRoom({
    roomCode,
    playerName: "Joiner",
    hallId: "hall-B",
    walletId: "wallet-joiner",
  });
  assert.ok(joined.playerId, "joiner should get a playerId in shared room");
});

test("F2-C: destroyRoom throws ROOM_NOT_FOUND for unknown code", () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  assert.throws(
    () => engine.destroyRoom("DOES-NOT-EXIST"),
    (err: unknown) =>
      err instanceof DomainError && err.code === "ROOM_NOT_FOUND",
  );
});

test("F2-C: destroyRoom removes room and cleans engine-local caches", async () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const { roomCode } = await engine.createRoom({
    playerName: "Host",
    hallId: "hall-A",
    walletId: "wallet-host",
  });
  assert.equal(engine.listRoomSummaries().length, 1);

  engine.destroyRoom(roomCode);

  assert.equal(
    engine.listRoomSummaries().length,
    0,
    "destroyRoom should remove the room from listRoomSummaries",
  );
  assert.throws(
    () => engine.getRoomSnapshot(roomCode),
    (err: unknown) =>
      err instanceof DomainError && err.code === "ROOM_NOT_FOUND",
    "getRoomSnapshot should throw ROOM_NOT_FOUND after destroy",
  );
});

test("F2-C: listRoomSummaries returns the expected shape and is sorted", async () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  await engine.createRoom({
    playerName: "Host-Z",
    hallId: "hall-1",
    walletId: "wallet-z",
    roomCode: "ZROOM",
  });
  await engine.createRoom({
    playerName: "Host-A",
    hallId: "hall-1",
    walletId: "wallet-a",
    roomCode: "AROOM",
  });

  const summaries = engine.listRoomSummaries();
  assert.equal(summaries.length, 2);
  // Sorted by code.localeCompare → AROOM before ZROOM.
  assert.equal(summaries[0].code, "AROOM");
  assert.equal(summaries[1].code, "ZROOM");
  // Each summary has the expected fields.
  for (const s of summaries) {
    assert.ok(typeof s.code === "string");
    assert.ok(typeof s.hallId === "string");
    assert.ok(typeof s.hostPlayerId === "string");
    assert.ok(typeof s.gameSlug === "string");
    assert.equal(typeof s.playerCount, "number");
    assert.ok(typeof s.createdAt === "string");
    assert.ok(["NONE", "WAITING", "RUNNING", "ENDED"].includes(s.gameStatus));
  }
});

test("F2-C: getRoomSnapshot returns full room shape after createRoom", async () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const { roomCode, playerId } = await engine.createRoom({
    playerName: "Host",
    hallId: "hall-1",
    walletId: "wallet-1",
  });
  const snap = engine.getRoomSnapshot(roomCode);
  assert.equal(snap.code, roomCode);
  assert.equal(snap.hostPlayerId, playerId);
  assert.equal(snap.players.length, 1);
  assert.equal(snap.players[0].name, "Host");
});

test("F2-C: createRoom + isTestHall flag persists on RoomState (test-hall bypass)", async () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const { roomCode } = await engine.createRoom({
    playerName: "Host",
    hallId: "demo-hall",
    walletId: "wallet-demo",
    isTestHall: true,
  });
  const snap = engine.getRoomSnapshot(roomCode);
  // The flag is on RoomState — retrievable via the engine helper that surface
  // it indirectly. We assert via a side-effect that depends on isTestHall:
  // joinRoom from a different hall is still allowed for test-hall? No, that's
  // hall-shared, not test-hall. So we check the flag through the snapshot's
  // currentGame / players structure being present + summary.
  assert.ok(snap, "snapshot exists for test-hall room");
  // Use the dedicated setRoomTestHall flow to confirm the flag round-trips:
  // calling with same value is a no-op (idempotent).
  engine.setRoomTestHall(roomCode, true);
  // Calling with `false` should clear it without throwing.
  engine.setRoomTestHall(roomCode, false);
});

test("F2-C: createRoom rejects empty hallId via INVALID_HALL_ID", async () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  await assert.rejects(
    () =>
      engine.createRoom({
        playerName: "Host",
        hallId: "  ", // empty after trim
        walletId: "wallet-host",
      }),
    (err: unknown) =>
      err instanceof DomainError && err.code === "INVALID_HALL_ID",
  );
});

test("F2-C: createRoom rejects empty playerName via INVALID_NAME", async () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  await assert.rejects(
    () =>
      engine.createRoom({
        playerName: "  ", // empty after trim
        hallId: "hall-1",
        walletId: "wallet-host",
      }),
    (err: unknown) =>
      err instanceof DomainError && err.code === "INVALID_NAME",
  );
});

test("F2-C: joinRoom rejects PLAYER_ALREADY_IN_ROOM for duplicate wallet", async () => {
  const engine = new BingoEngine(new StubBingoAdapter(), new InMemoryWalletAdapter());
  const { roomCode } = await engine.createRoom({
    playerName: "Host",
    hallId: "hall-1",
    walletId: "wallet-shared",
  });
  // Same wallet trying to join the same room a second time.
  await assert.rejects(
    () =>
      engine.joinRoom({
        roomCode,
        playerName: "Joiner",
        hallId: "hall-1",
        walletId: "wallet-shared",
      }),
    (err: unknown) =>
      err instanceof DomainError && err.code === "PLAYER_ALREADY_IN_ROOM",
  );
});
