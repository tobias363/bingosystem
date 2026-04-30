/**
 * REGRESSION 2026-04-30 Bug A — test-hall: Mystery Joker MUST activate on Fullt Hus.
 *
 * Tobias rapporterte 2026-04-30 at Fullt Hus i Demo Hall ikke trigger
 * Mystery Joker mini-game. PR #741 (demo-blocker) endret test-hall LINE-bypass
 * slik at BINGO faller gjennom til normal end-of-round-flyten — der
 * `onAutoClaimedFullHouse`-hooken er ment å fyre og aktivere mini-game.
 *
 * Denne test-en verifiserer at mini-game faktisk aktiveres når en spiller
 * vinner Fullt Hus i en test-hall via auto-claim-flyten:
 *
 *   1) Etter Fullt Hus skal `engine.getCurrentMiniGame(roomCode)` returnere
 *      en MiniGameState med riktig playerId.
 *   2) MiniGame-typen skal være `mysteryGame` (default for testing —
 *      `MYSTERY_FORCE_DEFAULT_FOR_TESTING=true` i BingoEngineMiniGames.ts).
 *   3) MiniGame skal IKKE være isPlayed=true ennå (player må gjøre valg).
 *   4) Mini-game skal være aktivert PARALLELT med game.status=ENDED slik at
 *      socket-laget kan emitere `minigame:activated` til vinneren etter at
 *      runden lukkes på `BINGO_CLAIMED`.
 *
 * Hvis denne test-en feiler:
 *   - Sjekk at `BingoEnginePatternEval.ts` kaller
 *     `callbacks.onAutoClaimedFullHouse` for `claimType === "BINGO"`
 *     FØR test-hall LINE-bypass-tidlig-return (linje ~586).
 *   - Sjekk at `BingoEngine.buildEvaluatePhaseCallbacks()` registrerer
 *     `onAutoClaimedFullHouse` som kaller `activateMiniGameHelper`.
 *   - Sjekk at `BingoEngineMiniGames.activateMiniGame` ikke returnerer
 *     null pga. saknet game.miniGame eller idempotent-guard.
 *
 * Dekker Bug A fra prompt 2026-04-30 ("Mystery Joker ikke koblet på Fullt Hus").
 */

import test from "node:test";
import assert from "node:assert/strict";
import { BingoEngine } from "../BingoEngine.js";
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

async function setupTestHallSpill1Room(): Promise<{
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
  "Bug A 2026-04-30 — test-hall: Mystery Joker MÅ aktiveres på Fullt Hus auto-claim",
  async () => {
    const { engine, roomCode, hostId } = await setupTestHallSpill1Room();

    // Pre-draw: ingen mini-game enda.
    const preMiniGame = engine.getCurrentMiniGame(roomCode);
    assert.equal(
      preMiniGame,
      null,
      "før Fullt Hus skal det IKKE være aktiv mini-game",
    );

    // Trekk alle 24 ikke-nullceller for å fullføre Fullt Hus.
    const allAlice: number[] = [];
    for (const row of ALICE_GRID) for (const n of row) if (n !== 0) allAlice.push(n);
    prioritiseDrawBag(engine, roomCode, allAlice);

    for (let i = 0; i < 24; i += 1) {
      try {
        await engine.drawNextNumber({ roomCode, actorPlayerId: hostId });
      } catch (err) {
        // GAME_NOT_RUNNING etter Fullt Hus er forventet.
        break;
      }
    }

    const game = engine.getRoomSnapshot(roomCode).currentGame!;

    // Sanity-sjekk: runden er avsluttet på Fullt Hus (PR #741-fix er bevart).
    assert.equal(game.status, "ENDED", "runden skal være ENDED");
    assert.equal(
      game.endedReason,
      "BINGO_CLAIMED",
      "endedReason skal være BINGO_CLAIMED",
    );
    assert.equal(
      game.bingoWinnerId,
      hostId,
      "bingoWinnerId skal være satt til vinneren",
    );

    // KEY ASSERTIONS — Bug A:
    // 1) Mini-game er aktivert via onAutoClaimedFullHouse-hooken.
    const miniGame = engine.getCurrentMiniGame(roomCode);
    assert.notEqual(
      miniGame,
      null,
      "mini-game MÅ være aktivert etter Fullt Hus auto-claim. " +
        "Hvis null: sjekk at onAutoClaimedFullHouse kalles for BINGO " +
        "i BingoEnginePatternEval.ts før test-hall LINE-bypass.",
    );

    // 2) MiniGame tilhører vinneren (hostId).
    assert.equal(
      miniGame!.playerId,
      hostId,
      "mini-game.playerId skal være vinnerens playerId",
    );

    // 3) Type er mysteryGame (testing-flag forcer Mystery som default).
    assert.equal(
      miniGame!.type,
      "mysteryGame",
      `mini-game.type skal være mysteryGame (default for testing). ` +
        `Faktisk: ${miniGame!.type}`,
    );

    // 4) Mini-game er IKKE allerede spilt.
    assert.equal(
      miniGame!.isPlayed,
      false,
      "mini-game.isPlayed skal være false — spilleren må gjøre valg først",
    );

    // 5) prizeList er satt (legacy-payload-form for socket-emit).
    assert.ok(
      Array.isArray(miniGame!.prizeList) && miniGame!.prizeList.length > 0,
      "mini-game.prizeList må være populert for `minigame:activated`-emit",
    );
  },
);

test(
  "Bug A 2026-04-30 — getCurrentMiniGame returnerer null før Fullt Hus selv etter LINE-faser",
  async () => {
    // Verifiser at LINE-faser IKKE aktiverer mini-game (kun BINGO gjør det).
    const { engine, roomCode, hostId } = await setupTestHallSpill1Room();

    // Trekk hele rad 0 → fase 1 ("1 Rad") vunnet.
    prioritiseDrawBag(engine, roomCode, [1, 16, 31, 46, 61]);
    for (let i = 0; i < 5; i += 1) {
      await engine.drawNextNumber({ roomCode, actorPlayerId: hostId });
    }

    const game = engine.getRoomSnapshot(roomCode).currentGame!;
    const phase1Won =
      game.patternResults?.find((r) => r.patternName === "1 Rad")?.isWon ?? false;
    assert.equal(phase1Won, true, "fase 1 (1 Rad) skal være vunnet");

    // Mini-game skal IKKE være aktivert ennå.
    const miniGame = engine.getCurrentMiniGame(roomCode);
    assert.equal(
      miniGame,
      null,
      "mini-game skal IKKE aktiveres på LINE-fase — kun på Fullt Hus (BINGO)",
    );
  },
);

test(
  "Bug A 2026-04-30 — onAutoClaimedFullHouse-hook idempotent: re-trigger på samme runde overskriver ikke",
  async () => {
    // Hvis hooken kalles flere ganger (race med claim:submit fra klient),
    // skal `activateMiniGameHelper` returnere eksisterende state uten å
    // overskrive — beskytter mot double-trigger-bug der player.lastMiniGame
    // skifter mellom Mystery / Wheel / Chest / ColorDraft mid-flight.
    const { engine, roomCode, hostId } = await setupTestHallSpill1Room();

    const allAlice: number[] = [];
    for (const row of ALICE_GRID) for (const n of row) if (n !== 0) allAlice.push(n);
    prioritiseDrawBag(engine, roomCode, allAlice);

    for (let i = 0; i < 24; i += 1) {
      try {
        await engine.drawNextNumber({ roomCode, actorPlayerId: hostId });
      } catch (err) {
        break;
      }
    }

    const firstMiniGame = engine.getCurrentMiniGame(roomCode);
    assert.notEqual(firstMiniGame, null, "mini-game skal være aktivert etter Fullt Hus");

    // Forsøk eksplisitt re-aktivering — skal returnere samme state.
    const secondActivation = engine.activateMiniGame(roomCode, hostId);
    assert.equal(
      secondActivation?.type,
      firstMiniGame!.type,
      "re-aktivering skal returnere samme type (idempotent)",
    );
    assert.equal(
      secondActivation?.playerId,
      firstMiniGame!.playerId,
      "re-aktivering skal returnere samme playerId (idempotent)",
    );
  },
);
