/**
 * HV-9 (audit §3.9): atomicity-tester for AgentSettlementService.closeDay.
 *
 * Pre-pilot quick-win: closeDay gjør 4 separate DB-writes (markShiftSettled →
 * settlements.insert → applyCashTx daily-balance → applyCashTx diff). Uten
 * en delt PG-tx kan crash mellom step 1 og 2 etterlate shift `settled=true`
 * uten settlement-rad — agent låst ute, manuell DB-intervensjon eneste recovery.
 *
 * Disse testene verifiserer at:
 *   1. Happy path: alle 4 writes lykkes → settlement opprettet, shift settled,
 *      cash-balanser oppdatert.
 *   2. Mid-tx-feil i settlements.insert → shift IKKE settled, NO settlement,
 *      cash-balanser uendret.
 *   3. Mid-tx-feil i første applyCashTx → samme rollback-kontrakt.
 *   4. Mid-tx-feil i andre applyCashTx → samme rollback-kontrakt.
 *   5. Concurrent closeDay-calls → kun én vinner, andre får tydelig feil.
 *
 * InMemory-stores muterer in-place uten ekte tx-grenser. For å teste rollback-
 * kontrakten meningsfullt bygger vi `TransactionalTestHarness` som tar et
 * snapshot av all in-memory-state ved hver `runInTransaction(callback)` og
 * restaurerer ved kast. Dette emulerer Postgres BEGIN/COMMIT/ROLLBACK uten
 * å kreve en faktisk DB-tilkobling i unit-tester.
 *
 * Pattern speiler `AgentTransactionService.processCashOp` (canonical
 * atomicity-ref). Se også commit `BIN-PILOT-K1` for tidligere atomic-fix.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { AgentSettlementService } from "../AgentSettlementService.js";
import { AgentService } from "../AgentService.js";
import { AgentShiftService } from "../AgentShiftService.js";
import { AgentTransactionService } from "../AgentTransactionService.js";
import { InMemoryAgentStore } from "../AgentStore.js";
import { InMemoryAgentTransactionStore } from "../AgentTransactionStore.js";
import { InMemoryAgentSettlementStore } from "../AgentSettlementStore.js";
import { InMemoryHallCashLedger } from "../HallCashLedger.js";
import { InMemoryPhysicalTicketReadPort } from "../ports/PhysicalTicketReadPort.js";
import { NotImplementedTicketPurchasePort } from "../ports/TicketPurchasePort.js";
import { InMemoryWalletAdapter } from "../../adapters/InMemoryWalletAdapter.js";
import type { AppUser, HallDefinition } from "../../platform/PlatformService.js";
import { DomainError } from "../../errors/DomainError.js";

// ── TransactionalTestHarness ─────────────────────────────────────────────────
//
// Wrapper rundt InMemoryAgentStore som tar snapshot ved BEGIN og restaurerer
// ved kast. Lar oss teste rollback-kontrakten uten ekte Postgres.
//
// Strategi: `runInTransaction` snapshotter (a) shifts-Map, (b) settlement-rows-
// Map, (c) hall-cash-balances-Map, (d) hall-cash-tx-array. Hvis callback
// kaster, restaurerer vi alle fire fra snapshot før vi propagerer feilen.
// Lykkes callback → ingen restore (commit-ekvivalent). Tester observerer
// state etter kall og verifiserer at rollback-kontrakten holder.
// ─────────────────────────────────────────────────────────────────────────────

interface InspectableState {
  shifts: Map<string, unknown>;
  settlements: Map<string, unknown>;
  hallCashBalances: Map<string, unknown>;
  hallCashTxs: unknown[];
}

interface SnapshottableStore {
  getState(): InspectableState;
  restoreState(state: InspectableState): void;
}

// Wrap store-implementasjoner for test-rollback-semantikk. Bruker reflective
// access til private felter — kun trygt fordi disse er InMemory test-stores.
function snapshottableAdapter(
  agentStore: InMemoryAgentStore,
  settlementStore: InMemoryAgentSettlementStore,
  hallCash: InMemoryHallCashLedger,
): SnapshottableStore {
  return {
    getState(): InspectableState {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aStore = agentStore as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sStore = settlementStore as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hStore = hallCash as any;
      return {
        shifts: new Map(
          [...aStore.shifts.entries()].map(([k, v]: [string, unknown]) => [
            k,
            JSON.parse(JSON.stringify(v)),
          ]),
        ),
        settlements: new Map(
          [...sStore.rows.entries()].map(([k, v]: [string, unknown]) => [
            k,
            JSON.parse(JSON.stringify(v)),
          ]),
        ),
        hallCashBalances: new Map(
          [...hStore.balances.entries()].map(([k, v]: [string, unknown]) => [
            k,
            JSON.parse(JSON.stringify(v)),
          ]),
        ),
        hallCashTxs: JSON.parse(JSON.stringify(hStore.txs)),
      };
    },
    restoreState(state: InspectableState): void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aStore = agentStore as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sStore = settlementStore as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hStore = hallCash as any;
      aStore.shifts.clear();
      for (const [k, v] of state.shifts.entries()) aStore.shifts.set(k, v);
      sStore.rows.clear();
      for (const [k, v] of state.settlements.entries()) sStore.rows.set(k, v);
      hStore.balances.clear();
      for (const [k, v] of state.hallCashBalances.entries()) hStore.balances.set(k, v);
      hStore.txs.length = 0;
      for (const tx of state.hallCashTxs) hStore.txs.push(tx);
    },
  };
}

// Wrap InMemoryAgentStore.runInTransaction så den snapshotter alle stores før
// callback og restaurerer ved kast. Speiler PG BEGIN/COMMIT/ROLLBACK-kontrakt.
function makeTransactionalAgentStore(
  base: InMemoryAgentStore,
  adapter: SnapshottableStore,
): InMemoryAgentStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proxy: any = base;
  const original = proxy.runInTransaction.bind(proxy);
  proxy.runInTransaction = async <T>(
    callback: (client: null) => Promise<T>,
  ): Promise<T> => {
    const snapshot = adapter.getState();
    try {
      return await original(callback);
    } catch (err) {
      adapter.restoreState(snapshot);
      throw err;
    }
  };
  return base;
}

// ── Test-context ─────────────────────────────────────────────────────────────

interface TestCtx {
  service: AgentSettlementService;
  txService: AgentTransactionService;
  store: InMemoryAgentStore;
  txStore: InMemoryAgentTransactionStore;
  settlements: InMemoryAgentSettlementStore;
  hallCash: InMemoryHallCashLedger;
  wallet: InMemoryWalletAdapter;
  adapter: SnapshottableStore;
  seedAgent(id: string, hallId: string): Promise<{ shiftId: string }>;
  seedPlayer(id: string, hallId: string, balance?: number): Promise<void>;
}

interface SetupOptions {
  /**
   * Hvis true (default): wrap `runInTransaction` med snapshot/restore-
   * semantikk for å emulere Postgres BEGIN/COMMIT/ROLLBACK i InMemory.
   * Tester for happy-path og enkelt-tx-rollback bruker denne.
   *
   * Hvis false: bruk `runInTransaction` uendret. Brukes av concurrent-
   * tester der naive snapshot/restore ville feilaktig undo committet
   * arbeid fra andre tx-er (snapshot inkluderer ikke per-tx isolation).
   * Reell Postgres serialiserer concurrent close-day-er via row-lock på
   * shift-raden — den semantikken er allerede testet i Postgres-impl-en.
   */
  withSnapshotWrapper?: boolean;
}

function makeSetup(opts: SetupOptions = {}): TestCtx {
  const withSnapshotWrapper = opts.withSnapshotWrapper ?? true;
  const store = new InMemoryAgentStore();
  const txStore = new InMemoryAgentTransactionStore();
  const settlements = new InMemoryAgentSettlementStore();
  const hallCash = new InMemoryHallCashLedger();
  const wallet = new InMemoryWalletAdapter(0);
  const physicalRead = new InMemoryPhysicalTicketReadPort();

  const adapter = snapshottableAdapter(store, settlements, hallCash);
  if (withSnapshotWrapper) {
    makeTransactionalAgentStore(store, adapter);
  }

  const usersById = new Map<string, AppUser>();
  const playerHalls = new Map<string, Set<string>>();

  const stubPlatform = {
    async getUserById(userId: string): Promise<AppUser> {
      const u = usersById.get(userId);
      if (!u) throw new DomainError("USER_NOT_FOUND", "not found");
      return u;
    },
    async getUserFromAccessToken(): Promise<AppUser> {
      throw new Error("not used");
    },
    async createAdminProvisionedUser(): Promise<AppUser> {
      throw new Error("not used");
    },
    async softDeletePlayer(): Promise<void> {},
    async isPlayerActiveInHall(userId: string, hallId: string): Promise<boolean> {
      return playerHalls.get(userId)?.has(hallId) ?? false;
    },
    async searchPlayersInHall(): Promise<AppUser[]> {
      return [];
    },
    async getHall(hallId: string): Promise<HallDefinition> {
      return {
        id: hallId,
        slug: hallId,
        name: `Hall ${hallId}`,
        region: "NO",
        address: "",
        isActive: true,
        clientVariant: "web",
        tvToken: `tv-${hallId}`,
        createdAt: "",
        updatedAt: "",
      };
    },
  };

  const physicalMark = {
    async markSold(input: {
      uniqueId: string;
      soldBy: string;
      buyerUserId?: string | null;
      priceCents?: number | null;
    }) {
      physicalRead.setStatus(input.uniqueId, "SOLD");
      return { uniqueId: input.uniqueId };
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platformService = stubPlatform as any;
  const agentService = new AgentService({ platformService, agentStore: store });
  const agentShiftService = new AgentShiftService({ agentStore: store, agentService });
  const txService = new AgentTransactionService({
    platformService,
    walletAdapter: wallet,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    physicalTicketService: physicalMark as any,
    physicalTicketReadPort: physicalRead,
    ticketPurchasePort: new NotImplementedTicketPurchasePort(),
    agentService,
    agentShiftService,
    agentStore: store,
    transactionStore: txStore,
  });
  const service = new AgentSettlementService({
    platformService,
    agentService,
    agentShiftService,
    agentStore: store,
    transactionStore: txStore,
    settlementStore: settlements,
    hallCashLedger: hallCash,
  });

  return {
    service,
    txService,
    store,
    txStore,
    settlements,
    hallCash,
    wallet,
    adapter,
    async seedAgent(id, hallId) {
      store.seedAgent({ userId: id, email: `${id}@x.no`, displayName: id });
      await wallet.ensureAccount(`wallet-${id}`);
      usersById.set(id, {
        id,
        email: `${id}@x.no`,
        displayName: id,
        walletId: `wallet-${id}`,
        role: "AGENT",
        hallId: null,
        kycStatus: "UNVERIFIED",
        createdAt: "",
        updatedAt: "",
      });
      await store.assignHall({ userId: id, hallId, isPrimary: true });
      const shift = await store.insertShift({ userId: id, hallId });
      hallCash.seedHallBalance(hallId, 0, 0);
      return { shiftId: shift.id };
    },
    async seedPlayer(id, hallId, balance = 0) {
      const walletId = `wallet-${id}`;
      await wallet.ensureAccount(walletId);
      if (balance > 0) await wallet.credit(walletId, balance, "seed");
      usersById.set(id, {
        id,
        email: `${id}@test.no`,
        displayName: `Player ${id}`,
        walletId,
        role: "PLAYER",
        hallId: null,
        kycStatus: "VERIFIED",
        createdAt: "",
        updatedAt: "",
      });
      const set = playerHalls.get(id) ?? new Set<string>();
      set.add(hallId);
      playerHalls.set(id, set);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. HAPPY PATH — alle 4 writes lykkes
// ═══════════════════════════════════════════════════════════════════════════

test("HV-9 happy path: closeDay commits alle 4 DB-writes atomisk", async () => {
  const ctx = makeSetup();
  const { shiftId } = await ctx.seedAgent("a1", "hall-a");
  await ctx.seedPlayer("p1", "hall-a");
  // Bygg dailyBalance > 0 så cash-transfer skjer (step 3 ikke skipped).
  await ctx.txService.cashIn({
    agentUserId: "a1",
    playerUserId: "p1",
    amount: 500,
    paymentMethod: "CASH",
    clientRequestId: "happy-1",
  });

  const settlement = await ctx.service.closeDay({
    agentUserId: "a1",
    agentRole: "AGENT",
    reportedCashCount: 500,
  });

  // Step 1: shift settled
  const shift = await ctx.store.getShiftById(shiftId);
  assert.ok(shift?.settledAt, "shift skal være settled");
  assert.equal(shift?.isActive, false, "shift skal ikke lenger være aktiv");

  // Step 2: settlement-rad opprettet
  assert.ok(settlement.id, "settlement-rad skal være opprettet");
  assert.equal(settlement.shiftId, shiftId);
  assert.equal(settlement.dailyBalanceAtEnd, 500);
  const fetched = await ctx.settlements.getByShiftId(shiftId);
  assert.ok(fetched, "settlement skal kunne leses fra store");

  // Step 3: hall.cash_balance kreditert med dailyBalance
  const balances = await ctx.hallCash.getHallBalances("hall-a");
  assert.equal(balances.cashBalance, 500, "hall cash skal være kreditert med 500");

  // Step 4: ingen diff → ingen SHIFT_DIFFERENCE-tx
  const cashTxs = await ctx.hallCash.listForSettlement(settlement.id);
  assert.equal(cashTxs.length, 1, "kun DAILY_BALANCE_TRANSFER-tx skal eksistere");
  assert.equal(cashTxs[0]!.txType, "DAILY_BALANCE_TRANSFER");
});

test("HV-9 happy path: closeDay med non-zero diff (ADMIN force) commits alle 4 writes", async () => {
  const ctx = makeSetup();
  const { shiftId } = await ctx.seedAgent("a1", "hall-a");
  await ctx.seedPlayer("p1", "hall-a");
  // dailyBalance = 20000, diff = -1500 → 7.5% → FORCE
  await ctx.txService.cashIn({
    agentUserId: "a1",
    playerUserId: "p1",
    amount: 20000,
    paymentMethod: "CASH",
    clientRequestId: "force-1",
  });

  const settlement = await ctx.service.closeDay({
    agentUserId: "a1",
    agentRole: "ADMIN",
    reportedCashCount: 18500,
    settlementNote: "Mangler kontant — bekreftet med fysisk telling",
    isForceRequested: true,
  });

  const shift = await ctx.store.getShiftById(shiftId);
  assert.ok(shift?.settledAt);
  assert.equal(settlement.dailyBalanceDifference, -1500);
  assert.equal(settlement.isForced, true);

  // Begge cash-tx-er skal være registrert (DAILY + DIFF)
  const cashTxs = await ctx.hallCash.listForSettlement(settlement.id);
  const txTypes = cashTxs.map((t) => t.txType).sort();
  assert.deepEqual(txTypes, ["DAILY_BALANCE_TRANSFER", "SHIFT_DIFFERENCE"]);
  // Hall cash = +20000 (transfer) - 1500 (diff debit) = 18500
  const balances = await ctx.hallCash.getHallBalances("hall-a");
  assert.equal(balances.cashBalance, 18500);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. MID-TX FAIL: settlements.insert kaster
// ═══════════════════════════════════════════════════════════════════════════

test("HV-9 rollback: settlements.insert kaster → shift IKKE settled, ingen cash-bevegelse", async () => {
  const ctx = makeSetup();
  const { shiftId } = await ctx.seedAgent("a1", "hall-a");
  await ctx.seedPlayer("p1", "hall-a");
  await ctx.txService.cashIn({
    agentUserId: "a1",
    playerUserId: "p1",
    amount: 500,
    paymentMethod: "CASH",
    clientRequestId: "rollback-insert-1",
  });
  const balanceBefore = (await ctx.hallCash.getHallBalances("hall-a")).cashBalance;

  // Mock: settlements.insert kaster simulert DB-feil.
  const originalInsert = ctx.settlements.insert.bind(ctx.settlements);
  let insertCalls = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ctx.settlements as any).insert = async () => {
    insertCalls += 1;
    throw new Error("Simulert DB-feil i settlements.insert");
  };

  await assert.rejects(
    ctx.service.closeDay({
      agentUserId: "a1",
      agentRole: "AGENT",
      reportedCashCount: 500,
    }),
    (err: unknown) => err instanceof Error && /Simulert DB-feil/.test(err.message),
  );
  assert.equal(insertCalls, 1, "insert skal ha vært kalt nøyaktig én gang");

  // Rollback-kontrakt:
  //  • shift IKKE settled — agenten kan re-attempte
  const shift = await ctx.store.getShiftById(shiftId);
  assert.equal(shift?.settledAt, null, "shift må IKKE være settled etter rollback");
  assert.equal(shift?.isActive, true, "shift må fortsatt være aktiv etter rollback");
  //  • ingen settlement-rad
  const fetched = await ctx.settlements.getByShiftId(shiftId);
  assert.equal(fetched, null, "ingen settlement-rad skal eksistere");
  //  • cash-balanse uendret
  const balanceAfter = (await ctx.hallCash.getHallBalances("hall-a")).cashBalance;
  assert.equal(balanceAfter, balanceBefore, "hall.cash_balance må være uendret");
  // Restore mock og verifiser re-attempt fungerer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ctx.settlements as any).insert = originalInsert;
  const settlement = await ctx.service.closeDay({
    agentUserId: "a1",
    agentRole: "AGENT",
    reportedCashCount: 500,
  });
  assert.ok(settlement.id, "re-attempt skal lykkes etter rollback");
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. MID-TX FAIL: første applyCashTx (DAILY_BALANCE_TRANSFER) kaster
// ═══════════════════════════════════════════════════════════════════════════

test("HV-9 rollback: første applyCashTx kaster → shift IKKE settled, ingen settlement, balanse uendret", async () => {
  const ctx = makeSetup();
  const { shiftId } = await ctx.seedAgent("a1", "hall-a");
  await ctx.seedPlayer("p1", "hall-a");
  await ctx.txService.cashIn({
    agentUserId: "a1",
    playerUserId: "p1",
    amount: 500,
    paymentMethod: "CASH",
    clientRequestId: "rollback-cash1-1",
  });
  const balanceBefore = (await ctx.hallCash.getHallBalances("hall-a")).cashBalance;

  // Mock: applyCashTx kaster ved første call (DAILY_BALANCE_TRANSFER).
  const originalApply = ctx.hallCash.applyCashTx.bind(ctx.hallCash);
  let applyCalls = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ctx.hallCash as any).applyCashTx = async () => {
    applyCalls += 1;
    throw new Error("Simulert DB-feil i første applyCashTx");
  };

  await assert.rejects(
    ctx.service.closeDay({
      agentUserId: "a1",
      agentRole: "AGENT",
      reportedCashCount: 500,
    }),
    (err: unknown) => err instanceof Error && /Simulert DB-feil/.test(err.message),
  );
  assert.equal(applyCalls, 1, "applyCashTx skal ha vært kalt nøyaktig én gang");

  // Rollback-kontrakt:
  const shift = await ctx.store.getShiftById(shiftId);
  assert.equal(shift?.settledAt, null, "shift må IKKE være settled");
  assert.equal(shift?.isActive, true);
  const fetched = await ctx.settlements.getByShiftId(shiftId);
  assert.equal(fetched, null, "ingen settlement-rad");
  const balanceAfter = (await ctx.hallCash.getHallBalances("hall-a")).cashBalance;
  assert.equal(balanceAfter, balanceBefore, "balanse uendret");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ctx.hallCash as any).applyCashTx = originalApply;
  const settlement = await ctx.service.closeDay({
    agentUserId: "a1",
    agentRole: "AGENT",
    reportedCashCount: 500,
  });
  assert.ok(settlement.id, "re-attempt skal lykkes");
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. MID-TX FAIL: andre applyCashTx (SHIFT_DIFFERENCE) kaster
// ═══════════════════════════════════════════════════════════════════════════

test("HV-9 rollback: andre applyCashTx kaster → shift IKKE settled, første cash-tx også rollback", async () => {
  const ctx = makeSetup();
  const { shiftId } = await ctx.seedAgent("a1", "hall-a");
  await ctx.seedPlayer("p1", "hall-a");
  // dailyBalance = 20000, diff = -1500 → krever ADMIN force; begge cash-tx-er
  // (DAILY_TRANSFER + SHIFT_DIFFERENCE) skal kjøres.
  await ctx.txService.cashIn({
    agentUserId: "a1",
    playerUserId: "p1",
    amount: 20000,
    paymentMethod: "CASH",
    clientRequestId: "rollback-cash2-1",
  });
  const balanceBefore = (await ctx.hallCash.getHallBalances("hall-a")).cashBalance;

  // Mock: kast på 2. applyCashTx-call.
  const originalApply = ctx.hallCash.applyCashTx.bind(ctx.hallCash);
  let applyCalls = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ctx.hallCash as any).applyCashTx = async (
    input: Parameters<typeof originalApply>[0],
    client: Parameters<typeof originalApply>[1],
  ) => {
    applyCalls += 1;
    if (applyCalls === 2) {
      throw new Error("Simulert DB-feil i andre applyCashTx (SHIFT_DIFFERENCE)");
    }
    return originalApply(input, client);
  };

  await assert.rejects(
    ctx.service.closeDay({
      agentUserId: "a1",
      agentRole: "ADMIN",
      reportedCashCount: 18500,
      settlementNote: "Avvik",
      isForceRequested: true,
    }),
    (err: unknown) => err instanceof Error && /Simulert DB-feil/.test(err.message),
  );
  assert.equal(applyCalls, 2, "applyCashTx skal ha vært kalt to ganger før rollback");

  // Rollback må reversere ALT — også første cash-tx (DAILY_BALANCE_TRANSFER).
  const shift = await ctx.store.getShiftById(shiftId);
  assert.equal(shift?.settledAt, null, "shift må IKKE være settled");
  const fetched = await ctx.settlements.getByShiftId(shiftId);
  assert.equal(fetched, null, "ingen settlement-rad");
  const balanceAfter = (await ctx.hallCash.getHallBalances("hall-a")).cashBalance;
  assert.equal(
    balanceAfter,
    balanceBefore,
    "hall.cash_balance må være uendret — første cash-tx skal også være rollback'd",
  );
  // Re-attempt etter mock-restore: nå skal begge cash-tx-er bli persistert.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ctx.hallCash as any).applyCashTx = originalApply;
  const settlement = await ctx.service.closeDay({
    agentUserId: "a1",
    agentRole: "ADMIN",
    reportedCashCount: 18500,
    settlementNote: "Avvik",
    isForceRequested: true,
  });
  assert.ok(settlement.id);
  const cashTxs = await ctx.hallCash.listForSettlement(settlement.id);
  assert.equal(cashTxs.length, 2, "begge cash-tx-er skal eksistere etter vellykket re-attempt");
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. MID-TX FAIL: markShiftSettled kaster (sanity — første step rollback)
// ═══════════════════════════════════════════════════════════════════════════

test("HV-9 rollback: markShiftSettled kaster → ingen settlement, ingen cash-bevegelse", async () => {
  const ctx = makeSetup();
  const { shiftId } = await ctx.seedAgent("a1", "hall-a");
  await ctx.seedPlayer("p1", "hall-a");
  await ctx.txService.cashIn({
    agentUserId: "a1",
    playerUserId: "p1",
    amount: 500,
    paymentMethod: "CASH",
    clientRequestId: "rollback-mark-1",
  });
  const balanceBefore = (await ctx.hallCash.getHallBalances("hall-a")).cashBalance;

  // Mock: markShiftSettled kaster.
  const originalMark = ctx.store.markShiftSettled.bind(ctx.store);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ctx.store as any).markShiftSettled = async () => {
    throw new Error("Simulert DB-feil i markShiftSettled");
  };

  await assert.rejects(
    ctx.service.closeDay({
      agentUserId: "a1",
      agentRole: "AGENT",
      reportedCashCount: 500,
    }),
    (err: unknown) => err instanceof Error && /Simulert DB-feil/.test(err.message),
  );

  const shift = await ctx.store.getShiftById(shiftId);
  assert.equal(shift?.settledAt, null);
  const fetched = await ctx.settlements.getByShiftId(shiftId);
  assert.equal(fetched, null);
  const balanceAfter = (await ctx.hallCash.getHallBalances("hall-a")).cashBalance;
  assert.equal(balanceAfter, balanceBefore);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ctx.store as any).markShiftSettled = originalMark;
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. CONCURRENT closeDay — kun én vinner
// ═══════════════════════════════════════════════════════════════════════════

test("HV-9 concurrent closeDay: kun én lykkes, andre får tydelig feil (SHIFT_SETTLED)", async () => {
  // Concurrent-test bruker IKKE snapshot-wrapper. Wrapper-en gir ikke per-tx
  // isolation — den restaurerer global state ved rollback, og kan dermed
  // feilaktig undo committet arbeid fra parallel transaksjon. Reell Postgres
  // serialiserer concurrent close-day-er via row-lock; den semantikken
  // verifiseres separat i Postgres-impl-tester.
  const ctx = makeSetup({ withSnapshotWrapper: false });
  const { shiftId } = await ctx.seedAgent("a1", "hall-a");
  await ctx.seedPlayer("p1", "hall-a");
  await ctx.txService.cashIn({
    agentUserId: "a1",
    playerUserId: "p1",
    amount: 500,
    paymentMethod: "CASH",
    clientRequestId: "concurrent-1",
  });

  // Kjør to closeDay-kall som concurrent (Promise.allSettled). InMemory er
  // single-threaded så de serialiseres, men semantikken er den samme: kun
  // én skal commite, andre må reagere på allerede-settled-state.
  const results = await Promise.allSettled([
    ctx.service.closeDay({
      agentUserId: "a1",
      agentRole: "AGENT",
      reportedCashCount: 500,
    }),
    ctx.service.closeDay({
      agentUserId: "a1",
      agentRole: "AGENT",
      reportedCashCount: 500,
    }),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "kun én closeDay-call skal lykkes");
  assert.equal(rejected.length, 1, "den andre må feile tydelig");
  // Den feilede skal ha en tydelig "already settled"-signal. Avhengig av
  // race-timing er denne enten:
  //   • DomainError("SHIFT_SETTLED") fra service-laget early-check (begge
  //     leste shift før første closeDay markerte den settled),
  //   • DomainError("NO_ACTIVE_SHIFT") hvis store.markShiftSettled satte
  //     is_active=false før andre kall leste shift,
  //   • plain Error("[BIN-583] shift already settled") fra
  //     store.markShiftSettled (Postgres `WHERE settled_at IS NULL` slår null
  //     i andre kall etter første committet).
  // Alle tre er akseptable — viktigst er at andre kall IKKE silent succeed.
  const rejection = rejected[0]! as PromiseRejectedResult;
  const err = rejection.reason as unknown;
  if (err instanceof DomainError) {
    assert.ok(
      ["SHIFT_SETTLED", "NO_ACTIVE_SHIFT"].includes(err.code),
      `concurrent loser DomainError-kode skal være SHIFT_SETTLED eller NO_ACTIVE_SHIFT, fikk ${err.code}`,
    );
  } else {
    assert.ok(
      err instanceof Error && /already settled|shift not found/i.test(err.message),
      `concurrent loser-feil skal indikere already-settled eller missing shift, fikk: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Sluttstate: nøyaktig én settlement-rad eksisterer.
  const fetched = await ctx.settlements.getByShiftId(shiftId);
  assert.ok(fetched, "én settlement skal eksistere");
  // Hall.cash_balance reflekterer kun én transfer.
  const balances = await ctx.hallCash.getHallBalances("hall-a");
  assert.equal(balances.cashBalance, 500, "hall cash skal kun reflektere én transfer");
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. RESPONSE SHAPE: identisk med pre-refactor på success path
// ═══════════════════════════════════════════════════════════════════════════

test("HV-9 response shape: closeDay returnerer samme settlement-objekt-form som før refactor", async () => {
  const ctx = makeSetup();
  const { shiftId } = await ctx.seedAgent("a1", "hall-a");
  await ctx.seedPlayer("p1", "hall-a");
  await ctx.txService.cashIn({
    agentUserId: "a1",
    playerUserId: "p1",
    amount: 500,
    paymentMethod: "CASH",
    clientRequestId: "shape-1",
  });

  const settlement = await ctx.service.closeDay({
    agentUserId: "a1",
    agentRole: "AGENT",
    reportedCashCount: 500,
  });

  // Ekstern API-kontrakt — alle disse feltene må fortsatt være tilgjengelige
  // for klienter (admin-web settlement-popup, PDF-export, agent-dashboard).
  assert.equal(typeof settlement.id, "string");
  assert.equal(settlement.shiftId, shiftId);
  assert.equal(settlement.hallId, "hall-a");
  assert.equal(settlement.agentUserId, "a1");
  assert.equal(typeof settlement.businessDate, "string");
  assert.equal(settlement.dailyBalanceAtEnd, 500);
  assert.equal(settlement.reportedCashCount, 500);
  assert.equal(settlement.dailyBalanceDifference, 0);
  assert.equal(settlement.shiftCashInTotal, 500);
  assert.equal(settlement.shiftCashOutTotal, 0);
  assert.equal(settlement.isForced, false);
  assert.equal(settlement.closedByUserId, "a1");
  assert.equal(settlement.editedByUserId, null);
  assert.equal(settlement.editedAt, null);
  assert.ok(settlement.otherData);
  assert.equal((settlement.otherData as Record<string, unknown>).diffSeverity, "OK");
});
