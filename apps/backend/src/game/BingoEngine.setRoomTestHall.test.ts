/**
 * REGRESSION 2026-04-28 — Bug A + Bug B helpers.
 *
 * Tobias rapporterte 2026-04-28 at /web/-spillere i Demo Hall opplever at
 * spillet henger på Phase 1, selv etter PR #671 ("propager isTestHall fra
 * socket-laget"). PR #671 fikset INITIAL createRoom — men eksisterende
 * rooms (skapt før deploy, eller opprettet i en tidligere session) har
 * fortsatt `RoomState.isTestHall=undefined` og pauser fortsatt etter
 * Phase 1.
 *
 * FIX: ny `BingoEngine.setRoomTestHall(roomCode, isTestHall)` lar socket-
 * laget refreshe flagget på et eksisterende rom i `room:create`,
 * `room:join` og `game1:join-scheduled`-flytene — uten å destroy-e og
 * re-create.
 *
 * Også test for `findRoomByCode` (Bug B helper) — som finner rom basert
 * på rom-kode UANSETT hvilken hall som opprettet det. Brukes til canonical
 * lookup hvor `getPrimaryRoomForHall(hallId)` filtrerer på hallId og
 * misset shared canonical rooms (Spill 1 group-of-halls).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { BingoEngine } from "./BingoEngine.js";
import { InMemoryWalletAdapter } from "./BingoEngine.test.js";
import type {
  BingoSystemAdapter,
  CreateTicketInput,
} from "../adapters/BingoSystemAdapter.js";
import type { Ticket } from "./types.js";

const FIXED_GRID = [
  [1, 16, 31, 46, 61],
  [2, 17, 32, 47, 62],
  [3, 18, 0, 48, 63],
  [4, 19, 33, 49, 64],
  [5, 20, 34, 50, 65],
];

class FixedGridAdapter implements BingoSystemAdapter {
  async createTicket(_input: CreateTicketInput): Promise<Ticket> {
    return { grid: FIXED_GRID.map((r) => [...r]) };
  }
}

function makeEngine(): BingoEngine {
  return new BingoEngine(
    new FixedGridAdapter(),
    new InMemoryWalletAdapter(),
    { minDrawIntervalMs: 0, minPlayersToStart: 1 },
  );
}

/**
 * RoomState.isTestHall er ikke eksponert via `getRoomSnapshot()` (den er
 * intern engine-state), så vi cast-er til engine.rooms-mappet direkte —
 * samme mønster som `BingoEnginePatternEval.demoHallPhaseProgression.test.ts`.
 */
function readIsTestHall(engine: BingoEngine, roomCode: string): boolean | undefined {
  const rooms = (
    engine as unknown as {
      rooms: Map<string, { isTestHall?: boolean }>;
    }
  ).rooms;
  return rooms.get(roomCode)?.isTestHall;
}

// ── setRoomTestHall ──────────────────────────────────────────────────────

test("setRoomTestHall — sets isTestHall=true on existing room created without flag (Bug A)", async () => {
  const engine = makeEngine();

  // Opprett et rom UTEN isTestHall — etterlikner pre-#671-deploy-tilstand
  // hvor socket-laget IKKE propagerte flagget.
  const { roomCode } = await engine.createRoom({
    playerName: "Alice",
    hallId: "hall-a",
    walletId: "wallet-a",
    gameSlug: "bingo",
  });
  assert.notEqual(
    readIsTestHall(engine, roomCode),
    true,
    "rom uten initial isTestHall skal ikke være true",
  );

  // Refresh: hent inn flagget fra DB-lookup (slik room:create-handler gjør)
  engine.setRoomTestHall(roomCode, true);
  assert.equal(
    readIsTestHall(engine, roomCode),
    true,
    "etter setRoomTestHall(true) skal isTestHall være true",
  );
});

test("setRoomTestHall — clears isTestHall when DB-flagget endres til false", async () => {
  const engine = makeEngine();

  const { roomCode } = await engine.createRoom({
    playerName: "Alice",
    hallId: "hall-demo",
    walletId: "wallet-a",
    gameSlug: "bingo",
    isTestHall: true,
  });
  assert.equal(readIsTestHall(engine, roomCode), true, "initial isTestHall=true");

  // Admin fjerner test-hall-flagget i DB → caller refresher
  engine.setRoomTestHall(roomCode, false);
  assert.notEqual(
    readIsTestHall(engine, roomCode),
    true,
    "etter setRoomTestHall(false) skal isTestHall ikke lenger være true",
  );
});

test("setRoomTestHall — no-op for ikke-eksisterende rom (fail-soft)", () => {
  const engine = makeEngine();

  // Skal ikke kaste — bare en silent no-op (rommet kan være ryddet i mellomtiden)
  engine.setRoomTestHall("DOES-NOT-EXIST", true);
  // hvis call-en hadde kastet ville testen feilet
});

test("setRoomTestHall — idempotent (samme verdi → ingen state-mutasjon)", async () => {
  const engine = makeEngine();

  const { roomCode } = await engine.createRoom({
    playerName: "Alice",
    hallId: "hall-demo",
    walletId: "wallet-a",
    gameSlug: "bingo",
    isTestHall: true,
  });

  engine.setRoomTestHall(roomCode, true);
  engine.setRoomTestHall(roomCode, true);
  engine.setRoomTestHall(roomCode, true);

  assert.equal(readIsTestHall(engine, roomCode), true);
});

// ── findRoomByCode ───────────────────────────────────────────────────────

test("findRoomByCode — finner rom basert på eksakt kode (Bug B)", async () => {
  const engine = makeEngine();

  // Opprett rom skapt av Hall A med eksplisitt canonical kode
  await engine.createRoom({
    playerName: "Alice",
    hallId: "hall-a",
    walletId: "wallet-a",
    roomCode: "BINGO_GROUP1",
    effectiveHallId: null, // shared = null
    gameSlug: "bingo",
  });

  // Hall B finner det samme rommet via canonical-koden,
  // selv om rommet ble opprettet av Hall A
  const found = engine.findRoomByCode("BINGO_GROUP1");
  assert.notEqual(found, null, "skal finne rommet via canonical kode");
  assert.equal(found?.code, "BINGO_GROUP1");
  assert.equal(
    found?.hallId,
    "hall-a",
    "rom.hallId er fortsatt opprettende hall (audit-trail)",
  );
});

test("findRoomByCode — returnerer null for ikke-eksisterende kode", () => {
  const engine = makeEngine();

  const found = engine.findRoomByCode("DOES-NOT-EXIST");
  assert.equal(found, null);
});

test("findRoomByCode — case-insensitive (uppercases input)", async () => {
  const engine = makeEngine();

  await engine.createRoom({
    playerName: "Alice",
    hallId: "hall-a",
    walletId: "wallet-a",
    roomCode: "BINGO_GROUP1",
    gameSlug: "bingo",
  });

  // Lowercase input skal mappes til samme rom
  const found = engine.findRoomByCode("bingo_group1");
  assert.notEqual(found, null);
  assert.equal(found?.code, "BINGO_GROUP1");
});

// ── Combined Bug A + Bug B scenario ─────────────────────────────────────

test(
  "Bug B + Bug A: Hall B kan joine Hall A's canonical room + få isTestHall refreshed",
  async () => {
    const engine = makeEngine();

    // Hall A (i samme group som Hall B) oppretter canonical room.
    // ETTERLIKNER: socket-laget i room:create gjør getCanonicalRoomCode →
    // BINGO_<groupId>, kaller engine.createRoom uten isTestHall (pre-fix).
    const created = await engine.createRoom({
      playerName: "Alice",
      hallId: "hall-a",
      walletId: "wallet-a-alice",
      roomCode: "BINGO_GROUP1",
      effectiveHallId: null, // shared
      gameSlug: "bingo",
      // INGEN isTestHall — etterlikner gammel rom-tilstand
    });
    assert.equal(created.roomCode, "BINGO_GROUP1");

    // Hall B (samme group) skal nå finne BINGO_GROUP1 via findRoomByCode,
    // IKKE via getPrimaryRoomForHall (som ville filtrert på room.hallId='hall-a').
    const existing = engine.findRoomByCode("BINGO_GROUP1");
    assert.notEqual(existing, null, "Bug B fix: shared canonical room found");

    // Hall B refresher isTestHall (Bug A fix)
    engine.setRoomTestHall("BINGO_GROUP1", true);

    // Verifiser at isTestHall er nå satt
    assert.equal(
      readIsTestHall(engine, "BINGO_GROUP1"),
      true,
      "Bug A fix: isTestHall er nå true på eksisterende rom",
    );

    // Hall B kan også joine rommet (shared room → ingen HALL_MISMATCH)
    const joined = await engine.joinRoom({
      roomCode: "BINGO_GROUP1",
      hallId: "hall-b", // forskjellig fra room.hallId='hall-a'
      playerName: "Bob",
      walletId: "wallet-b-bob",
    });
    assert.equal(joined.roomCode, "BINGO_GROUP1");
    assert.notEqual(joined.playerId, created.playerId);
  },
);
