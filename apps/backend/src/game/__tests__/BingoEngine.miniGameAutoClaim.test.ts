/**
 * BingoEngine.miniGameAutoClaim.test.ts
 *
 * Repro + fix for Tobias prod-incident 2026-04-29:
 * Mini-game (Mystery / Wheel / Chest / ColorDraft) ble IKKE trigget når
 * Fullt Hus ble vunnet i ad-hoc Spill 1 auto-round-flow på Demo Hall —
 * selv om `MYSTERY_FORCE_DEFAULT_FOR_TESTING=true` var satt.
 *
 * Root cause: mini-game-aktivering var KUN koblet til socket-handler
 * `claim:submit` i `claimEvents.ts:91-102`. Spill 1 auto-round-flow
 * bruker `autoClaimPhaseMode` der `BingoEngine.evaluateActivePhase`
 * auto-claimer patterns server-side — klient sender aldri `claim:submit`,
 * så `activateMiniGame` ble aldri kalt.
 *
 * Verifisert i prod 2026-04-29 15:00: Demo Hall game `88cc2887` ENDED
 * med alle 5 patterns vunnet, betalte ut 1740 kr, men ingen mini-game-
 * popup dukket opp.
 *
 * Fix: ny `onAutoClaimedFullHouse`-callback på
 * `EvaluatePhaseCallbacks` som kalles etter Fullt Hus auto-claim;
 * `BingoEngine.buildEvaluatePhaseCallbacks` wirer den til
 * `activateMiniGameHelper`. Socket-laget (drawEvents.ts) detekterer
 * mini-game-state via før/etter-snapshot og emitterer
 * `minigame:activated` til vinnerens wallet-rom.
 *
 * Test scope (per brief):
 *   1. Auto-claim Fullt Hus → activateMiniGame called → MiniGameState set
 *      med type="mysteryGame" (gjeldende `MYSTERY_FORCE_DEFAULT_FOR_TESTING=true`)
 *   2. Multi-winner Fullt Hus → mini-game aktivert (én per round, første
 *      deterministiske vinner) — engine-callback fires med hele winnerIds-liste
 *   3. Re-evaluering av samme game (idempotent) → re-trigger ikke mini-game
 *   4. Manuell claim:submit-pathen påvirkes IKKE — fremdeles aktiveres
 *      mini-game når engine.activateMiniGame() kalles direkte
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

const PLAYER_A_GRID = [
  [1, 16, 31, 46, 61],
  [2, 17, 32, 47, 62],
  [3, 18, 0, 48, 63],
  [4, 19, 33, 49, 64],
  [5, 20, 34, 50, 65],
];

class FixedTicketAdapter implements BingoSystemAdapter {
  async createTicket(_input: CreateTicketInput): Promise<Ticket> {
    return { grid: PLAYER_A_GRID.map((row) => [...row]) };
  }
}

/**
 * Speil av prioritiseDrawBag-helperen fra fivePhase / adhocPhase3to5Repro:
 * setter de gitte tallene først i drawBag så testen blir deterministisk.
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

/** Resume-helper for Spill 1 auto-pause-på-fase-win (PR #643). */
async function drawWithMasterResume(
  engine: BingoEngine,
  roomCode: string,
  actorPlayerId: string,
): Promise<void> {
  const snap = engine.getRoomSnapshot(roomCode);
  if (snap.currentGame?.isPaused) {
    engine.resumeGame(roomCode);
  }
  await engine.drawNextNumber({ roomCode, actorPlayerId });
}

test("Tobias 2026-04-29: auto-claim Fullt Hus aktiverer mini-game (mysteryGame)", async () => {
  // Solo-spiller på et ad-hoc bingo-rom. Auto-round-flow uten manuell
  // claim:submit. Forventet: når Fullt Hus auto-claimes i siste draw,
  // skal `game.miniGame` settes med type "mysteryGame" (gjeldende
  // MYSTERY_FORCE_DEFAULT_FOR_TESTING-flagg).
  const engine = new BingoEngine(
    new FixedTicketAdapter(),
    new InMemoryWalletAdapter(),
    { minDrawIntervalMs: 0, minPlayersToStart: 1 },
  );
  const { roomCode, playerId: hostId } = await engine.createRoom({
    hallId: "hall-1",
    playerName: "Alice",
    walletId: "w-alice",
    gameSlug: "bingo",
  });
  await engine.startGame({
    roomCode,
    actorPlayerId: hostId!,
    entryFee: 45,
    ticketsPerPlayer: 1,
    payoutPercent: 80,
    gameType: "bingo",
    variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
  });

  // Pre-condition: ingen mini-game før draws.
  assert.equal(
    engine.getCurrentMiniGame(roomCode),
    null,
    "Pre-condition: ingen mini-game før første draw",
  );

  // Trekk alle 24 tall fra PLAYER_A_GRID → fyller alle 5 phaser inkl. Fullt Hus.
  const allAlice: number[] = [];
  for (const row of PLAYER_A_GRID) for (const n of row) if (n !== 0) allAlice.push(n);
  prioritiseDrawBag(engine, roomCode, allAlice);

  for (let i = 0; i < 24; i += 1) {
    await drawWithMasterResume(engine, roomCode, hostId!);
    const snap = engine.getRoomSnapshot(roomCode);
    if (snap.currentGame?.status === "ENDED") break;
  }

  const final = engine.getRoomSnapshot(roomCode).currentGame!;
  assert.equal(
    final.status,
    "ENDED",
    "Pre-condition: runden skal være ENDED på Fullt Hus",
  );
  assert.equal(final.endedReason, "BINGO_CLAIMED");

  // KJERNE-ASSERTION: mini-game skal være aktivert etter auto-claim.
  // Tidligere (pre-fix) ville denne være null fordi `evaluateActivePhase`
  // aldri kalte `activateMiniGame`. Etter fix: `onAutoClaimedFullHouse`
  // kalles fra evaluator → wires til `activateMiniGameHelper` →
  // `game.miniGame` settes.
  const miniGame = engine.getCurrentMiniGame(roomCode);
  assert.ok(
    miniGame,
    "Mini-game skal være aktivert etter Fullt Hus auto-claim — bug 2026-04-29",
  );
  assert.equal(
    miniGame!.type,
    "mysteryGame",
    "MYSTERY_FORCE_DEFAULT_FOR_TESTING=true → mini-game type skal være mysteryGame",
  );
  assert.equal(
    miniGame!.playerId,
    hostId,
    "Mini-game skal tilhøre Fullt Hus-vinneren (solo: hostId)",
  );
  assert.equal(
    miniGame!.isPlayed,
    false,
    "Mini-game skal ikke være spilt enda — vinneren må trigge minigame:play",
  );
  assert.ok(
    Array.isArray(miniGame!.prizeList) && miniGame!.prizeList.length > 0,
    "Mini-game skal ha en ikke-tom prizeList",
  );
});

test("Tobias 2026-04-29: multi-winner Fullt Hus aktiverer mini-game for første deterministiske vinner", async () => {
  // To spillere med identisk grid → begge fullfører Fullt Hus på samme ball.
  // Engine bruker deterministisk lex-sort på playerId (sortWinnerIdsDeterministic),
  // og mini-game-schemaet har én playerId per game → vi forventer at
  // mini-game aktiveres for den lex-tidligste playerId-en.
  const engine = new BingoEngine(
    new FixedTicketAdapter(),
    new InMemoryWalletAdapter(),
    { minDrawIntervalMs: 0, minPlayersToStart: 1 },
  );

  const { roomCode, playerId: hostId } = await engine.createRoom({
    hallId: "hall-multi",
    playerName: "Alice",
    walletId: "w-alice-multi",
    gameSlug: "bingo",
  });
  const { playerId: guestId } = await engine.joinRoom({
    roomCode,
    hallId: "hall-multi",
    playerName: "Zoe",
    walletId: "w-zoe-multi",
  });

  // entryFee*2 spillere → tilstrekkelig prizePool så multi-winner-split fungerer.
  await engine.startGame({
    roomCode,
    actorPlayerId: hostId!,
    entryFee: 200,
    ticketsPerPlayer: 1,
    payoutPercent: 80,
    gameType: "bingo",
    variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
  });

  const allAlice: number[] = [];
  for (const row of PLAYER_A_GRID) for (const n of row) if (n !== 0) allAlice.push(n);
  prioritiseDrawBag(engine, roomCode, allAlice);

  for (let i = 0; i < 24; i += 1) {
    await drawWithMasterResume(engine, roomCode, hostId!);
    const snap = engine.getRoomSnapshot(roomCode);
    if (snap.currentGame?.status === "ENDED") break;
  }

  const final = engine.getRoomSnapshot(roomCode).currentGame!;
  assert.equal(final.status, "ENDED");
  assert.equal(final.endedReason, "BINGO_CLAIMED");

  // Begge spillere må stå i winnerIds for Fullt Hus-fasen.
  const fullHouse = (final.patternResults ?? []).find(
    (r) => r.patternName === "Fullt Hus",
  );
  assert.ok(fullHouse, "Fullt Hus pattern-result skal eksistere");
  assert.equal(fullHouse!.isWon, true);
  const winnerIds = fullHouse!.winnerIds ?? [];
  assert.ok(
    winnerIds.includes(hostId!) && winnerIds.includes(guestId!),
    `Begge spillere skal være vinnere — faktisk: ${JSON.stringify(winnerIds)}`,
  );

  // Mini-game skal være aktivert. Schema har én playerId per game, så
  // vi sjekker at den tilhører EN av vinnerne (ikke en tredje part).
  const miniGame = engine.getCurrentMiniGame(roomCode);
  assert.ok(miniGame, "Mini-game skal være aktivert ved multi-winner Fullt Hus");
  assert.ok(
    winnerIds.includes(miniGame!.playerId),
    `Mini-game playerId skal være en av vinnerne — faktisk: ${miniGame!.playerId}, vinnere: ${JSON.stringify(winnerIds)}`,
  );
  assert.equal(miniGame!.type, "mysteryGame");
});

test("Tobias 2026-04-29: re-evaluering av samme game er idempotent — mini-game aktiveres ikke på nytt", async () => {
  // Engine har idempotency-guard på `game.miniGame` i activateMiniGame
  // (BingoEngineMiniGames.ts:262). Vi verifiserer at en eksplisitt
  // `engine.activateMiniGame()`-call ETTER auto-claim ikke overskriver
  // den allerede-aktiverte mini-gamen.
  const engine = new BingoEngine(
    new FixedTicketAdapter(),
    new InMemoryWalletAdapter(),
    { minDrawIntervalMs: 0, minPlayersToStart: 1 },
  );
  const { roomCode, playerId: hostId } = await engine.createRoom({
    hallId: "hall-idempotent",
    playerName: "Alice",
    walletId: "w-alice-idemp",
    gameSlug: "bingo",
  });
  await engine.startGame({
    roomCode,
    actorPlayerId: hostId!,
    entryFee: 45,
    ticketsPerPlayer: 1,
    payoutPercent: 80,
    gameType: "bingo",
    variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
  });

  const allAlice: number[] = [];
  for (const row of PLAYER_A_GRID) for (const n of row) if (n !== 0) allAlice.push(n);
  prioritiseDrawBag(engine, roomCode, allAlice);

  for (let i = 0; i < 24; i += 1) {
    await drawWithMasterResume(engine, roomCode, hostId!);
    const snap = engine.getRoomSnapshot(roomCode);
    if (snap.currentGame?.status === "ENDED") break;
  }

  const firstMiniGame = engine.getCurrentMiniGame(roomCode);
  assert.ok(firstMiniGame, "Pre-condition: mini-game aktivert etter auto-claim");

  // Eksplisitt re-aktivering må returnere samme instans (idempotent).
  const secondActivation = engine.activateMiniGame(roomCode, hostId!);
  assert.equal(
    secondActivation,
    firstMiniGame,
    "Re-aktivering skal returnere samme MiniGameState-instans (idempotent)",
  );
  assert.equal(
    secondActivation!.type,
    firstMiniGame!.type,
    "Mini-game type skal ikke endres på re-aktivering",
  );
});

test("Tobias 2026-04-29: regressjon — phase 1 (1 Rad) auto-claim trigger IKKE mini-game", async () => {
  // Kun Fullt Hus (claimType=BINGO) skal trigge mini-game; LINE-faser
  // skal IKKE. Verifiserer at den nye onAutoClaimedFullHouse-hooken
  // ikke blir kalt for fase 1-4 (LINE).
  const engine = new BingoEngine(
    new FixedTicketAdapter(),
    new InMemoryWalletAdapter(),
    { minDrawIntervalMs: 0, minPlayersToStart: 1 },
  );
  const { roomCode, playerId: hostId } = await engine.createRoom({
    hallId: "hall-line",
    playerName: "Alice",
    walletId: "w-alice-line",
    gameSlug: "bingo",
  });
  await engine.startGame({
    roomCode,
    actorPlayerId: hostId!,
    entryFee: 45,
    ticketsPerPlayer: 1,
    payoutPercent: 80,
    gameType: "bingo",
    variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
  });

  // Kun første rad — 1 Rad vinnes på 5. ball, 2-4 Rader + Fullt Hus IKKE vunnet.
  prioritiseDrawBag(engine, roomCode, [1, 16, 31, 46, 61]);
  for (let i = 0; i < 5; i += 1) {
    await drawWithMasterResume(engine, roomCode, hostId!);
  }

  const snap = engine.getRoomSnapshot(roomCode);
  const game = snap.currentGame!;
  const phase1 = (game.patternResults ?? []).find((r) => r.patternName === "1 Rad");
  assert.equal(phase1?.isWon, true, "Pre-condition: 1 Rad skal være vunnet");
  const fullHouse = (game.patternResults ?? []).find((r) => r.patternName === "Fullt Hus");
  assert.equal(
    fullHouse?.isWon,
    false,
    "Pre-condition: Fullt Hus skal IKKE være vunnet",
  );

  // KJERNE-ASSERTION: mini-game skal IKKE være aktivert — kun BINGO trigger.
  assert.equal(
    engine.getCurrentMiniGame(roomCode),
    null,
    "Mini-game skal IKKE være aktivert etter LINE-fase win — kun Fullt Hus skal trigge",
  );
});

test("Tobias 2026-04-29: manuell claim:submit-pathen er fortsatt funksjonell (regressjon)", async () => {
  // Verifiserer at den eksisterende manuell-trigger-pathen ikke er brutt.
  // Manuell claim:submit i `claimEvents.ts:91-102` kaller
  // `engine.activateMiniGame(roomCode, playerId)` direkte. Vi simulerer
  // ved å kalle metoden direkte (uten å gå via auto-claim-flyten).
  const engine = new BingoEngine(
    new FixedTicketAdapter(),
    new InMemoryWalletAdapter(),
    { minDrawIntervalMs: 0, minPlayersToStart: 1 },
  );
  const { roomCode, playerId: hostId } = await engine.createRoom({
    hallId: "hall-manual",
    playerName: "Alice",
    walletId: "w-alice-manual",
    gameSlug: "bingo",
  });
  await engine.joinRoom({
    roomCode,
    hallId: "hall-manual",
    playerName: "Bob",
    walletId: "w-bob-manual",
  });
  await engine.startGame({
    roomCode,
    actorPlayerId: hostId!,
    entryFee: 45,
    ticketsPerPlayer: 1,
    payoutPercent: 80,
    // Default DEFAULT_PATTERNS — ingen autoClaimPhaseMode.
    // Manuell claim-submit må fortsatt aktivere mini-game.
  });

  // Direkte aktivering speiler `claimEvents.ts:93` som kalles ved
  // socket `claim:submit` for `bingo`-rom. Verifiserer at metoden
  // fortsatt fungerer som før.
  const miniGame = engine.activateMiniGame(roomCode, hostId!);
  assert.ok(miniGame, "Manuell activateMiniGame-pathen skal fortsatt fungere");
  assert.equal(miniGame!.type, "mysteryGame");
  assert.equal(miniGame!.playerId, hostId);

  // Etter manuell aktivering er state synlig via getCurrentMiniGame —
  // dette er hva drawEvents.ts vil bruke for før/etter-deteksjon.
  const reread = engine.getCurrentMiniGame(roomCode);
  assert.equal(reread, miniGame, "getCurrentMiniGame skal returnere samme instans");
});
