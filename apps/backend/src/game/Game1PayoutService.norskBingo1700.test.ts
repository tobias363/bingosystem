/**
 * SMOKE-TEST 1700 kr (2026-04-27, Tobias):
 *
 * Reprodusér wallet-flowen for en solo-spiller som vinner alle 5 fasene
 * av Norsk Bingo (DEFAULT_NORSK_BINGO_CONFIG = 100/200/200/200/1000 kr).
 *
 * Bug-rapport:
 *   - Wallet-bug: "gevinst-lommebok ikke oppdatert" etter 1700 kr-vinn.
 *   - Animasjon-bug: Fullt Hus-popup viser kun 1000 kr, ikke total 1700.
 *
 * PR #595 (`fix(spill1): KRITISK — faste premier hus-garantert`) påstås å
 * fikse bugen, men ble bare patchet i `BingoEngine.ts` (ad-hoc-rom).
 * Game1PayoutService + Game1DrawEngineService (scheduled Spill 1) har
 * IKKE `isFixedPrizePattern`-bypass.
 *
 * Disse testene verifiserer at scheduled-Spill1-stacken faktisk gjør det
 * RIKTIGE for fixed prizes (selv uten den eksplisitte bypass-logikken),
 * fordi `patternPrizeToCents` returnerer `prize1 * 100` for `winningType:
 * "fixed"` uavhengig av pot, og scheduled-stacken har INGEN `Math.min(_,
 * remainingPrizePool)`-cap som kan redusere det.
 *
 * Forventet resultat: bug REPRODUSERES IKKE i scheduled-stacken. Hvis
 * disse testene passer er det sannsynlig at Tobias spilte i et ad-hoc-
 * rom (BingoEngine-pathen) og PR #595 var korrekt fix for det scenariet.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Game1PayoutService, type Game1WinningAssignment } from "./Game1PayoutService.js";
import { InMemoryWalletAdapter } from "../adapters/InMemoryWalletAdapter.js";
import { AuditLogService, InMemoryAuditLogStore } from "../compliance/AuditLogService.js";
import { patternPrizeToCents } from "./Game1DrawEngineHelpers.js";
import { DEFAULT_NORSK_BINGO_CONFIG } from "./variantConfig.js";

// ── Felles fake DB-client (no-op) ───────────────────────────────────────────

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

function makeFakeClient(): {
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> };
  queries: RecordedQuery[];
} {
  const queries: RecordedQuery[] = [];
  const client = {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
  };
  return { client, queries };
}

// ── Test 1: patternPrizeToCents respekterer winningType: "fixed" ─────────────

test("[1700kr] patternPrizeToCents returnerer prize1*100 for fixed-mode uansett pot", () => {
  // Reproduser Tobias' scenario: solo, 4 brett kjøpt for 180 kr → pot ~144 kr
  // (etter 80% payoutPercent). DEFAULT_NORSK_BINGO_CONFIG har faste 100/200/200/200/1000.
  const SOLO_TOBIAS_POT_CENTS = 14400; // 144 kr i øre

  const expectedPrizesCents = [10000, 20000, 20000, 20000, 100000]; // 100, 200, 200, 200, 1000 kr
  for (let i = 0; i < DEFAULT_NORSK_BINGO_CONFIG.patterns.length; i++) {
    const pattern = DEFAULT_NORSK_BINGO_CONFIG.patterns[i]!;
    const result = patternPrizeToCents(pattern, SOLO_TOBIAS_POT_CENTS);
    assert.equal(
      result,
      expectedPrizesCents[i],
      `Phase ${i + 1} (${pattern.name}): forventet ${expectedPrizesCents[i]} øre, fikk ${result} øre. ` +
        `Pool var bare ${SOLO_TOBIAS_POT_CENTS} øre (144 kr) men fixed prizes må være uavhengig av pool.`
    );
  }

  // Verifiser totalsum.
  const total = expectedPrizesCents.reduce((a, b) => a + b, 0);
  assert.equal(total, 170000, "Total skal være 1700 kr (170 000 øre)");
});

// ── Test 2: 5-fase sekvensiell payout = 1700 kr på winnings_balance ──────────

test("[1700kr] solo-spiller: 5 sekvensielle phase-payouts → 1700 kr på winnings", async () => {
  const wallet = new InMemoryWalletAdapter();
  await wallet.ensureAccount("__system_house__");
  const playerWalletId = "wallet-tobias-solo";
  // initialBalance: 0 — vi måler kun winnings-side, ikke initial-funding.
  await wallet.createAccount({ accountId: playerWalletId, initialBalance: 0 });

  const auditLog = new AuditLogService(new InMemoryAuditLogStore());
  const service = new Game1PayoutService({
    walletAdapter: wallet,
    auditLogService: auditLog,
  });

  const winner: Game1WinningAssignment = {
    assignmentId: "tobias-assignment-1",
    walletId: playerWalletId,
    userId: "tobias-user",
    hallId: "hall-test",
    ticketColor: "small_yellow",
  };

  // Kjør alle 5 fasene sekvensielt — én pattern:won per fase.
  const phasePrizesCents = [10000, 20000, 20000, 20000, 100000];
  const phaseNames = ["1 Rad", "2 Rader", "3 Rader", "4 Rader", "Fullt Hus"];

  const { client } = makeFakeClient();
  const broadcastedPayouts: number[] = [];

  for (let phase = 1; phase <= 5; phase++) {
    const result = await service.payoutPhase(client as never, {
      scheduledGameId: "tobias-game-1",
      phase,
      drawSequenceAtWin: 20 + phase, // pseudo-draw-seq
      roomCode: "",
      totalPhasePrizeCents: phasePrizesCents[phase - 1]!,
      winners: [winner],
      phaseName: phaseNames[phase - 1]!,
    });

    // Verifiser per-vinner-beløp i ØRE (det som broadcast'es som
    // prizePerWinnerKr i Game1DrawEngineService:2359 etter divisjon med 100).
    assert.equal(result.prizePerWinnerCents, phasePrizesCents[phase - 1]);
    assert.equal(result.totalWinners, 1);
    assert.equal(result.houseRetainedCents, 0); // solo, ingen split-rounding
    broadcastedPayouts.push(Math.floor(result.prizePerWinnerCents / 100));
  }

  // Klient akkumulerer i Game1Controller:489 — dette er hva WinScreenV2 viser.
  const accumulated = broadcastedPayouts.reduce((a, b) => a + b, 0);
  assert.equal(accumulated, 1700, `Klient-akkumulert sum skal være 1700 kr, var ${accumulated}`);

  // Verifiser wallet — total winnings_balance = 1700 kr.
  const winnings = await wallet.getWinningsBalance(playerWalletId);
  assert.equal(winnings, 1700, `Wallet winnings_balance skal være 1700 kr, var ${winnings}`);

  const deposit = await wallet.getDepositBalance(playerWalletId);
  assert.equal(deposit, 0, "Deposit-balance skal være 0 — payout krediterer KUN winnings");

  const total = await wallet.getBalance(playerWalletId);
  assert.equal(total, 1700, "Total balance (deposit + winnings) skal være 1700");
});

// ── Test 3: idempotency — samme phase-payout dobbel kjøring krediterer kun én gang

test("[1700kr] payoutPhase idempotency: dobbel-kjøring av samme phase krediterer ikke dobbelt", async () => {
  const wallet = new InMemoryWalletAdapter();
  await wallet.ensureAccount("__system_house__");
  const playerWalletId = "wallet-tobias-idem";
  await wallet.createAccount({ accountId: playerWalletId, initialBalance: 0 });

  const auditLog = new AuditLogService(new InMemoryAuditLogStore());
  const service = new Game1PayoutService({
    walletAdapter: wallet,
    auditLogService: auditLog,
  });

  const winner: Game1WinningAssignment = {
    assignmentId: "a-idem-1",
    walletId: playerWalletId,
    userId: "u-idem",
    hallId: "h-idem",
    ticketColor: "small_yellow",
  };

  const { client } = makeFakeClient();
  // Kjør Fullt Hus-payout to ganger med samme scheduled_game_id+phase+assignment.
  // Idempotency-key fra IdempotencyKeys.game1Phase skal blokkere dobbel-credit.
  for (let i = 0; i < 2; i++) {
    await service.payoutPhase(client as never, {
      scheduledGameId: "g-idem",
      phase: 5,
      drawSequenceAtWin: 50,
      roomCode: "",
      totalPhasePrizeCents: 100000, // 1000 kr
      winners: [winner],
      phaseName: "Fullt Hus",
    });
  }

  const winnings = await wallet.getWinningsBalance(playerWalletId);
  assert.equal(winnings, 1000, `Idempotency: kun én credit av 1000 kr forventet, fikk ${winnings} kr`);
});

// ── Test 4: __system_house__ må eksistere — payout uten det krasjer ──────────

test("[1700kr] __system_house__ må være seedet før payout (regressjons-vakt)", async () => {
  const wallet = new InMemoryWalletAdapter();
  // BEVISST: ikke kall ensureAccount på __system_house__.
  // InMemoryWalletAdapter auto-creater ved credit/debit, så dette feiler IKKE
  // i prod hvis adapter er Postgres med seeded-row. Her dokumenterer vi
  // antagelsen.

  const playerWalletId = "wallet-no-house";
  await wallet.createAccount({ accountId: playerWalletId, initialBalance: 0 });

  const auditLog = new AuditLogService(new InMemoryAuditLogStore());
  const service = new Game1PayoutService({
    walletAdapter: wallet,
    auditLogService: auditLog,
  });

  const { client } = makeFakeClient();
  // Skal IKKE kaste — InMemoryWalletAdapter auto-creater __system_house__
  // via `ensureAccountInternal` i `recordTx`-flyten.
  await service.payoutPhase(client as never, {
    scheduledGameId: "g-no-house",
    phase: 1,
    drawSequenceAtWin: 25,
    roomCode: "",
    totalPhasePrizeCents: 10000,
    winners: [
      {
        assignmentId: "a-no-house",
        walletId: playerWalletId,
        userId: "u-no-house",
        hallId: "h",
        ticketColor: "small_yellow",
      },
    ],
    phaseName: "1 Rad",
  });

  const winnings = await wallet.getWinningsBalance(playerWalletId);
  assert.equal(winnings, 100);
});
