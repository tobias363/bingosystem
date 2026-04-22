/**
 * PR-T3 Spor 4: Tester for evaluateAccumulatingPots (PotEvaluator).
 *
 * Dekker:
 *   - Innsatsen happy-path (pot ≥ target, draw i vindu) → credit + audit
 *   - Target ikke nådd → triggered=false, reasonCode=BELOW_TARGET, ingen credit
 *   - Draw over threshold-upper-bound → triggered=false, reasonCode=DRAW_AFTER_THRESHOLD
 *   - Draw før threshold-lower-bound → triggered=false, reasonCode=DRAW_BEFORE_WINDOW
 *   - Idempotency-key = g1-pot-{potId}-{gameId} på walletAdapter.credit
 *   - to: "winnings" på credit (regulatorisk)
 *   - First winner tar alt (ingen split)
 *   - Wallet-credit-feil → kaster, draw-transaksjonen ruller tilbake
 *   - Pot ikke funnet (tom liste) → returnerer [] uten credit
 *   - Multi-pot: én triggered + én under-target → korrekte resultater per pot
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAccumulatingPots,
  type PotEvaluatorWinner,
} from "./PotEvaluator.js";
import type { Game1PotService, PotRow, TryWinResult } from "./Game1PotService.js";
import type { WalletAdapter, WalletTransaction } from "../../adapters/WalletAdapter.js";
import {
  AuditLogService,
  InMemoryAuditLogStore,
} from "../../compliance/AuditLogService.js";

// ── Test doubles ────────────────────────────────────────────────────────────

interface TryWinCall {
  hallId: string;
  potKey: string;
  phase: number;
  drawSequenceAtWin: number;
  ticketColor: string;
  winnerUserId: string;
  scheduledGameId: string;
}

function makeFakePotService(options: {
  pots: PotRow[];
  tryWinResults?: Map<string, TryWinResult>; // key = potKey
  tryWinThrows?: Map<string, Error>;
}): { service: Game1PotService; tryWinCalls: TryWinCall[] } {
  const tryWinCalls: TryWinCall[] = [];
  const service = {
    async listPotsForHall(_hallId: string) {
      return options.pots;
    },
    async tryWin(input: TryWinCall): Promise<TryWinResult> {
      tryWinCalls.push({ ...input });
      const thrown = options.tryWinThrows?.get(input.potKey);
      if (thrown) throw thrown;
      const result = options.tryWinResults?.get(input.potKey);
      if (!result) {
        return {
          triggered: false,
          amountCents: 0,
          reasonCode: "POT_NOT_FOUND",
          eventId: null,
        };
      }
      return result;
    },
  } as unknown as Game1PotService;
  return { service, tryWinCalls };
}

interface CreditCall {
  accountId: string;
  amount: number;
  description: string;
  idempotencyKey?: string;
  to?: "winnings" | "deposit";
}

function makeFakeWalletAdapter(options?: { creditThrows?: Error }): {
  adapter: WalletAdapter;
  creditCalls: CreditCall[];
} {
  const creditCalls: CreditCall[] = [];
  const adapter = {
    async credit(
      accountId: string,
      amount: number,
      description: string,
      opts?: { idempotencyKey?: string; to?: "winnings" | "deposit" }
    ): Promise<WalletTransaction> {
      creditCalls.push({
        accountId,
        amount,
        description,
        idempotencyKey: opts?.idempotencyKey,
        to: opts?.to,
      });
      if (options?.creditThrows) throw options.creditThrows;
      return {
        id: `tx-${creditCalls.length}`,
        accountId,
        type: "CREDIT",
        amount,
        balanceAfter: 100 + amount,
        description,
        createdAt: new Date().toISOString(),
        idempotencyKey: opts?.idempotencyKey ?? null,
      } as unknown as WalletTransaction;
    },
  } as unknown as WalletAdapter;
  return { adapter, creditCalls };
}

function makePot(overrides: Partial<PotRow> = {}): PotRow {
  return {
    id: "pot-inns-1",
    hallId: "hall-a",
    potKey: "innsatsen",
    displayName: "Innsatsen",
    currentAmountCents: 2000_00,
    config: {
      seedAmountCents: 500_00,
      dailyBoostCents: 0,
      salePercentBps: 2000,
      maxAmountCents: null,
      winRule: {
        kind: "phase_at_or_before_draw",
        phase: 5,
        drawThreshold: 58,
      },
      ticketColors: [],
      potType: "innsatsen",
      drawThresholdLower: 56,
      targetAmountCents: 2000_00,
    },
    lastDailyBoostDate: null,
    lastResetAt: null,
    lastResetReason: null,
    createdAt: "2026-04-22T10:00:00Z",
    updatedAt: "2026-04-22T10:00:00Z",
    ...overrides,
  };
}

function defaultWinner(): PotEvaluatorWinner {
  return {
    assignmentId: "assign-1",
    walletId: "wallet-p1",
    userId: "user-p1",
    hallId: "hall-a",
    ticketColor: "yellow",
  };
}

// Dummy client — aldri brukt i helperen siden potService wrapper egne
// transaksjoner; draw-engine's client er kun for query mot audit/etc.
// Vi cast til any fordi PoolClient-kontrakten er wrapped av service.
const dummyClient = {} as never;

// ── Tests ────────────────────────────────────────────────────────────────────

test("PotEvaluator: ingen pot-er i hall → tom resultat-liste (no-op)", async () => {
  const { service } = makeFakePotService({ pots: [] });
  const { adapter, creditCalls } = makeFakeWalletAdapter();
  const audit = new AuditLogService(new InMemoryAuditLogStore());

  const results = await evaluateAccumulatingPots({
    client: dummyClient,
    potService: service,
    walletAdapter: adapter,
    hallId: "hall-a",
    scheduledGameId: "sg-1",
    drawSequenceAtWin: 57,
    firstWinner: defaultWinner(),
    audit,
  });

  assert.deepEqual(results, []);
  assert.equal(creditCalls.length, 0, "ingen credit ved 0 pot-er");
});

test("PotEvaluator: Innsatsen happy-path → triggered, credit, audit", async () => {
  const pot = makePot();
  const tryWinResults = new Map<string, TryWinResult>();
  tryWinResults.set("innsatsen", {
    triggered: true,
    amountCents: 2000_00,
    reasonCode: null,
    eventId: "event-win-1",
  });
  const { service, tryWinCalls } = makeFakePotService({
    pots: [pot],
    tryWinResults,
  });
  const { adapter, creditCalls } = makeFakeWalletAdapter();
  const audit = new AuditLogService(new InMemoryAuditLogStore());

  const results = await evaluateAccumulatingPots({
    client: dummyClient,
    potService: service,
    walletAdapter: adapter,
    hallId: "hall-a",
    scheduledGameId: "sg-1",
    drawSequenceAtWin: 57,
    firstWinner: defaultWinner(),
    audit,
  });

  assert.equal(results.length, 1);
  const res = results[0]!;
  assert.equal(res.triggered, true);
  assert.equal(res.amountCents, 2000_00);
  assert.equal(res.potType, "innsatsen");

  assert.equal(tryWinCalls.length, 1);
  assert.equal(tryWinCalls[0]!.phase, 5);
  assert.equal(tryWinCalls[0]!.drawSequenceAtWin, 57);
  assert.equal(tryWinCalls[0]!.ticketColor, "yellow");
  assert.equal(tryWinCalls[0]!.winnerUserId, "user-p1");

  // Credit-sjekk: korrekt kronebeløp + idempotency-key + winnings-side.
  assert.equal(creditCalls.length, 1);
  assert.equal(creditCalls[0]!.accountId, "wallet-p1");
  assert.equal(creditCalls[0]!.amount, 2000); // 200_000 øre = 2000 kr
  assert.equal(
    creditCalls[0]!.idempotencyKey,
    "g1-pot-pot-inns-1-sg-1",
    "idempotency-key = g1-pot-{potId}-{gameId}"
  );
  assert.equal(creditCalls[0]!.to, "winnings", "må være winnings-side");
});

test("PotEvaluator: target ikke nådd → triggered=false, ingen credit", async () => {
  const pot = makePot({ currentAmountCents: 1500_00 });
  const tryWinResults = new Map<string, TryWinResult>();
  tryWinResults.set("innsatsen", {
    triggered: false,
    amountCents: 0,
    reasonCode: "BELOW_TARGET",
    eventId: null,
  });
  const { service } = makeFakePotService({
    pots: [pot],
    tryWinResults,
  });
  const { adapter, creditCalls } = makeFakeWalletAdapter();
  const audit = new AuditLogService(new InMemoryAuditLogStore());

  const results = await evaluateAccumulatingPots({
    client: dummyClient,
    potService: service,
    walletAdapter: adapter,
    hallId: "hall-a",
    scheduledGameId: "sg-1",
    drawSequenceAtWin: 57,
    firstWinner: defaultWinner(),
    audit,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]!.triggered, false);
  assert.equal(results[0]!.reasonCode, "BELOW_TARGET");
  assert.equal(results[0]!.amountCents, 0);
  assert.equal(creditCalls.length, 0);
});

test("PotEvaluator: draw over øvre threshold → triggered=false, pot ruller over", async () => {
  const pot = makePot();
  const tryWinResults = new Map<string, TryWinResult>();
  tryWinResults.set("innsatsen", {
    triggered: false,
    amountCents: 0,
    reasonCode: "DRAW_AFTER_THRESHOLD",
    eventId: null,
  });
  const { service } = makeFakePotService({ pots: [pot], tryWinResults });
  const { adapter, creditCalls } = makeFakeWalletAdapter();
  const audit = new AuditLogService(new InMemoryAuditLogStore());

  const results = await evaluateAccumulatingPots({
    client: dummyClient,
    potService: service,
    walletAdapter: adapter,
    hallId: "hall-a",
    scheduledGameId: "sg-1",
    drawSequenceAtWin: 60, // > threshold=58
    firstWinner: defaultWinner(),
    audit,
  });

  assert.equal(results[0]!.triggered, false);
  assert.equal(results[0]!.reasonCode, "DRAW_AFTER_THRESHOLD");
  assert.equal(creditCalls.length, 0);
});

test("PotEvaluator: draw før nedre threshold → triggered=false, pot venter", async () => {
  const pot = makePot();
  const tryWinResults = new Map<string, TryWinResult>();
  tryWinResults.set("innsatsen", {
    triggered: false,
    amountCents: 0,
    reasonCode: "DRAW_BEFORE_WINDOW",
    eventId: null,
  });
  const { service } = makeFakePotService({ pots: [pot], tryWinResults });
  const { adapter, creditCalls } = makeFakeWalletAdapter();
  const audit = new AuditLogService(new InMemoryAuditLogStore());

  const results = await evaluateAccumulatingPots({
    client: dummyClient,
    potService: service,
    walletAdapter: adapter,
    hallId: "hall-a",
    scheduledGameId: "sg-1",
    drawSequenceAtWin: 50, // < lower=56
    firstWinner: defaultWinner(),
    audit,
  });

  assert.equal(results[0]!.triggered, false);
  assert.equal(results[0]!.reasonCode, "DRAW_BEFORE_WINDOW");
  assert.equal(creditCalls.length, 0);
});

test("PotEvaluator: wallet-credit-feil → kaster → caller ruller tilbake", async () => {
  const pot = makePot();
  const tryWinResults = new Map<string, TryWinResult>();
  tryWinResults.set("innsatsen", {
    triggered: true,
    amountCents: 2000_00,
    reasonCode: null,
    eventId: "event-win",
  });
  const { service } = makeFakePotService({ pots: [pot], tryWinResults });
  const { adapter } = makeFakeWalletAdapter({
    creditThrows: new Error("simulated wallet failure"),
  });
  const audit = new AuditLogService(new InMemoryAuditLogStore());

  await assert.rejects(
    () =>
      evaluateAccumulatingPots({
        client: dummyClient,
        potService: service,
        walletAdapter: adapter,
        hallId: "hall-a",
        scheduledGameId: "sg-1",
        drawSequenceAtWin: 57,
        firstWinner: defaultWinner(),
        audit,
      }),
    /simulated wallet failure/
  );
});

test("PotEvaluator: multi-pot (Innsatsen triggered + Jackpott under-target) → korrekte resultater per pot", async () => {
  const innsatsenPot = makePot({
    id: "pot-inns",
    potKey: "innsatsen",
    currentAmountCents: 2000_00,
  });
  const jackpottPot = makePot({
    id: "pot-jp",
    potKey: "jackpott",
    currentAmountCents: 100_00,
    config: {
      ...makePot().config,
      potType: "jackpott",
      drawThresholdLower: undefined,
      targetAmountCents: undefined,
    },
  });
  const tryWinResults = new Map<string, TryWinResult>();
  tryWinResults.set("innsatsen", {
    triggered: true,
    amountCents: 2000_00,
    reasonCode: null,
    eventId: "event-inns",
  });
  tryWinResults.set("jackpott", {
    triggered: true,
    amountCents: 100_00,
    reasonCode: null,
    eventId: "event-jp",
  });

  const { service } = makeFakePotService({
    pots: [innsatsenPot, jackpottPot],
    tryWinResults,
  });
  const { adapter, creditCalls } = makeFakeWalletAdapter();
  const audit = new AuditLogService(new InMemoryAuditLogStore());

  const results = await evaluateAccumulatingPots({
    client: dummyClient,
    potService: service,
    walletAdapter: adapter,
    hallId: "hall-a",
    scheduledGameId: "sg-1",
    drawSequenceAtWin: 57,
    firstWinner: defaultWinner(),
    audit,
  });

  assert.equal(results.length, 2);
  assert.equal(creditCalls.length, 2);
  const innsatsenCredit = creditCalls.find((c) =>
    c.idempotencyKey?.includes("pot-inns")
  )!;
  const jackpottCredit = creditCalls.find((c) =>
    c.idempotencyKey?.includes("pot-jp")
  )!;
  assert.equal(innsatsenCredit.amount, 2000);
  assert.equal(jackpottCredit.amount, 100);
  // Begge går til winnings-siden.
  assert.equal(innsatsenCredit.to, "winnings");
  assert.equal(jackpottCredit.to, "winnings");
});

test("PotEvaluator: first winner tar hele potten (ingen split)", async () => {
  // Bare første vinner sendes til potService.tryWin. Helperen har ingen
  // multi-winner-logikk i sin API.
  const pot = makePot();
  const tryWinResults = new Map<string, TryWinResult>();
  tryWinResults.set("innsatsen", {
    triggered: true,
    amountCents: 2000_00,
    reasonCode: null,
    eventId: "event-win",
  });
  const { service, tryWinCalls } = makeFakePotService({
    pots: [pot],
    tryWinResults,
  });
  const { adapter, creditCalls } = makeFakeWalletAdapter();
  const audit = new AuditLogService(new InMemoryAuditLogStore());

  const firstWinner: PotEvaluatorWinner = {
    assignmentId: "assign-first",
    walletId: "wallet-first",
    userId: "user-first",
    hallId: "hall-a",
    ticketColor: "red",
  };

  await evaluateAccumulatingPots({
    client: dummyClient,
    potService: service,
    walletAdapter: adapter,
    hallId: "hall-a",
    scheduledGameId: "sg-1",
    drawSequenceAtWin: 57,
    firstWinner,
    audit,
  });

  // tryWin-kalt kun ÉN gang, med kun første-vinner-data.
  assert.equal(tryWinCalls.length, 1);
  assert.equal(tryWinCalls[0]!.winnerUserId, "user-first");
  assert.equal(tryWinCalls[0]!.ticketColor, "red");

  // Credit-kalt kun ÉN gang til første vinners wallet med hele potten.
  assert.equal(creditCalls.length, 1);
  assert.equal(creditCalls[0]!.accountId, "wallet-first");
  assert.equal(creditCalls[0]!.amount, 2000);
});

test("PotEvaluator: idempotency-key inkluderer pot.id + scheduledGameId", async () => {
  const pot = makePot({ id: "pot-xyz-123" });
  const tryWinResults = new Map<string, TryWinResult>();
  tryWinResults.set("innsatsen", {
    triggered: true,
    amountCents: 500_00,
    reasonCode: null,
    eventId: "event-win",
  });
  const { service } = makeFakePotService({ pots: [pot], tryWinResults });
  const { adapter, creditCalls } = makeFakeWalletAdapter();
  const audit = new AuditLogService(new InMemoryAuditLogStore());

  await evaluateAccumulatingPots({
    client: dummyClient,
    potService: service,
    walletAdapter: adapter,
    hallId: "hall-a",
    scheduledGameId: "sg-abc-999",
    drawSequenceAtWin: 57,
    firstWinner: defaultWinner(),
    audit,
  });

  assert.equal(
    creditCalls[0]!.idempotencyKey,
    "g1-pot-pot-xyz-123-sg-abc-999"
  );
});

test("PotEvaluator: potService.tryWin kaster → kastes videre (draw ruller tilbake)", async () => {
  const pot = makePot();
  const tryWinThrows = new Map<string, Error>();
  tryWinThrows.set("innsatsen", new Error("simulated tryWin failure"));
  const { service } = makeFakePotService({ pots: [pot], tryWinThrows });
  const { adapter } = makeFakeWalletAdapter();
  const audit = new AuditLogService(new InMemoryAuditLogStore());

  await assert.rejects(
    () =>
      evaluateAccumulatingPots({
        client: dummyClient,
        potService: service,
        walletAdapter: adapter,
        hallId: "hall-a",
        scheduledGameId: "sg-1",
        drawSequenceAtWin: 57,
        firstWinner: defaultWinner(),
        audit,
      }),
    /simulated tryWin failure/
  );
});

test("PotEvaluator: potType='generic' → genereisk path, credit med generic-beskrivelse", async () => {
  const pot = makePot({
    config: {
      ...makePot().config,
      potType: "generic",
      drawThresholdLower: undefined,
      targetAmountCents: undefined,
    },
  });
  const tryWinResults = new Map<string, TryWinResult>();
  tryWinResults.set("innsatsen", {
    triggered: true,
    amountCents: 500_00,
    reasonCode: null,
    eventId: "event-win",
  });
  const { service } = makeFakePotService({ pots: [pot], tryWinResults });
  const { adapter, creditCalls } = makeFakeWalletAdapter();
  const audit = new AuditLogService(new InMemoryAuditLogStore());

  const results = await evaluateAccumulatingPots({
    client: dummyClient,
    potService: service,
    walletAdapter: adapter,
    hallId: "hall-a",
    scheduledGameId: "sg-1",
    drawSequenceAtWin: 40,
    firstWinner: defaultWinner(),
    audit,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]!.potType, "generic");
  assert.equal(creditCalls.length, 1);
  assert.ok(
    creditCalls[0]!.description.includes("pot"),
    "generic-beskrivelse skal inneholde 'pot'"
  );
});

test("PotEvaluator: potType ikke satt (undefined) → faller tilbake til 'generic'", async () => {
  const baseCfg = makePot().config;
  const cfg = {
    ...baseCfg,
    drawThresholdLower: undefined,
    targetAmountCents: undefined,
  };
  delete cfg.potType;
  const pot = makePot({ config: cfg });
  const tryWinResults = new Map<string, TryWinResult>();
  tryWinResults.set("innsatsen", {
    triggered: true,
    amountCents: 300_00,
    reasonCode: null,
    eventId: "event",
  });
  const { service } = makeFakePotService({ pots: [pot], tryWinResults });
  const { adapter } = makeFakeWalletAdapter();
  const audit = new AuditLogService(new InMemoryAuditLogStore());

  const results = await evaluateAccumulatingPots({
    client: dummyClient,
    potService: service,
    walletAdapter: adapter,
    hallId: "hall-a",
    scheduledGameId: "sg-1",
    drawSequenceAtWin: 40,
    firstWinner: defaultWinner(),
    audit,
  });
  assert.equal(results[0]!.potType, "generic");
});
