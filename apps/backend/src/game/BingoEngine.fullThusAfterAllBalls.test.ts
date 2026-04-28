/**
 * KRITISK BUG (rapportert 2026-04-27 av Tobias):
 *
 * Ad-hoc Spill 1-rom "BINGO1" på prod live. 3 spilte runder, alle endte
 * med endedReason=MAX_DRAWS_REACHED etter 75 baller. I to av tre runder
 * vant user 1 Rad, 2 Rader, 3 Rader, 4 Rader (alle won=True). MEN Fullt
 * Hus phase forble won=False, ingen credit, ingen vinner.
 *
 * Med 75 baller trukket fra 75-ball drawbag MÅ alle non-zero celler i
 * et 5×5 grid være matched (siden hver celle er 1..75). Free centre er
 * alltid matched. Derfor MÅ `hasFullBingo` returnere true når alle 75
 * baller er trukket → Phase 5 SKAL vinnes → game.bingoWinnerId skal
 * settes → 1000 kr skal utbetales.
 *
 * Disse testene reproduserer bugen ved å bruke production-realistiske
 * tickets (LocalBingoSystemAdapter med generateBingo75Ticket — random
 * grids fra B-I-N-G-O kolonneranges) og default 75-balls drawbag.
 *
 * **Root cause**: BingoEngine._drawNextNumberLocked rekkefølge:
 *   1. ball drawn (pushed to drawnNumbers)
 *   2. `evaluateActivePhase` called (line 1748)
 *   3. `MAX_DRAWS_REACHED`-sjekk satte `game.status = "ENDED"` (line 1785)
 *
 * Når ball 75 trekkes, går vi inn i `evaluateActivePhase` med Phase 5
 * aktiv. Men `evaluateActivePhase` rekker først å betale ut Phase 4 (eller
 * en tidligere fase som kun var aktiv på samme ball), og rekursjonen
 * inn i Phase 5 — eller, hvis Phase 1-4 ble vunnet på tidligere baller,
 * direkte Phase 5 — fungerer.
 *
 * MEN: hvis `evaluateActivePhase` kastet en exception under utbetaling
 * (f.eks. compliance fail-closed, prizePolicy throws, wallet refresh
 * timeout, audit-skriv mislyktes), så er hele evaluating skipped pga
 * try/catch-rundt-evaluateActivePhase i drawNextNumber (line 1747-1754).
 * Loggen sier "[BIN-694] evaluateActivePhase failed" men spillet
 * fortsetter mot ball 75.
 *
 * Etter ball 75 er drawn er evaluateActivePhase aldri kalt på nytt fordi
 * `drawnNumbers.length >= maxDrawsPerRound` setter `game.status =
 * "ENDED"` umiddelbart i samme drawNextNumber-call (line 1785-1794).
 *
 * Fix: ETTER MAX_DRAWS_REACHED-sjekken, hvis Phase 5 ikke er vunnet
 * fortsatt — kjør en SISTE evaluateActivePhase med ALL 75 baller trukket.
 * Dette dekker også for tidligere skipped evaluering på ball 75.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { BingoEngine } from "./BingoEngine.js";
import { InMemoryWalletAdapter } from "./BingoEngine.test.js";
import { LocalBingoSystemAdapter } from "../adapters/LocalBingoSystemAdapter.js";
import { DEFAULT_NORSK_BINGO_CONFIG } from "./variantConfig.js";
import type { GameVariantConfig } from "./variantConfig.js";

async function setupAdhocBingoRoom(opts?: {
  ticketsPerPlayer?: number;
  variantConfig?: GameVariantConfig;
}): Promise<{
  engine: BingoEngine;
  roomCode: string;
  hostId: string;
}> {
  const engine = new BingoEngine(
    new LocalBingoSystemAdapter(),
    new InMemoryWalletAdapter(),
    {
      // Production-default for ad-hoc: 75-balls = 75 max draws.
      maxDrawsPerRound: 75,
      minDrawIntervalMs: 0,
      // User's reported scenario was solo — but engine default is min-2.
      // For unit-test reproducibility, allow 1 player.
      minPlayersToStart: 1,
    },
  );
  const { roomCode, playerId: hostId } = await engine.createRoom({
    hallId: "hall-1",
    playerName: "TestUser",
    walletId: "w-test",
    gameSlug: "bingo",
  });
  await engine.startGame({
    roomCode,
    actorPlayerId: hostId!,
    entryFee: 50,
    ticketsPerPlayer: opts?.ticketsPerPlayer ?? 4,
    payoutPercent: 80,
    gameType: "standard",
    variantConfig: opts?.variantConfig ?? DEFAULT_NORSK_BINGO_CONFIG,
  });
  return { engine, roomCode, hostId: hostId! };
}

/**
 * Drain hele drawBag til status flippes til ENDED eller bag tom.
 *
 * Etter PR #643 (`fix(spill1): KRITISK — ad-hoc-engine auto-pauser etter
 * fase-vinning`) pauser Spill 1 ad-hoc-engine etter hver fase-vinn for å
 * matche prod-flyt der master må starte spillet igjen mellom faser. I
 * test-flyten simulerer vi master-resume inline via `engine.resumeGame()`
 * — det er den korrekte semantikken for tester som verifiserer end-to-end
 * payout-flyt på tvers av faser.
 */
async function drainAllBalls(
  engine: BingoEngine,
  roomCode: string,
  hostId: string,
): Promise<number> {
  let drawn = 0;
  for (;;) {
    const snap = engine.getRoomSnapshot(roomCode);
    if (!snap.currentGame || snap.currentGame.status !== "RUNNING") break;
    // Auto-resume etter fase-pause (PR #643). Master ville gjort dette
    // manuelt via UI; her gjør vi det automatisk så testen kan verifisere
    // hele drainen.
    if (snap.currentGame.isPaused) {
      engine.resumeGame(roomCode);
    }
    try {
      await engine.drawNextNumber({ roomCode, actorPlayerId: hostId });
      drawn += 1;
    } catch (err) {
      // NO_MORE_NUMBERS / DRAW_BAG_EMPTY → bag drained, stop.
      const code = (err as { code?: string }).code;
      if (code === "NO_MORE_NUMBERS") break;
      throw err;
    }
    if (drawn > 100) throw new Error("safeguard: drew >100 balls");
  }
  return drawn;
}

test("KRITISK: Fullt Hus skal vinnes etter alle 75 baller (solo, 4 tickets)", async () => {
  const { engine, roomCode, hostId } = await setupAdhocBingoRoom({
    ticketsPerPlayer: 4,
  });

  const drawn = await drainAllBalls(engine, roomCode, hostId);

  const snap = engine.getRoomSnapshot(roomCode);
  const game = snap.currentGame!;

  // Etter alle 75 baller MÅ Phase 5 være vunnet.
  const fullt = game.patternResults?.find((r) => r.patternName === "Fullt Hus");
  assert.ok(fullt, "Fullt Hus pattern-result skal eksistere");
  assert.equal(fullt!.isWon, true,
    `Fullt Hus skal være won=true etter ${drawn} baller, men er won=${fullt!.isWon}`);
  assert.equal(fullt!.winnerId, hostId,
    "Fullt Hus winnerId skal peke til solo-spilleren");
  assert.equal(game.bingoWinnerId, hostId,
    "game.bingoWinnerId skal peke til solo-spilleren");
  assert.equal(game.endedReason, "BINGO_CLAIMED",
    "endedReason skal være BINGO_CLAIMED, ikke MAX_DRAWS_REACHED");
});

test("KRITISK: Fullt Hus skal vinnes selv med 18 tickets (user-rapportert konfig)", async () => {
  const { engine, roomCode, hostId } = await setupAdhocBingoRoom({
    ticketsPerPlayer: 18,
  });

  const drawn = await drainAllBalls(engine, roomCode, hostId);

  const snap = engine.getRoomSnapshot(roomCode);
  const game = snap.currentGame!;
  const fullt = game.patternResults?.find((r) => r.patternName === "Fullt Hus");
  assert.equal(fullt!.isWon, true,
    `[18 tickets] Fullt Hus skal være won=true etter ${drawn} baller`);
  assert.equal(game.bingoWinnerId, hostId);

  // Alle 5 phaser skal være vunnet
  const phaseStates = (game.patternResults ?? []).map((r) => ({
    name: r.patternName,
    won: r.isWon,
  }));
  for (const phase of phaseStates) {
    assert.equal(phase.won, true, `${phase.name} skal være won=true`);
  }
});

test("KRITISK: Phase 5 detekteres selv om evaluateActivePhase kastet exception på ball 75", async () => {
  // Simulerer prod-scenariet: en transient feil (DB connection, ledger
  // write, audit-skriv) får evaluateActivePhase til å kaste på ball 75.
  // Try/catch i drawNextNumber svelger feilen → spillet fortsetter med
  // status=RUNNING. Men da treffer den umiddelbart MAX_DRAWS_REACHED-
  // sjekken og setter status=ENDED uten Phase 5-evaluering.
  //
  // Fix: ETTER ball-trekk + Phase-evaluering (selv om den feilet), og
  // FØR MAX_DRAWS_REACHED-status-flip, retry Phase-evaluering en siste
  // gang. Phase 5 må vinnes når alle 75 baller er trukket.
  const engine = new BingoEngine(
    new LocalBingoSystemAdapter(),
    new InMemoryWalletAdapter(),
    {
      maxDrawsPerRound: 75,
      minDrawIntervalMs: 0,
      minPlayersToStart: 1,
    },
  );
  const { roomCode, playerId: hostId } = await engine.createRoom({
    hallId: "hall-1",
    playerName: "Solo",
    walletId: "w-solo",
    gameSlug: "bingo",
  });
  await engine.startGame({
    roomCode,
    actorPlayerId: hostId!,
    entryFee: 50,
    ticketsPerPlayer: 4,
    payoutPercent: 80,
    gameType: "standard",
    variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
  });

  // Patch payoutPhaseWinner-callback så Phase 5-utbetaling kaster én
  // gang (simulerer transient ledger-feil). Ellers fungerer det normalt.
  let phase5ThrowsLeft = 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enginePrivate = engine as any;
  const orig = enginePrivate.payoutPhaseWinner.bind(engine);
  enginePrivate.payoutPhaseWinner = async (
    room: unknown, game: unknown, playerId: string,
    pattern: { claimType: string; name: string },
    patternResult: unknown, prizePerWinner: number,
  ): Promise<void> => {
    if (pattern.claimType === "BINGO" && phase5ThrowsLeft > 0) {
      phase5ThrowsLeft -= 1;
      throw new Error("Simulert transient ledger-feil");
    }
    await orig(room, game, playerId, pattern, patternResult, prizePerWinner);
  };

  // Drain alle 75 baller. Auto-resume etter fase-pause (PR #643 — se
  // helper-kommentar i drainAllBalls for kontekst).
  let drawn = 0;
  for (;;) {
    const snap = engine.getRoomSnapshot(roomCode);
    if (!snap.currentGame || snap.currentGame.status !== "RUNNING") break;
    if (snap.currentGame.isPaused) {
      engine.resumeGame(roomCode);
    }
    try {
      await engine.drawNextNumber({ roomCode, actorPlayerId: hostId! });
      drawn += 1;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "NO_MORE_NUMBERS") break;
      throw err;
    }
    if (drawn > 100) throw new Error("safeguard");
  }

  const snap = engine.getRoomSnapshot(roomCode);
  const game = snap.currentGame!;

  // Selv med én throw på Phase 5-utbetaling, skal Phase 5 til slutt
  // vinnes når alle 75 baller er trukket — fordi enten retry-logikken
  // i fixen plukker det opp, eller en senere ball trigger ny eval.
  const fullt = game.patternResults?.find((r) => r.patternName === "Fullt Hus");
  assert.equal(fullt!.isWon, true,
    `[throw-recovery] Fullt Hus skal til slutt være won=true (drawn=${drawn})`);
  assert.equal(game.endedReason, "BINGO_CLAIMED",
    "endedReason skal være BINGO_CLAIMED selv etter transient feil");
});

test("KRITISK: Phase 5 finalize skal kjøre selv hvis MAX_DRAWS_REACHED nås på siste ball", async () => {
  // Simulerer scenarioet der ball 75 trekkes, og Phase 5 må evalueres
  // på den ballen. Tester eksplisitt at MAX_DRAWS_REACHED-status ikke
  // hopper over Phase 5-evaluering.
  const { engine, roomCode, hostId } = await setupAdhocBingoRoom({
    ticketsPerPlayer: 1,
  });

  await drainAllBalls(engine, roomCode, hostId);

  const snap = engine.getRoomSnapshot(roomCode);
  const game = snap.currentGame!;

  // Etter alle 75 baller: status er ENDED, og endedReason MÅ være
  // BINGO_CLAIMED (ikke MAX_DRAWS_REACHED) fordi vi vant Fullt Hus
  // på samme ball som triggerte MAX_DRAWS_REACHED.
  assert.equal(game.status, "ENDED");
  assert.equal(game.endedReason, "BINGO_CLAIMED",
    `endedReason=${game.endedReason} — Fullt Hus burde ha vunnet ` +
    `siden alle 75 baller dekker hele 5×5-grid`);
  assert.equal(game.bingoWinnerId, hostId);

  const fullt = game.patternResults?.find((r) => r.patternName === "Fullt Hus");
  assert.equal(fullt!.isWon, true);
  assert.equal(fullt!.winnerId, hostId);
});
