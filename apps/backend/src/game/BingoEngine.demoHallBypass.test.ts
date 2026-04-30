/**
 * Demo Hall bypass — Tobias 2026-04-27 (revised demo-blocker 2026-04-29).
 *
 *   "Vi har satt at spillet stopper når man treffer 1 rad, kan du endre
 *    at når den står på hallen som er Demo Hall (lokal testing) så stopper
 *    den ikke? det er da kun for å teste spillet."
 *
 * Når `RoomState.isTestHall === true` skal Spill 1 ad-hoc-engine
 * (BingoEnginePatternEval.evaluateActivePhase) hoppe over master-resume-
 * pausen mellom LINE-faser (1-4) slik at operatør får testet multi-phase-
 * progresjonen i samme draw uten å trykke Resume manuelt.
 *
 * Demo-blocker-revisjon 2026-04-29: Fullt Hus (BINGO) MÅ avslutte runden
 * normalt selv i test-hall — ellers fortsetter MAX_DRAWS-trekningen i
 * bakgrunnen mens vinneren prøver å spille mini-game (Mystery / Wheel /
 * Chest), og overlay-en blir revet ned før spilleren rakk å fullføre.
 *
 * Dekning:
 *   1) Spill 1 + isTestHall=true: fase 1 vunnet → game.isPaused IKKE satt,
 *      drawNextNumber kan kalles videre.
 *   2) Spill 1 + isTestHall=true: Fullt Hus vunnet → game.status=ENDED,
 *      endedReason=BINGO_CLAIMED (samme oppførsel som prod-hall — demo-
 *      blocker 2026-04-29 — så mini-game får tid til å fullføres uten å
 *      bli klippet av MAX_DRAWS).
 *   3) Spill 1 + isTestHall=true: runden ender på Fullt Hus, IKKE
 *      MAX_DRAWS — verifiserer at LINE-faser går automatisk men BINGO
 *      avslutter atomært.
 *   4) Spill 1 UTEN isTestHall: pause + end-on-Fullt-Hus uendret (regresjon).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { BingoEngine } from "./BingoEngine.js";
import { DomainError } from "../errors/DomainError.js";
import { InMemoryWalletAdapter } from "./BingoEngine.test.js";
import { DEFAULT_NORSK_BINGO_CONFIG } from "./variantConfig.js";
import type {
  BingoSystemAdapter,
  CreateTicketInput,
} from "../adapters/BingoSystemAdapter.js";
import type { Ticket } from "./types.js";

const PLAYER_A_GRID = [
  [1, 16, 31, 46, 61],
  [2, 17, 32, 47, 62],
  [3, 18, 0, 48, 63],
  [4, 19, 33, 49, 64],
  [5, 20, 34, 50, 65],
];

class FixedGridAdapter implements BingoSystemAdapter {
  async createTicket(_input: CreateTicketInput): Promise<Ticket> {
    return { grid: PLAYER_A_GRID.map((r) => [...r]) };
  }
}

/**
 * Setter de gitte tallene først i draw-bag-en så testen blir deterministisk.
 * Resten beholdes i opprinnelig random-rekkefølge.
 */
function prioritiseDrawBag(
  engine: BingoEngine,
  roomCode: string,
  numbers: number[],
): void {
  const rooms = (
    engine as unknown as {
      rooms: Map<string, { currentGame?: { drawBag: number[] } }>;
    }
  ).rooms;
  const bag = rooms.get(roomCode)?.currentGame?.drawBag;
  if (!bag) return;
  const preferred: number[] = [];
  const rest: number[] = [];
  const wanted = new Set(numbers);
  for (const n of bag) {
    if (wanted.has(n)) preferred.push(n);
    else rest.push(n);
  }
  preferred.sort((a, b) => numbers.indexOf(a) - numbers.indexOf(b));
  bag.length = 0;
  bag.push(...preferred, ...rest);
}

async function setupSpill1TestHallRoom(): Promise<{
  engine: BingoEngine;
  roomCode: string;
  hostId: string;
}> {
  const engine = new BingoEngine(
    new FixedGridAdapter(),
    new InMemoryWalletAdapter(),
    { minDrawIntervalMs: 0, minPlayersToStart: 1 },
  );
  const { roomCode, playerId: hostId } = await engine.createRoom({
    hallId: "hall-demo",
    playerName: "Alice",
    walletId: "w-alice",
    gameSlug: "bingo",
    isTestHall: true,
  });
  return { engine, roomCode, hostId: hostId! };
}

test("demo-hall-bypass — Spill 1 + isTestHall=true: fase 1 vunnet → INGEN auto-pause", async () => {
  const { engine, roomCode, hostId } = await setupSpill1TestHallRoom();
  await engine.startGame({
    roomCode,
    actorPlayerId: hostId,
    entryFee: 10,
    ticketsPerPlayer: 1,
    payoutPercent: 80,
    gameType: "standard",
    variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
  });

  // Trekk hele rad 0 → fase 1 ("1 Rad") vunnet på ball 5.
  prioritiseDrawBag(engine, roomCode, [1, 16, 31, 46, 61]);
  for (let i = 0; i < 5; i += 1) {
    await engine.drawNextNumber({ roomCode, actorPlayerId: hostId });
  }

  const snapshot = engine.getRoomSnapshot(roomCode);
  const game = snapshot.currentGame!;
  const phase1 = game.patternResults?.find((r) => r.patternName === "1 Rad");
  assert.equal(phase1?.isWon, true, "fase 1 skal være markert som vunnet");
  assert.equal(game.status, "RUNNING", "status forblir RUNNING");
  assert.notEqual(
    game.isPaused,
    true,
    "test-hall skal IKKE auto-pause etter fase-vinning",
  );

  // Neste draw skal fungere uten manuell resume.
  await assert.doesNotReject(
    engine.drawNextNumber({ roomCode, actorPlayerId: hostId }),
    "test-hall skal kunne trekke videre uten resume",
  );
});

test("demo-hall-bypass — Spill 1 + isTestHall=true: Fullt Hus vunnet → ender runden (mini-game-fix 2026-04-29)", async () => {
  // Demo-blocker-revisjon 2026-04-29: Fullt Hus skal AVSLUTTE runden også
  // i test-hall slik at vinneren faktisk får sett mini-game-overlay uten
  // å bli klippet av MAX_DRAWS-trekning i bakgrunnen. LINE-faser
  // (1 Rad → 4 Rader) bypasser fortsatt master-resume-pausen, men BINGO
  // (Fullt Hus) faller gjennom til normal end-of-round-flyten.
  const { engine, roomCode, hostId } = await setupSpill1TestHallRoom();
  await engine.startGame({
    roomCode,
    actorPlayerId: hostId,
    entryFee: 10,
    ticketsPerPlayer: 1,
    payoutPercent: 80,
    gameType: "standard",
    variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
  });

  // Trekk alle 24 ikke-nullceller — ingen pause mellom LINE-faser, og
  // Fullt Hus avslutter runden atomært på siste ball.
  const allAlice: number[] = [];
  for (const row of PLAYER_A_GRID) for (const n of row) if (n !== 0) allAlice.push(n);
  prioritiseDrawBag(engine, roomCode, allAlice);

  // Trekk baller helt til runden enten avsluttes eller alle 24 er trukket.
  let drawsTaken = 0;
  for (let i = 0; i < 24; i += 1) {
    try {
      await engine.drawNextNumber({ roomCode, actorPlayerId: hostId });
      drawsTaken += 1;
    } catch (err) {
      // Etter Fullt Hus skal status=ENDED og videre draw skal kaste
      // GAME_NOT_RUNNING.
      if (
        err instanceof DomainError &&
        err.code === "GAME_NOT_RUNNING"
      ) {
        break;
      }
      throw err;
    }
  }

  const game = engine.getRoomSnapshot(roomCode).currentGame!;
  const fullHus = game.patternResults?.find(
    (r) => r.patternName === "Fullt Hus",
  );
  assert.equal(fullHus?.isWon, true, "Fullt Hus skal være vunnet");
  assert.equal(
    game.status,
    "ENDED",
    "test-hall: Fullt Hus avslutter runden (samme oppførsel som prod-hall)",
  );
  assert.equal(
    game.bingoWinnerId,
    hostId,
    "bingoWinnerId skal settes så klient kan vise vinner-popup",
  );
  assert.equal(
    game.endedReason,
    "BINGO_CLAIMED",
    "endedReason skal være BINGO_CLAIMED — runden avsluttet via Fullt Hus, ikke MAX_DRAWS",
  );
  // Sanity: alle 5 LINE-faser skal være vunnet før Fullt Hus (LINE-bypass).
  const wonPhases = game.patternResults?.filter((r) => r.isWon).length ?? 0;
  assert.equal(
    wonPhases,
    5,
    `alle 5 faser skal være vunnet (1 Rad → Fullt Hus). Faktisk: ${wonPhases}. Trekk: ${drawsTaken}`,
  );
});

test("demo-hall-bypass — Spill 1 + isTestHall=true: alle LINE-faser progresserer uten pause før Fullt Hus", async () => {
  // Demo-blocker-revisjon 2026-04-29: LINE-bypass virker fortsatt — alle
  // 5 fasene er vunnet ved Fullt Hus, og runden avsluttes på BINGO-
  // patternet uten å traversere MAX_DRAWS_REACHED.
  const { engine, roomCode, hostId } = await setupSpill1TestHallRoom();
  await engine.startGame({
    roomCode,
    actorPlayerId: hostId,
    entryFee: 10,
    ticketsPerPlayer: 1,
    payoutPercent: 80,
    gameType: "standard",
    variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
  });

  const allAlice: number[] = [];
  for (const row of PLAYER_A_GRID) for (const n of row) if (n !== 0) allAlice.push(n);
  prioritiseDrawBag(engine, roomCode, allAlice);

  let draws = 0;
  for (let i = 0; i < 100; i += 1) {
    try {
      await engine.drawNextNumber({ roomCode, actorPlayerId: hostId });
      draws += 1;
    } catch (err) {
      if (
        err instanceof DomainError &&
        (err.code === "NO_MORE_NUMBERS" || err.code === "GAME_NOT_RUNNING")
      ) {
        // GAME_NOT_RUNNING = forventet etter Fullt Hus i revised demo-bypass.
        break;
      }
      throw err;
    }
  }

  const game = engine.getRoomSnapshot(roomCode).currentGame!;
  assert.equal(
    game.status,
    "ENDED",
    `status skal være ENDED til slutt. Trekk gjennomført: ${draws}`,
  );
  // Demo-blocker-revisjon 2026-04-29: BINGO_CLAIMED er nå forventet utfall
  // (mini-game trenger end-of-round). MAX_DRAWS_REACHED er fortsatt mulig
  // hvis ingen vinner Fullt Hus, men her vinner Alice alle 5 fasene.
  assert.equal(
    game.endedReason,
    "BINGO_CLAIMED",
    `endedReason skal være BINGO_CLAIMED i test-hall (revisjon 2026-04-29). Faktisk: ${game.endedReason}. Trekk: ${draws}`,
  );
});

test("demo-hall-bypass — Spill 1 UTEN isTestHall: regresjon — pause + end-on-Fullt-Hus uendret", async () => {
  // Sjekk at flagget kun aktiveres når eksplisitt satt — eksisterende
  // prod-haller (uten isTestHall) skal beholde dagens oppførsel.
  const engine = new BingoEngine(
    new FixedGridAdapter(),
    new InMemoryWalletAdapter(),
    { minDrawIntervalMs: 0, minPlayersToStart: 1 },
  );
  const { roomCode, playerId: hostId } = await engine.createRoom({
    hallId: "hall-prod",
    playerName: "Alice",
    walletId: "w-alice",
    gameSlug: "bingo",
    // isTestHall ikke satt → eksisterende prod-oppførsel
  });
  await engine.startGame({
    roomCode,
    actorPlayerId: hostId!,
    entryFee: 10,
    ticketsPerPlayer: 1,
    payoutPercent: 80,
    gameType: "standard",
    variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
  });

  prioritiseDrawBag(engine, roomCode, [1, 16, 31, 46, 61]);
  for (let i = 0; i < 5; i += 1) {
    await engine.drawNextNumber({ roomCode, actorPlayerId: hostId! });
  }

  const game = engine.getRoomSnapshot(roomCode).currentGame!;
  assert.equal(game.isPaused, true, "prod-hall skal fortsatt auto-pause");
  await assert.rejects(
    engine.drawNextNumber({ roomCode, actorPlayerId: hostId! }),
    (err: unknown) =>
      err instanceof DomainError && (err as DomainError).code === "GAME_PAUSED",
    "prod-hall skal fortsatt blokkere drawNext mens paused",
  );
});
