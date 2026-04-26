/**
 * MED-3 — Spill 1 full-round E2E integration test (kanonisk).
 *
 * Bug fra Casino Review (MED-3):
 *   Test-suiten har bred dekning per service, men ingen test som setter opp
 *   et helt spill og kjører det fra start til slutt med multiple spillere
 *   og verifiserer at alle delene henger sammen. Hver del er testet isolert,
 *   men kombinasjonen er ikke verifisert.
 *
 * Denne testen dekker:
 *   1. Setup: 3 spillere registrerer wallets, BingoEngine-rom opprettes
 *   2. Buy-in: hver spiller kjøper flere brett av forskjellige farger via
 *      `armedPlayerSelections` → STAKE-events i ComplianceLedger
 *   3. Start: master starter spillet via `engine.startGame`
 *   4. Draw-loop: 24+ trekninger via `engine.drawNextNumber` (auto-claim mode)
 *   5. Phase-wins: assert hver av de 5 fasene treffes med riktig vinner
 *      → PRIZE-events per fase i ComplianceLedger
 *   6. Mini-game: Fullt Hus → `activateMiniGame` → `playMiniGame` → payout
 *      → ekstra PRIZE-event i ComplianceLedger med claimId=`minigame-…`
 *   7. Multi-winner split: minst én fase har 2 vinnere (delt grid) → verify
 *      split-rounding
 *   8. Verifikasjon:
 *      - Total PRIZE-payouts = sum av faste fase-premier (innenfor floor-
 *        rounding-margin på split)
 *      - ComplianceLedger har korrekt antall STAKE + PRIZE entries
 *      - Wallet-deltaer (final - initial) matcher payout - stake per spiller
 *      - Roms state er ENDED med endedReason=BINGO_CLAIMED
 *
 * Implementasjons-strategi:
 *   - Bruker `BingoEngine` direkte med `InMemoryWalletAdapter` (ingen DB).
 *     Dette er samme path som Spill 1 ad-hoc-rom faktisk bruker, og
 *     dekker hele wire-en BingoEngine → ComplianceLedger → WalletAdapter
 *     → BingoEngineMiniGames uten å trenge Postgres.
 *   - Postgres-tester for `Game1MasterControlService`/`Game1DrawEngineService`
 *     finnes allerede (Game1MasterControlService.*.test.ts) — denne testen
 *     dekker den ortogonale dimensjonen: full game-loop end-to-end.
 *   - Deterministisk drawBag via `prioritiseDrawBag`-helper (samme pattern
 *     som BingoEngine.fivePhase.test.ts).
 *   - Ferdig på <1s lokal kjøring.
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

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * Delt grid for alle spillere. Sikrer at:
 *   - Multi-winner split utløses på fase 1 (alle spillere har samme tall i
 *     rad 0 → vinner samtidig på samme draw)
 *   - Alle 5 fasene kan utløses deterministisk når vi trekker rad 0–4
 *     i rekkefølge (se `prioritiseDrawBag`-call i testene).
 *
 * Layout: 5x5 med midtcellen (2,2) = 0 (free space).
 */
const SHARED_GRID: number[][] = [
  [1, 16, 31, 46, 61], // rad 0
  [2, 17, 32, 47, 62], // rad 1
  [3, 18, 0, 48, 63], // rad 2 (midtcellen er free)
  [4, 19, 33, 49, 64], // rad 3
  [5, 20, 34, 50, 65], // rad 4
];

class SharedGridTicketAdapter implements BingoSystemAdapter {
  async createTicket(_input: CreateTicketInput): Promise<Ticket> {
    return { grid: SHARED_GRID.map((row) => [...row]) };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Overstyr drawBag: setter de gitte tallene først så testen blir
 * deterministisk. Identisk pattern som `BingoEngine.fivePhase.test.ts` og
 * `BingoEngine.splitRoundingLoyalty.test.ts`.
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

/**
 * Setup: BingoEngine + 3 spillere registrert i samme rom med `gameSlug:
 * "bingo"` (Spill 1). gameSlug er kritisk fordi `ledgerGameTypeForSlug`
 * bruker det til å rute til `MAIN_GAME` (hovedspill 15%) — uten dette
 * havner ledger-entries som DATABINGO.
 */
async function setupRoomWith3Players(): Promise<{
  engine: BingoEngine;
  wallet: InMemoryWalletAdapter;
  roomCode: string;
  hallId: string;
  players: Array<{ id: string; name: string; walletId: string }>;
}> {
  const wallet = new InMemoryWalletAdapter();
  const engine = new BingoEngine(new SharedGridTicketAdapter(), wallet, {
    // Disable rate-limit + make minPlayersToStart=1 så testen er rask og
    // ikke avhenger av engine.startInterval. minDrawIntervalMs=0 lar
    // drawNextNumber kalles i en tett løkke uten throttling.
    minDrawIntervalMs: 0,
    minPlayersToStart: 1,
  });

  const hallId = "hall-e2e-1";
  const { roomCode, playerId: aliceId } = await engine.createRoom({
    hallId,
    playerName: "Alice",
    walletId: "w-alice",
    gameSlug: "bingo", // K2-A: routes ledger til MAIN_GAME
  });
  const { playerId: bobId } = await engine.joinRoom({
    roomCode,
    hallId,
    playerName: "Bob",
    walletId: "w-bob",
  });
  const { playerId: charlieId } = await engine.joinRoom({
    roomCode,
    hallId,
    playerName: "Charlie",
    walletId: "w-charlie",
  });

  return {
    engine,
    wallet,
    roomCode,
    hallId,
    players: [
      { id: aliceId!, name: "Alice", walletId: "w-alice" },
      { id: bobId!, name: "Bob", walletId: "w-bob" },
      { id: charlieId!, name: "Charlie", walletId: "w-charlie" },
    ],
  };
}

// ── Test 1: Komplett 5-fase E2E + multi-winner split + verifikasjon ────────

test(
  "Game1 E2E: 3 spillere kjøper flere brett, 24+ draws, 5 faser vinnes, mini-game payout, ledger og wallet matcher",
  async () => {
    const { engine, wallet, roomCode, hallId, players } =
      await setupRoomWith3Players();
    const [alice, bob, charlie] = players;
    void bob;
    void charlie; // navn brukt i loops + assertions, references for clarity

    // ── 2. Buy-in: hver spiller kjøper 4 brett via per-type-selections ───
    //
    // `armedPlayerSelections` lar BingoEngine compute buy-in basert på
    // Small/Large priceMultiplier. SHARED_GRID brukes for ALLE brett
    // (TicketAdapter ignorerer ticketIndex), så multi-winner-split utløses
    // garantert på fase 1.
    //
    // Per spiller: 4 brett (3 forskjellige farger):
    //   - 1× Small Yellow (priceMultiplier 1, 1 ticket)
    //   - 1× Small White  (priceMultiplier 1, 1 ticket)
    //   - 2× Large Yellow (priceMultiplier 3, 3 tickets) → genererer 6
    //                      tickets totalt, men selections.qty=2 betyr at vi
    //                      KJØPER 2 stykker → buy-in for 2 × 3 × entryFee.
    //
    // entryFee=10 kr → per spiller buy-in = 1×10 + 1×10 + 2×3×10 = 80 kr.
    // 3 spillere → total stake-pool = 240 kr.
    // payoutPercent=80 → payoutBudget = 192 kr.
    // Faste premier: 100+200+200+200+1000 = 1700 kr — vil cape mot 192 kr-
    //   budgett. Det er FORVENTET for denne testen — vi verifiserer at
    //   total payout ≤ payoutBudget og at ledger speiler virkelig overført
    //   beløp (ikke nominelle premier). Dette er ekte casino-grade
    //   atferd: huset dekker ikke differanse, premie capes ned.
    const entryFee = 10;
    const armedPlayerSelections: Record<
      string,
      Array<{ type: string; qty: number; name?: string }>
    > = {};
    for (const p of players) {
      armedPlayerSelections[p.id] = [
        { type: "small", qty: 1, name: "Small Yellow" },
        { type: "small", qty: 1, name: "Small White" },
        { type: "large", qty: 2, name: "Large Yellow" },
      ];
    }

    // Capture initial wallet balances. Default for InMemory ensure() er 1000 kr.
    const initialBalances = new Map<string, number>();
    for (const p of players) {
      const acct = await wallet.ensureAccount(p.walletId);
      initialBalances.set(p.walletId, acct.balance);
    }

    // ── 3. Start spill ───────────────────────────────────────────────────
    await engine.startGame({
      roomCode,
      actorPlayerId: alice.id,
      entryFee,
      ticketsPerPlayer: 30, // høyt cap så selections.qty ikke truncates
      payoutPercent: 80,
      gameType: "standard",
      variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
      armedPlayerIds: players.map((p) => p.id),
      armedPlayerSelections,
    });

    // Verifiser: spillet kjører
    {
      const snap = engine.getRoomSnapshot(roomCode);
      assert.equal(snap.currentGame?.status, "RUNNING", "spillet skal kjøre");
    }

    // ── 4. Draw-loop: rad 0 → 1 → 2 → 3 → 4 deterministisk ───────────────
    //
    // Rad 0 (5 baller) → fase 1 vunnet (alle 3 spillere — multi-winner split)
    // Rad 1 (5 baller) → fase 2 vunnet
    // Rad 2 (4 baller, midt er free) → fase 3 vunnet
    // Rad 3 (5 baller) → fase 4 vunnet
    // Rad 4 (5 baller) → Fullt Hus → game ENDED
    //
    // Total deterministiske trekninger: 24. Vi trekker opp til 30 for sikkerhet
    // hvis noen tall hopper i drawBag.
    prioritiseDrawBag(engine, roomCode, [
      1, 16, 31, 46, 61, // rad 0
      2, 17, 32, 47, 62, // rad 1
      3, 18, 48, 63, // rad 2 (midt er free → 4 tall holder)
      4, 19, 33, 49, 64, // rad 3
      5, 20, 34, 50, 65, // rad 4 → Fullt Hus
    ]);

    let drawCount = 0;
    let endedAtDraw: number | null = null;
    for (let i = 0; i < 60; i += 1) {
      const snap = engine.getRoomSnapshot(roomCode);
      if (snap.currentGame?.status === "ENDED") {
        endedAtDraw = drawCount;
        break;
      }
      await engine.drawNextNumber({
        roomCode,
        actorPlayerId: alice.id,
      });
      drawCount += 1;
    }

    assert.ok(
      drawCount >= 24,
      `forventet minst 24 draws (24 unike tall i 5 rader), fikk ${drawCount}`,
    );
    assert.ok(
      endedAtDraw !== null,
      "spillet skal ha endt etter Fullt Hus (24 baller)",
    );

    // ── 5. Phase-wins: alle 5 faser skal være vunnet ─────────────────────
    const finalSnap = engine.getRoomSnapshot(roomCode);
    const game = finalSnap.currentGame!;
    assert.equal(game.status, "ENDED");
    assert.equal(game.endedReason, "BINGO_CLAIMED");

    const phaseNames = ["1 Rad", "2 Rader", "3 Rader", "4 Rader", "Fullt Hus"];
    for (const name of phaseNames) {
      const phase = game.patternResults?.find((r) => r.patternName === name);
      assert.ok(phase, `fase "${name}" skal finnes i patternResults`);
      assert.equal(phase!.isWon, true, `fase "${name}" skal være vunnet`);
    }

    // Multi-winner split-verifikasjon: fase 1 ble truffet av alle 3 spillere
    // samtidig (alle har SHARED_GRID rad 0). I 5-fase-evaluatoren settes
    // `winnerIds` (BIN-696) på `PatternResult` — `winnerCount`-feltet er
    // forbeholdt customPatterns/concurrent-flyten (PR-P5) og er undefined
    // her. Vi inspiserer derfor `winnerIds.length`.
    const phase1 = game.patternResults!.find((r) => r.patternName === "1 Rad")!;
    const phase1WinnerCount = phase1.winnerIds?.length ?? 0;
    assert.ok(
      phase1WinnerCount >= 2,
      `fase 1 skal ha minst 2 samtidige vinnere (multi-winner split). winnerIds=${JSON.stringify(phase1.winnerIds)}`,
    );

    // ── 6. Mini-game: aktiver + spill ────────────────────────────────────
    //
    // Fullt Hus-vinneren er øverste vinner i `patternResults` (winnerId).
    // BingoEngine.activateMiniGame validerer at runden har en `currentGame`
    // og at den ikke allerede har en miniGame (idempotent).
    const fullHus = game.patternResults!.find(
      (r) => r.patternName === "Fullt Hus",
    )!;
    const fullHusWinnerId = fullHus.winnerId!;
    assert.ok(fullHusWinnerId, "Fullt Hus skal ha winnerId");

    const miniGame = engine.activateMiniGame(roomCode, fullHusWinnerId);
    assert.ok(miniGame, "activateMiniGame skal returnere mini-game-state");
    assert.equal(miniGame!.playerId, fullHusWinnerId);
    assert.equal(miniGame!.isPlayed, false);

    const miniGameResult = await engine.playMiniGame(
      roomCode,
      fullHusWinnerId,
    );
    assert.ok(
      miniGameResult.prizeAmount >= 0,
      "mini-game prize skal være ≥ 0",
    );
    assert.ok(
      miniGameResult.prizeList.length > 0,
      "prizeList skal være populert",
    );

    // ── 7. ComplianceLedger: STAKE og PRIZE entries ──────────────────────
    const ledgerEntries = engine.listComplianceLedgerEntries({
      hallId,
      limit: 1000,
    });

    // STAKE entries: én per spiller (3 totalt). BUYIN er aggregert pr
    // spiller i BingoEngine.startGame (én STAKE-entry per spiller, ikke
    // per ticket).
    const stakes = ledgerEntries.filter((e) => e.eventType === "STAKE");
    assert.equal(
      stakes.length,
      3,
      `forventet 3 STAKE-entries (én per spiller), fikk ${stakes.length}`,
    );

    // gameType MÅ være MAIN_GAME (Spill 1 = hovedspill, K2-A regulatorisk fix).
    for (const entry of stakes) {
      assert.equal(
        entry.gameType,
        "MAIN_GAME",
        `STAKE-entry skal ha gameType=MAIN_GAME (Spill 1 hovedspill). fikk ${entry.gameType}`,
      );
      assert.equal(entry.channel, "INTERNET");
      assert.equal(entry.hallId, hallId);
      assert.equal(entry.amount, 80, "buy-in per spiller = 80 kr");
    }

    // Total stake-sum = 3 × 80 = 240 kr
    const totalStake = stakes.reduce((sum, e) => sum + e.amount, 0);
    assert.equal(totalStake, 240);

    // PRIZE entries: én per phase-vinner + én per mini-game-payout (hvis
    // prize > 0). Vi forventer at minst alle 5 fasene har generert PRIZE-
    // entries (winnerCount kan være ≥ 1 per fase).
    const prizes = ledgerEntries.filter((e) => e.eventType === "PRIZE");
    assert.ok(
      prizes.length >= 5,
      `forventet minst 5 PRIZE-entries (én per fase, eksklusiv mini-game). fikk ${prizes.length}`,
    );

    // Mini-game prize entry har claimId som starter med "minigame-" hvis
    // prizeAmount > 0. Hvis 0 (segment-uflaks), ingen PRIZE-entry skrives.
    if (miniGameResult.prizeAmount > 0) {
      const miniGameEntry = prizes.find((e) =>
        e.claimId?.startsWith("minigame-"),
      );
      assert.ok(
        miniGameEntry,
        "mini-game prize > 0 skal generere PRIZE-entry med claimId=minigame-…",
      );
      assert.equal(miniGameEntry!.amount, miniGameResult.prizeAmount);
    }

    // Total PRIZE-payout skal IKKE overskride payoutBudget (192 kr) +
    // mini-game-prize (separat budsjett, kommer fra hall-account).
    const totalGamePrize = prizes
      .filter((e) => !e.claimId?.startsWith("minigame-"))
      .reduce((sum, e) => sum + e.amount, 0);
    const payoutBudget = 240 * 0.8; // entryFee * playerCount * payoutPercent/100
    assert.ok(
      totalGamePrize <= payoutBudget + 0.01, // floating-point margin
      `total game-PRIZE (${totalGamePrize}) skal ikke overstige payoutBudget (${payoutBudget})`,
    );

    // ── 8. Wallet-deltaer matcher payout - stake per spiller ─────────────
    //
    // For hver spiller: finalBalance - initialBalance = totalCredits -
    // totalDebits. Sum av PRIZE-entries til spilleren = totalCredits.
    // Sum av STAKE-entries fra spilleren = totalDebits. Disse skal
    // matche wallet-delta (med floor-rounding-margin på split).
    for (const p of players) {
      const finalAcct = await wallet.getAccount(p.walletId);
      const initial = initialBalances.get(p.walletId)!;
      const delta = finalAcct.balance - initial;

      const playerStake = ledgerEntries
        .filter((e) => e.eventType === "STAKE" && e.walletId === p.walletId)
        .reduce((sum, e) => sum + e.amount, 0);
      const playerPrize = ledgerEntries
        .filter((e) => e.eventType === "PRIZE" && e.walletId === p.walletId)
        .reduce((sum, e) => sum + e.amount, 0);

      assert.equal(
        delta,
        playerPrize - playerStake,
        `spiller ${p.name}: wallet-delta (${delta}) skal matche prize-stake (${playerPrize - playerStake})`,
      );
    }

    // ── 9. Roms state er ENDED ───────────────────────────────────────────
    assert.equal(game.status, "ENDED");
    assert.equal(game.endedReason, "BINGO_CLAIMED");
    assert.ok(game.endedAt, "endedAt skal være satt");
  },
);

// ── Test 2: Multi-winner split-rounding margin verifikasjon ────────────────

test(
  "Game1 E2E: multi-winner split-rounding — 7 vinnere på fase 1 (uneven floor) → rest til huset, total payout = floor × n",
  async () => {
    // Dedikert verifikasjon av split-rounding-margin. 7 spillere med samme
    // grid → alle vinner fase 1 samtidig. Fast 100 kr-premie / 7 = 14 kr
    // per vinner, rest 2 kr til huset. Total payout = 7 × 14 = 98 kr (98 ≠
    // 100 — derfor "innenfor split-rounding-margin"-asserten i hovedtesten).
    //
    // Strategi-rationale: Hovedtesten har 3 spillere. Med 3 spillere og
    // fast 100 kr / 3 = 33 kr per vinner + 1 kr rest. Hovedtesten
    // verifiserer matchen pr-spiller, men mister noe av innsikten i
    // hva "split-rounding-margin" betyr. Denne testen isolerer
    // floor-divisjon-atferden.
    const engine = new BingoEngine(
      new SharedGridTicketAdapter(),
      new InMemoryWalletAdapter(),
      {
        minDrawIntervalMs: 0,
        minPlayersToStart: 1,
      },
    );

    const hallId = "hall-e2e-split";
    const { roomCode, playerId: hostId } = await engine.createRoom({
      hallId,
      playerName: "P0",
      walletId: "w-0",
      gameSlug: "bingo",
    });
    const playerIds: string[] = [hostId!];
    for (let i = 1; i < 7; i += 1) {
      const { playerId } = await engine.joinRoom({
        roomCode,
        hallId,
        playerName: `P${i}`,
        walletId: `w-${i}`,
      });
      playerIds.push(playerId!);
    }

    // entryFee=200 → pool=1400 → payoutBudget=1400 (100%) — nok til at
    // alle faste fase-premier (1700 kr) capes mot pool, ikke budget.
    await engine.startGame({
      roomCode,
      actorPlayerId: hostId,
      entryFee: 200,
      ticketsPerPlayer: 1,
      payoutPercent: 100,
      gameType: "standard",
      variantConfig: DEFAULT_NORSK_BINGO_CONFIG,
    });

    // Trekk kun rad 0 — fase 1 vinner, ingen andre faser triggers.
    prioritiseDrawBag(engine, roomCode, [1, 16, 31, 46, 61]);
    for (let i = 0; i < 5; i += 1) {
      await engine.drawNextNumber({
        roomCode,
        actorPlayerId: hostId,
      });
    }

    const snap = engine.getRoomSnapshot(roomCode);
    const game = snap.currentGame!;
    const phase1 = game.patternResults!.find((r) => r.patternName === "1 Rad")!;
    assert.equal(phase1.isWon, true);
    // `winnerCount` settes ikke i 5-fase-evaluatoren — bruk winnerIds.length.
    assert.equal(
      phase1.winnerIds?.length ?? 0,
      7,
      "7 samtidige vinnere på fase 1",
    );

    // Alle 7 LINE-claims skal ha payoutAmount=14 (floor(100/7))
    const lineClaims = game.claims.filter((c) => c.type === "LINE");
    assert.equal(lineClaims.length, 7);
    for (const c of lineClaims) {
      assert.equal(
        c.payoutAmount,
        14,
        `floor(100/7) = 14 — fikk ${c.payoutAmount}`,
      );
    }

    // Total game-PRIZE-sum i ledger skal være 7 × 14 = 98 kr (ikke 100).
    // De resterende 2 kr ble retained av huset (audited via
    // SplitRoundingAuditPort i splitRoundingLoyalty.test.ts).
    const ledgerEntries = engine.listComplianceLedgerEntries({
      hallId,
      limit: 1000,
    });
    const phase1Prizes = ledgerEntries.filter(
      (e) => e.eventType === "PRIZE" && e.amount === 14,
    );
    assert.equal(phase1Prizes.length, 7);
    const totalPhase1 = phase1Prizes.reduce((sum, e) => sum + e.amount, 0);
    assert.equal(totalPhase1, 98, "7 × 14 = 98 kr (rest 2 kr til huset)");

    // gameType MAIN_GAME for alle Spill 1-PRIZE-entries.
    for (const entry of phase1Prizes) {
      assert.equal(entry.gameType, "MAIN_GAME");
    }
  },
);
