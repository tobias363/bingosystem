/**
 * REGRESSION 2026-04-28 — Bug B: room:create / room:join må bruke
 * canonical-aware lookup, ikke `getPrimaryRoomForHall(hallId)`.
 *
 * Tobias rapporterte: "Spiller TestBruker81632 deltar allerede i et annet
 * aktivt spill (rom 4RCQSX)". Random rom-kode `4RCQSX` indikerer at
 * canonical-mappingen IKKE traff — vi falt gjennom til `makeRoomCode()`
 * som gir tilfeldig 6-tegns kode.
 *
 * Root cause: `getPrimaryRoomForHall(hallId)` filtrerer kandidater på
 * `room.hallId === hallId`. For Spill 1 group-of-halls-rom og Spill 2/3
 * shared-rooms er `room.hallId` whoever opprettet rommet — ikke
 * nødvendigvis joinende spillerens hall. Hall B finner derfor IKKE
 * canonical-rommet skapt av Hall A i samme gruppe → fall through til
 * createRoom med ny tilfeldig kode.
 *
 * Fix (denne PR): bruk `engine.findRoomByCode(canonicalCode)` direkte.
 * Validerer at to spillere fra ulike haller i samme gruppe ender i SAMME
 * rom (canonical), ikke i to separate ad-hoc-rom.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { BingoEngine } from "../../game/BingoEngine.js";
import { InMemoryWalletAdapter } from "../../game/BingoEngine.test.js";
import { getCanonicalRoomCode } from "../../util/canonicalRoomCode.js";
import type {
  BingoSystemAdapter,
  CreateTicketInput,
} from "../../adapters/BingoSystemAdapter.js";
import type { Ticket } from "../../game/types.js";

class FixedGridAdapter implements BingoSystemAdapter {
  async createTicket(_input: CreateTicketInput): Promise<Ticket> {
    return {
      grid: [
        [1, 16, 31, 46, 61],
        [2, 17, 32, 47, 62],
        [3, 18, 0, 48, 63],
        [4, 19, 33, 49, 64],
        [5, 20, 34, 50, 65],
      ],
    };
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
 * Simulerer den FIXEDE roomEvents.ts-handler-logikken for room:create:
 *   1) Hent canonical mapping (group-of-halls)
 *   2) findRoomByCode(canonicalCode)
 *   3) Hvis funnet → joinRoom (cross-hall ok hvis isHallShared=true)
 *   4) Hvis ikke → createRoom med canonical kode
 */
async function simulateRoomCreate(
  engine: BingoEngine,
  hallId: string,
  groupId: string | null,
  walletId: string,
  playerName: string,
): Promise<{ roomCode: string; playerId: string }> {
  const canonicalMapping = getCanonicalRoomCode("bingo", hallId, groupId);
  const existing = engine.findRoomByCode(canonicalMapping.roomCode);
  if (existing) {
    const joined = await engine.joinRoom({
      roomCode: existing.code,
      hallId,
      playerName,
      walletId,
    });
    return { roomCode: existing.code, playerId: joined.playerId };
  }
  return engine.createRoom({
    playerName,
    hallId,
    walletId,
    roomCode: canonicalMapping.roomCode,
    effectiveHallId: canonicalMapping.effectiveHallId,
    gameSlug: "bingo",
  });
}

test(
  "Bug B fix: Hall A oppretter canonical rom; Hall B joiner SAMME rom (ikke random kode)",
  async () => {
    const engine = makeEngine();
    const groupId = "group-1";

    // Hall A oppretter canonical room for Spill 1 group
    const a = await simulateRoomCreate(
      engine,
      "hall-a",
      groupId,
      "wallet-alice",
      "Alice",
    );
    // Forventet kode er BINGO_GROUP-1 (uppercased av canonicalRoomCode)
    assert.equal(
      a.roomCode,
      "BINGO_GROUP-1",
      "Hall A's first join skal opprette canonical kode",
    );

    // Hall B i samme gruppe oppretter rom — skal finne SAMME canonical
    const b = await simulateRoomCreate(
      engine,
      "hall-b",
      groupId,
      "wallet-bob",
      "Bob",
    );
    assert.equal(
      b.roomCode,
      a.roomCode,
      "Hall B i samme gruppe skal joine SAMME canonical room (ikke random)",
    );

    // Player IDs skal være forskjellige (separate spillere)
    assert.notEqual(a.playerId, b.playerId);

    // Begge spillere er i samme rom
    const snapshot = engine.getRoomSnapshot(a.roomCode);
    assert.equal(snapshot.players.length, 2);
    const wallets = snapshot.players.map((p) => p.walletId).sort();
    assert.deepEqual(wallets, ["wallet-alice", "wallet-bob"]);
  },
);

test(
  "Bug B fix: Hall A og Hall B i FORSKJELLIGE grupper får separate rom",
  async () => {
    const engine = makeEngine();

    // Hall A i gruppe 1 oppretter canonical
    const a = await simulateRoomCreate(
      engine,
      "hall-a",
      "group-1",
      "wallet-alice",
      "Alice",
    );

    // Hall B i gruppe 2 oppretter canonical i SIN gruppe
    const b = await simulateRoomCreate(
      engine,
      "hall-b",
      "group-2",
      "wallet-bob",
      "Bob",
    );

    // Forskjellige rom forventet (regulatorisk: pengene følger gruppen)
    assert.notEqual(
      a.roomCode,
      b.roomCode,
      "haller i forskjellige grupper skal ha separate canonical rom",
    );
    assert.equal(a.roomCode, "BINGO_GROUP-1");
    assert.equal(b.roomCode, "BINGO_GROUP-2");
  },
);

test(
  "Bug B fix: Hall uten gruppe får hallId-basert canonical (fallback)",
  async () => {
    const engine = makeEngine();

    // Hall uten gruppe → groupId er null → fallback til hallId
    const a = await simulateRoomCreate(
      engine,
      "hall-solo",
      null,
      "wallet-alice",
      "Alice",
    );
    assert.equal(a.roomCode, "BINGO_HALL-SOLO", "fallback til hallId i uppercased form");
  },
);

test(
  "Bug B fix: re-entry til samme canonical rom etter idle (ikke 'deltar allerede')",
  async () => {
    const engine = makeEngine();

    // Spiller går inn i rommet
    const first = await simulateRoomCreate(
      engine,
      "hall-a",
      "group-1",
      "wallet-alice",
      "Alice",
    );

    // Spilleren disconnect-er (vi simulerer ved å fjerne socketId)
    const rooms = (
      engine as unknown as {
        rooms: Map<string, { players: Map<string, { socketId?: string }> }>;
      }
    ).rooms;
    const room = rooms.get(first.roomCode);
    assert.ok(room);
    for (const player of room.players.values()) {
      player.socketId = undefined;
    }

    // Cleanup stale wallet-bindings (skal kjøres av room:create-handler)
    engine.cleanupStaleWalletInIdleRooms("wallet-alice");

    // Re-entry skal lykkes uten "deltar allerede"-feil
    const second = await simulateRoomCreate(
      engine,
      "hall-a",
      "group-1",
      "wallet-alice",
      "Alice",
    );

    assert.equal(
      second.roomCode,
      first.roomCode,
      "re-entry skal returnere samme canonical rom",
    );
  },
);
