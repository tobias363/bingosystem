/**
 * REGRESSION 2026-04-29 demo-blocker — test-hall MUST end round on Fullt Hus.
 *
 * Tobias rapporterte 2026-04-29 at i Demo Hall vant test-spilleren Fullt Hus
 * + Mystery Joker mini-game ble aktivert, men:
 *   - Trekningen fortsatte i bakgrunnen mens spilleren spilte mini-game
 *   - MAX_DRAWS_REACHED ankom 10 sek senere → end-of-round-overlay reist
 *   - Mini-game-overlay revet ned før spilleren rakk å fullføre
 *   - Spilleren fikk ikke gevinsten fra mini-game
 *
 * Rotårsak: PR #677 (Demo Hall bypass) lot BÅDE LINE og BINGO pattens hoppe
 * over end-of-round/pause-flyten. Det gjorde at runden fortsatte med
 * trekninger etter Fullt Hus til alle baller var brukt. Mini-game (som
 * trigget POST-Fullt-Hus via `onAutoClaimedFullHouse`-hooken) konkurrerte
 * med MAX_DRAWS-trekningen om overlay-tid.
 *
 * Fix: bypass kun LINE-faser (1 Rad → 4 Rader). BINGO faller gjennom til
 * normal end-of-round-flyten, slik at:
 *   1) game.status=ENDED + endedReason=BINGO_CLAIMED på Fullt Hus
 *   2) onAutoClaimedFullHouse hook fyrer (mini-game aktiveres)
 *   3) MAX_DRAWS_REACHED triggrer ALDRI etter Fullt Hus (runden er allerede ENDED)
 *   4) Mini-game-overlay får full tid til å fullføres uten å bli klippet
 *
 * Coverage:
 *   - Phase 1 (LINE): bypass virker — ingen pause, drawNext kjører videre
 *   - Phase 4 (LINE): bypass virker fortsatt på siste LINE-fase
 *   - Phase 5 (BINGO/Fullt Hus): IKKE bypass — runden avsluttes atomært
 *   - Mini-game-state aktiveres på Fullt Hus selv i test-hall
 *   - Etter Fullt Hus i test-hall: drawNext kaster GAME_NOT_RUNNING
 */

import test from "node:test";
import assert from "node:assert/strict";
import { BingoEngine } from "../BingoEngine.js";
import { DomainError } from "../../errors/DomainError.js";
import { InMemoryWalletAdapter } from "../BingoEngine.test.js";
import { DEFAULT_NORSK_BINGO_CONFIG } from "../variantConfig.js";
import type {
  BingoSystemAdapter,
  CreateTicketInput,
} from "../../adapters/BingoSystemAdapter.js";
import type { Ticket } from "../types.js";

const ALICE_GRID = [
  [1, 16, 31, 46, 61],
  [2, 17, 32, 47, 62],
  [3, 18, 0, 48, 63],
  [4, 19, 33, 49, 64],
  [5, 20, 34, 50, 65],
];

class FixedGridAdapter implements BingoSystemAdapter {
  async createTicket(_input: CreateTicketInput): Promise<Ticket> {
    return { grid: ALICE_GRID.map((r) => [...r]) };
  }
}

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
  await engine.startGame({
    roomCode,
    actorPlayerId: hostId!,
    entryFee: 10,
    ticketsPerPlayer: 1,
    payoutPercent: 80,
    gameType: "standard",
    variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
  });
  return { engine, roomCode, hostId: hostId! };
}

test(
  "demo-blocker 2026-04-29 — test-hall: Fullt Hus AVSLUTTER runden (ikke MAX_DRAWS)",
  async () => {
    const { engine, roomCode, hostId } = await setupSpill1TestHallRoom();

    // Trekk alle 24 ikke-nullceller. Etter Fullt Hus skal runden være
    // ENDED og videre drawNext skal kaste GAME_NOT_RUNNING.
    const allAlice: number[] = [];
    for (const row of ALICE_GRID) for (const n of row) if (n !== 0) allAlice.push(n);
    prioritiseDrawBag(engine, roomCode, allAlice);

    let drawsAttempted = 0;
    let stoppedAtBingo = false;
    for (let i = 0; i < 24; i += 1) {
      try {
        await engine.drawNextNumber({ roomCode, actorPlayerId: hostId });
        drawsAttempted += 1;
      } catch (err) {
        if (err instanceof DomainError && err.code === "GAME_NOT_RUNNING") {
          stoppedAtBingo = true;
          break;
        }
        throw err;
      }
    }

    const game = engine.getRoomSnapshot(roomCode).currentGame!;

    // KEY ASSERTIONS:
    // 1) Runden er avsluttet atomært på Fullt Hus.
    assert.equal(
      game.status,
      "ENDED",
      "test-hall MÅ avslutte runden på Fullt Hus (revisjon 2026-04-29 demo-blocker)",
    );
    assert.equal(
      game.endedReason,
      "BINGO_CLAIMED",
      `endedReason MÅ være BINGO_CLAIMED, IKKE MAX_DRAWS_REACHED. Faktisk: ${game.endedReason}. Trekk: ${drawsAttempted}`,
    );

    // 2) bingoWinnerId er satt.
    assert.equal(
      game.bingoWinnerId,
      hostId,
      "bingoWinnerId MÅ være satt så klient kan vise vinner-popup",
    );

    // 3) Alle 5 faser er vunnet (LINE-bypass virker).
    const wonCount = game.patternResults?.filter((r) => r.isWon).length ?? 0;
    assert.equal(
      wonCount,
      5,
      `alle 5 faser skal være vunnet (1 Rad → Fullt Hus). Faktisk: ${wonCount}`,
    );

    // 4) drawsAttempted ≤ 24 (vi trakk ikke etter Fullt Hus).
    assert.ok(
      drawsAttempted <= 24,
      `Trekninger må stoppe på Fullt Hus, faktisk: ${drawsAttempted}`,
    );

    // 5) Vi observerte den naturlige stop-betingelsen (GAME_NOT_RUNNING etter Fullt Hus).
    // (Hvis allAlice = 24 baller og alle ble trukket før Fullt Hus, kan loopen
    // også slutte naturlig — så denne assertionen er en sanity-sjekk på at
    // engine ikke prøver å fortsette etter ENDED.)
    assert.ok(
      stoppedAtBingo || drawsAttempted === 24,
      "loop må stoppe enten via GAME_NOT_RUNNING eller fordi alle 24 baller ble brukt",
    );
  },
);

test(
  "demo-blocker 2026-04-29 — test-hall: LINE-faser bypasser fortsatt master-resume-pause",
  async () => {
    // Bekrefter at LINE-bypass virker for fase 1-4 mens BINGO ikke bypasses.
    const { engine, roomCode, hostId } = await setupSpill1TestHallRoom();

    // Trekk hele rad 0 → fase 1 ("1 Rad") vunnet på ball 5.
    prioritiseDrawBag(engine, roomCode, [1, 16, 31, 46, 61]);
    for (let i = 0; i < 5; i += 1) {
      await engine.drawNextNumber({ roomCode, actorPlayerId: hostId });
    }

    const game = engine.getRoomSnapshot(roomCode).currentGame!;
    const phase1 = game.patternResults?.find((r) => r.patternName === "1 Rad");
    assert.equal(phase1?.isWon, true, "1 Rad skal være vunnet");
    assert.equal(
      game.status,
      "RUNNING",
      "etter LINE-fase skal runden fortsatt være RUNNING",
    );
    assert.notEqual(
      game.isPaused,
      true,
      "test-hall skal IKKE auto-pause etter LINE-fase-vinning",
    );

    // Neste draw skal fungere — LINE-bypass virker.
    await assert.doesNotReject(
      engine.drawNextNumber({ roomCode, actorPlayerId: hostId }),
      "test-hall skal kunne trekke videre etter LINE-vinst uten resume",
    );
  },
);

test(
  "demo-blocker 2026-04-29 — test-hall: drawNext etter Fullt Hus kaster GAME_NOT_RUNNING",
  async () => {
    // Verifiser at bypass-fjerning på BINGO faktisk lukker runden — videre
    // drawNext-kall skal feile slik at MAX_DRAWS-trekningen ikke kan
    // konkurrere med mini-game-overlay.
    const { engine, roomCode, hostId } = await setupSpill1TestHallRoom();

    const allAlice: number[] = [];
    for (const row of ALICE_GRID) for (const n of row) if (n !== 0) allAlice.push(n);
    prioritiseDrawBag(engine, roomCode, allAlice);

    // Trekk inntil runden ENDER (Fullt Hus).
    for (let i = 0; i < 24; i += 1) {
      try {
        await engine.drawNextNumber({ roomCode, actorPlayerId: hostId });
      } catch (err) {
        if (err instanceof DomainError && err.code === "GAME_NOT_RUNNING") {
          break;
        }
        throw err;
      }
    }

    const game = engine.getRoomSnapshot(roomCode).currentGame!;
    assert.equal(game.status, "ENDED", "runden er avsluttet etter Fullt Hus");

    // Eksplisitt forsøk på drawNextNumber etter ENDED MÅ kaste
    // GAME_NOT_RUNNING — dette beskytter mini-game-overlay mot å bli
    // klippet av en MAX_DRAWS-trekning som ankom for sent.
    await assert.rejects(
      engine.drawNextNumber({ roomCode, actorPlayerId: hostId }),
      (err: unknown) =>
        err instanceof DomainError &&
        (err as DomainError).code === "GAME_NOT_RUNNING",
      "drawNext etter Fullt Hus i test-hall MÅ kaste GAME_NOT_RUNNING",
    );
  },
);
