/**
 * PR-T2 Spor 4: Tester for jackpot-pot-evaluator i Game1DrawEngineService.
 *
 * Dekker:
 *   1) Happy-path: fase=5, draw=50, pot=2000 kr → tryWin kalt + wallet.credit
 *      med `to: "winnings"` + korrekt idempotency-key + audit-log skrevet.
 *   2) Ikke utløst ved draw=57 men pot.tryWin returnerer POT_EMPTY (allerede
 *      vunnet tidligere i spillet) → ingen credit, ingen audit.
 *   3) Threshold ikke nådd (draw=49): tryWin returnerer DRAW_BEFORE_WINDOW →
 *      ingen credit, ingen audit.
 *   4) Multi-winner samme hall: kun FØRSTE vinner (array-orden) får pot.
 *   5) Multi-hall vinnere: hver hall får sin egen pot evaluert.
 *   6) Idempotency-key-format: `g1-jackpot-{hallId}-{gameId}`.
 *   7) Fail-closed — tryWin kaster → draw fortsetter, ikke re-throw.
 *   8) Fail-closed — wallet.credit kaster → draw fortsetter, ERROR loggres.
 *   9) Fase 4 (ikke Fullt Hus) → tryWin IKKE kalt.
 *  10) Daily-boost lazy-hook: potDailyTickService.ensureDailyAccumulatedForHall
 *      blir kalt FØR tryWin, og feil i boost-hook blokkerer ikke tryWin.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Game1DrawEngineService } from "./Game1DrawEngineService.js";
import type { Game1TicketPurchaseService } from "./Game1TicketPurchaseService.js";
import {
  AuditLogService,
  InMemoryAuditLogStore,
} from "../compliance/AuditLogService.js";
import type { Game1PotService, TryWinResult } from "./pot/Game1PotService.js";
import type { PotDailyAccumulationTickService } from "./pot/PotDailyAccumulationTickService.js";
import type { WalletAdapter } from "../adapters/WalletAdapter.js";

// ── Fake pool (ikke brukt av evaluator direkte, men constructor krever den) ─

function stubPool(): {
  connect: () => Promise<{
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
    release: () => void;
  }>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
} {
  const q = async () => ({ rows: [] as unknown[], rowCount: 0 });
  return {
    connect: async () => ({ query: q, release: () => undefined }),
    query: q,
  };
}

// ── Fake pot-service ────────────────────────────────────────────────────────

interface TryWinCall {
  hallId: string;
  potKey: string;
  phase: number;
  drawSequenceAtWin: number;
  ticketColor: string;
  winnerUserId: string;
  scheduledGameId: string;
}

function makeFakePotService(
  responder: (input: TryWinCall) => Promise<TryWinResult> | TryWinResult
): { service: Game1PotService; calls: TryWinCall[] } {
  const calls: TryWinCall[] = [];
  const service = {
    async tryWin(input: TryWinCall) {
      calls.push(input);
      return await responder(input);
    },
  } as unknown as Game1PotService;
  return { service, calls };
}

// ── Fake wallet-adapter (kun credit brukes) ─────────────────────────────────

interface CreditCall {
  accountId: string;
  amount: number;
  reason: string;
  options?: { to?: string; idempotencyKey?: string };
}

function makeFakeWallet(
  responder?: (c: CreditCall) => Promise<void> | void
): { adapter: WalletAdapter; calls: CreditCall[] } {
  const calls: CreditCall[] = [];
  const adapter = {
    async credit(
      accountId: string,
      amount: number,
      reason: string,
      options?: { to?: string; idempotencyKey?: string }
    ) {
      const call = { accountId, amount, reason, options };
      calls.push(call);
      if (responder) await responder(call);
      return {
        id: "tx-" + (calls.length),
        accountId,
        amount,
        balanceAfter: 0,
        reason,
        type: "credit",
        createdAt: new Date().toISOString(),
      };
    },
  } as unknown as WalletAdapter;
  return { adapter, calls };
}

// ── Fake daily-tick-service ─────────────────────────────────────────────────

function makeFakeTick(
  responder?: (hallId: string) => Promise<void> | void
): {
  service: PotDailyAccumulationTickService;
  calls: string[];
} {
  const calls: string[] = [];
  const service = {
    async ensureDailyAccumulatedForHall(hallId: string) {
      calls.push(hallId);
      if (responder) await responder(hallId);
      return {
        todayUtc: "2026-04-22",
        totalPots: 1,
        accumulated: 1,
        skipped: 0,
        failed: 0,
        failures: [],
      };
    },
  } as unknown as PotDailyAccumulationTickService;
  return { service, calls };
}

// ── Felles helpers ──────────────────────────────────────────────────────────

function makeEngine(deps: {
  potService?: Game1PotService;
  walletAdapter?: WalletAdapter;
  potDailyTickService?: PotDailyAccumulationTickService;
  audit?: AuditLogService;
}): {
  engine: Game1DrawEngineService;
  audit: AuditLogService;
  auditStore: InMemoryAuditLogStore;
} {
  const auditStore = new InMemoryAuditLogStore();
  const audit = deps.audit ?? new AuditLogService(auditStore);
  const fakeTicketPurchase = {} as Game1TicketPurchaseService;

  const engine = new Game1DrawEngineService({
    pool: stubPool() as never,
    ticketPurchaseService: fakeTicketPurchase,
    auditLogService: audit,
    potService: deps.potService,
    walletAdapter: deps.walletAdapter,
    potDailyTickService: deps.potDailyTickService,
  });
  return { engine, audit, auditStore };
}

function winners(
  overrides: Array<Partial<{
    assignmentId: string;
    walletId: string;
    userId: string;
    hallId: string;
    ticketColor: string;
  }>> = [{}]
): Array<{
  assignmentId: string;
  walletId: string;
  userId: string;
  hallId: string;
  ticketColor: string;
}> {
  return overrides.map((o, i) => ({
    assignmentId: `assign-${i + 1}`,
    walletId: `wallet-${i + 1}`,
    userId: `user-${i + 1}`,
    hallId: "hall-a",
    ticketColor: "small_yellow",
    ...o,
  }));
}

/** Rett inn i private-metoden for isolerte integrasjonstester. */
async function callEvaluator(
  engine: Game1DrawEngineService,
  args: {
    scheduledGameId: string;
    currentPhase: number;
    drawSequenceAtWin: number;
    winners: ReturnType<typeof winners>;
  }
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (engine as any).evaluateAccumulatingJackpotPots(
    args.scheduledGameId,
    args.currentPhase,
    args.drawSequenceAtWin,
    args.winners
  );
}

// ── Tester ──────────────────────────────────────────────────────────────────

test("jackpot-evaluator: fase=5 + triggered → wallet.credit til winnings + audit-log", async () => {
  const { service: potService, calls: tryCalls } = makeFakePotService(async () => ({
    triggered: true,
    amountCents: 5000_00, // 5000 kr
    reasonCode: null,
    eventId: "ev-1",
  }));
  const { adapter: wallet, calls: creditCalls } = makeFakeWallet();
  const { engine, auditStore } = makeEngine({ potService, walletAdapter: wallet });

  await callEvaluator(engine, {
    scheduledGameId: "sg-1",
    currentPhase: 5,
    drawSequenceAtWin: 50,
    winners: winners([{ walletId: "wal-1", userId: "user-1", hallId: "hall-a" }]),
  });

  assert.equal(tryCalls.length, 1);
  assert.equal(tryCalls[0]!.potKey, "jackpott");
  assert.equal(tryCalls[0]!.phase, 5);
  assert.equal(tryCalls[0]!.drawSequenceAtWin, 50);
  assert.equal(tryCalls[0]!.hallId, "hall-a");

  assert.equal(creditCalls.length, 1);
  assert.equal(creditCalls[0]!.accountId, "wal-1");
  assert.equal(creditCalls[0]!.amount, 5000, "5000_00 øre → 5000 kr");
  assert.equal(creditCalls[0]!.options?.to, "winnings");
  assert.equal(
    creditCalls[0]!.options?.idempotencyKey,
    "g1-jackpot-hall-a-sg-1"
  );

  // Audit skrives fire-and-forget → vent med å la event-loop flushe.
  await new Promise((r) => setImmediate(r));
  const events = await auditStore.list({ action: "game1.jackpot_won" });
  assert.equal(events.length, 1, "audit-rad skrevet");
  assert.equal(events[0]!.actorType, "SYSTEM");
});

test("jackpot-evaluator: POT_EMPTY (allerede vunnet) → ingen credit, ingen audit", async () => {
  const { service: potService } = makeFakePotService(async () => ({
    triggered: false,
    amountCents: 0,
    reasonCode: "POT_EMPTY",
    eventId: null,
  }));
  const { adapter: wallet, calls: creditCalls } = makeFakeWallet();
  const { engine, auditStore } = makeEngine({ potService, walletAdapter: wallet });

  await callEvaluator(engine, {
    scheduledGameId: "sg-1",
    currentPhase: 5,
    drawSequenceAtWin: 57,
    winners: winners(),
  });

  assert.equal(creditCalls.length, 0);
  await new Promise((r) => setImmediate(r));
  const events = await auditStore.list({ action: "game1.jackpot_won" });
  assert.equal(events.length, 0);
});

test("jackpot-evaluator: DRAW_BEFORE_WINDOW → ingen credit", async () => {
  const { service: potService, calls: tryCalls } = makeFakePotService(async () => ({
    triggered: false,
    amountCents: 0,
    reasonCode: "DRAW_BEFORE_WINDOW",
    eventId: null,
  }));
  const { adapter: wallet, calls: creditCalls } = makeFakeWallet();
  const { engine } = makeEngine({ potService, walletAdapter: wallet });

  await callEvaluator(engine, {
    scheduledGameId: "sg-1",
    currentPhase: 5,
    drawSequenceAtWin: 49,
    winners: winners(),
  });

  assert.equal(tryCalls.length, 1, "tryWin kalles fortsatt — T1 eier reason-logikken");
  assert.equal(creditCalls.length, 0, "ingen credit ved !triggered");
});

test("jackpot-evaluator: multi-winner samme hall → KUN første tar pot", async () => {
  // Første vinner vinner, andre skal ikke få tryWin kalt fordi evaluator
  // kun iterer 'first winner per hall'.
  const { service: potService, calls: tryCalls } = makeFakePotService(async () => ({
    triggered: true,
    amountCents: 3000_00,
    reasonCode: null,
    eventId: "ev-multi",
  }));
  const { adapter: wallet, calls: creditCalls } = makeFakeWallet();
  const { engine } = makeEngine({ potService, walletAdapter: wallet });

  await callEvaluator(engine, {
    scheduledGameId: "sg-1",
    currentPhase: 5,
    drawSequenceAtWin: 50,
    winners: winners([
      { userId: "user-1", walletId: "wal-1", hallId: "hall-a" },
      { userId: "user-2", walletId: "wal-2", hallId: "hall-a" },
      { userId: "user-3", walletId: "wal-3", hallId: "hall-a" },
    ]),
  });

  assert.equal(tryCalls.length, 1, "kun FØRSTE vinner (array-orden) prøver jackpott");
  assert.equal(tryCalls[0]!.winnerUserId, "user-1");
  assert.equal(creditCalls.length, 1);
  assert.equal(creditCalls[0]!.accountId, "wal-1");
});

test("jackpot-evaluator: multi-hall → hver hall får sin pot evaluert separat", async () => {
  const { service: potService, calls: tryCalls } = makeFakePotService(async (input) => {
    // Kun hall-a har aktiv pot i dette oppsettet.
    if (input.hallId === "hall-a") {
      return {
        triggered: true,
        amountCents: 2000_00,
        reasonCode: null,
        eventId: `ev-${input.hallId}`,
      };
    }
    return {
      triggered: false,
      amountCents: 0,
      reasonCode: "POT_NOT_FOUND",
      eventId: null,
    };
  });
  const { adapter: wallet, calls: creditCalls } = makeFakeWallet();
  const { engine } = makeEngine({ potService, walletAdapter: wallet });

  await callEvaluator(engine, {
    scheduledGameId: "sg-multi",
    currentPhase: 5,
    drawSequenceAtWin: 52,
    winners: winners([
      { userId: "user-a", walletId: "wal-a", hallId: "hall-a" },
      { userId: "user-b", walletId: "wal-b", hallId: "hall-b" },
    ]),
  });

  assert.equal(tryCalls.length, 2, "én per hall");
  const hallIds = tryCalls.map((c) => c.hallId).sort();
  assert.deepEqual(hallIds, ["hall-a", "hall-b"]);
  assert.equal(creditCalls.length, 1, "kun hall-a hadde triggered pot");
  assert.equal(creditCalls[0]!.accountId, "wal-a");
  assert.equal(
    creditCalls[0]!.options?.idempotencyKey,
    "g1-jackpot-hall-a-sg-multi"
  );
});

test("jackpot-evaluator: fase 4 → tryWin IKKE kalt", async () => {
  const { service: potService, calls: tryCalls } = makeFakePotService(async () => ({
    triggered: true,
    amountCents: 9999,
    reasonCode: null,
    eventId: "x",
  }));
  const { adapter: wallet, calls: creditCalls } = makeFakeWallet();
  const { engine } = makeEngine({ potService, walletAdapter: wallet });

  await callEvaluator(engine, {
    scheduledGameId: "sg-1",
    currentPhase: 4,
    drawSequenceAtWin: 50,
    winners: winners(),
  });

  assert.equal(tryCalls.length, 0);
  assert.equal(creditCalls.length, 0);
});

test("jackpot-evaluator: tryWin kaster → draw fortsetter (fail-closed)", async () => {
  const { service: potService } = makeFakePotService(async () => {
    throw new Error("db-timeout");
  });
  const { adapter: wallet, calls: creditCalls } = makeFakeWallet();
  const { engine } = makeEngine({ potService, walletAdapter: wallet });

  // Skal IKKE kaste.
  await callEvaluator(engine, {
    scheduledGameId: "sg-1",
    currentPhase: 5,
    drawSequenceAtWin: 50,
    winners: winners(),
  });
  assert.equal(creditCalls.length, 0);
});

test("jackpot-evaluator: wallet.credit kaster → draw fortsetter (pot allerede utløst)", async () => {
  const { service: potService } = makeFakePotService(async () => ({
    triggered: true,
    amountCents: 2000_00,
    reasonCode: null,
    eventId: "ev-credit-fail",
  }));
  const { adapter: wallet, calls: creditCalls } = makeFakeWallet(() => {
    throw new Error("wallet-unavailable");
  });
  const { engine } = makeEngine({ potService, walletAdapter: wallet });

  // Skal IKKE kaste — fail-closed per PR-T2-kontrakt.
  await callEvaluator(engine, {
    scheduledGameId: "sg-1",
    currentPhase: 5,
    drawSequenceAtWin: 50,
    winners: winners(),
  });
  assert.equal(creditCalls.length, 1, "credit ble forsøkt én gang");
});

test("jackpot-evaluator: ingen potService → no-op, ingen kaster", async () => {
  const { engine } = makeEngine({});
  // Skal ikke kaste, skal ikke gjøre noe.
  await callEvaluator(engine, {
    scheduledGameId: "sg-1",
    currentPhase: 5,
    drawSequenceAtWin: 50,
    winners: winners(),
  });
});

test("jackpot-evaluator: daily-boost lazy-hook kalt FØR tryWin, feil svelges", async () => {
  const callOrder: string[] = [];
  const { service: tick } = makeFakeTick(async (hallId) => {
    callOrder.push(`boost:${hallId}`);
    throw new Error("boost-unavailable");
  });
  const { service: potService } = makeFakePotService(async (input) => {
    callOrder.push(`tryWin:${input.hallId}`);
    return {
      triggered: true,
      amountCents: 1000_00,
      reasonCode: null,
      eventId: "ev-boost-test",
    };
  });
  const { adapter: wallet, calls: creditCalls } = makeFakeWallet();
  const { engine } = makeEngine({
    potService,
    walletAdapter: wallet,
    potDailyTickService: tick,
  });

  await callEvaluator(engine, {
    scheduledGameId: "sg-1",
    currentPhase: 5,
    drawSequenceAtWin: 50,
    winners: winners(),
  });

  assert.deepEqual(
    callOrder,
    ["boost:hall-a", "tryWin:hall-a"],
    "boost kalt før tryWin"
  );
  assert.equal(creditCalls.length, 1, "credit skjer tross boost-feil");
});
