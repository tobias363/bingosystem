/**
 * PR-T3 Spor 4: PotSalesHook-integrasjon-tester for Game1TicketPurchaseService.
 *
 * Verifiserer at `purchase()` kaller `potSalesHook.onSaleCompleted({ hallId,
 * saleAmountCents })` etter vellykket wallet-debit + INSERT:
 *
 *   1) digital_wallet happy → hook kalles med riktig hallId + totalAmountCents
 *   2) Hook-feil → purchase lykkes likevel (soft-fail)
 *   3) cash_agent / card_agent → hook kalles ogsÅ (pot bygger på total-salg,
 *      ikke bare digital-flyt — brief §Del 1)
 *   4) Default NoopPotSalesHook → purchase fungerer uten pot-oppslag
 *   5) 100%-winnings-kjøp → hook kalles (pot er ikke loss-ledger, så hele
 *      salg teller)
 *   6) Idempotency retry → hook kalles IKKE (existing-purchase short-circuit)
 *   7) Hookens hallId + saleAmountCents matcher purchase-input
 *   8) Hook-feil logges som warning — ingen DomainError kastes
 *
 * Se docs/architecture/SPILL1_FULL_VARIANT_CATALOG_2026-04-21.md §Innsatsen.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Game1TicketPurchaseService } from "./Game1TicketPurchaseService.js";
import { InMemoryWalletAdapter } from "../adapters/InMemoryWalletAdapter.js";
import {
  AuditLogService,
  InMemoryAuditLogStore,
} from "../compliance/AuditLogService.js";
import type { Game1HallReadyService } from "./Game1HallReadyService.js";
import type { PlatformService } from "../platform/PlatformService.js";
import type { PotSalesHookPort } from "../adapters/PotSalesHookPort.js";

// ── Recording port ───────────────────────────────────────────────────────────

interface RecordedHookCall {
  hallId: string;
  saleAmountCents: number;
}

function makeRecordingHook(opts?: { throwError?: boolean }): {
  port: PotSalesHookPort;
  calls: RecordedHookCall[];
} {
  const calls: RecordedHookCall[] = [];
  const port: PotSalesHookPort = {
    async onSaleCompleted(params) {
      if (opts?.throwError) {
        throw new Error("simulated pot-hook failure");
      }
      calls.push({ ...params });
    },
  };
  return { port, calls };
}

// ── Stub pool + fixtures ────────────────────────────────────────────────────

interface StubResponse {
  match: (sql: string) => boolean;
  rows: unknown[];
  once?: boolean;
}

function createStubPool(responses: StubResponse[] = []): {
  pool: {
    query: (
      sql: string,
      params?: unknown[]
    ) => Promise<{ rows: unknown[]; rowCount: number }>;
  };
} {
  const queue = responses.slice();
  return {
    pool: {
      query: async (sql: string, _params: unknown[] = []) => {
        for (let i = 0; i < queue.length; i++) {
          const r = queue[i]!;
          if (r.match(sql)) {
            const rows = r.rows;
            if (r.once !== false) queue.splice(i, 1);
            return { rows, rowCount: rows.length };
          }
        }
        return { rows: [], rowCount: 0 };
      },
    },
  };
}

function scheduledGameRow(): unknown {
  return {
    id: "g1",
    status: "purchase_open",
    ticket_config_json: {
      ticketTypesData: [
        { color: "yellow", size: "small", pricePerTicket: 2000 },
      ],
    },
    participating_halls_json: ["hall-a"],
    master_hall_id: "hall-a",
  };
}

function insertedRow(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "g1p-inserted",
    scheduled_game_id: "g1",
    buyer_user_id: "p1",
    hall_id: "hall-a",
    ticket_spec_json: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    total_amount_cents: 2000,
    payment_method: "digital_wallet",
    agent_user_id: null,
    idempotency_key: "idem-t3",
    purchased_at: "2026-04-22T12:00:00.000Z",
    refunded_at: null,
    refund_reason: null,
    refunded_by_user_id: null,
    refund_transaction_id: null,
    ...overrides,
  };
}

function makeFakePlatform(walletId: string): PlatformService {
  return {
    async getUserById(userId: string) {
      return {
        id: userId,
        walletId,
        email: `${userId}@test.no`,
        displayName: userId,
      } as unknown as Awaited<ReturnType<PlatformService["getUserById"]>>;
    },
  } as unknown as PlatformService;
}

function makeFakeHallReady(): Game1HallReadyService {
  return {
    async assertPurchaseOpenForHall() {
      /* no-op */
    },
  } as unknown as Game1HallReadyService;
}

function defaultPoolResponses(
  row: unknown = insertedRow()
): StubResponse[] {
  return [
    {
      match: (s) =>
        s.includes("FROM") &&
        s.includes("app_game1_ticket_purchases") &&
        s.includes("idempotency_key"),
      rows: [],
    },
    {
      match: (s) =>
        s.includes("FROM") && s.includes("app_game1_scheduled_games"),
      rows: [scheduledGameRow()],
    },
    {
      match: (s) =>
        s.includes("INSERT INTO") &&
        s.includes("app_game1_ticket_purchases"),
      rows: [row],
    },
  ];
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("PR-T3: digital_wallet purchase → hook kalles én gang med riktig params", async () => {
  const { pool } = createStubPool(defaultPoolResponses());
  const wallet = new InMemoryWalletAdapter();
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 1000 });
  const { port, calls } = makeRecordingHook();
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    potSalesHook: port,
  });

  await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-t3-digital",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.hallId, "hall-a");
  assert.equal(calls[0]!.saleAmountCents, 2000);
});

test("PR-T3: hook kaster → purchase lykkes likevel (soft-fail)", async () => {
  const { pool } = createStubPool(defaultPoolResponses());
  const wallet = new InMemoryWalletAdapter();
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 1000 });
  const { port } = makeRecordingHook({ throwError: true });
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    potSalesHook: port,
  });

  const result = await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-t3-softfail",
  });

  assert.equal(result.purchaseId, "g1p-inserted");
  assert.equal(result.totalAmountCents, 2000);
});

test("PR-T3: cash_agent → hook KALLES (pot bygger på total-salg)", async () => {
  const { pool } = createStubPool(
    defaultPoolResponses(
      insertedRow({
        id: "g1p-cash",
        payment_method: "cash_agent",
        agent_user_id: "agent-1",
      })
    )
  );
  const wallet = new InMemoryWalletAdapter();
  const { port, calls } = makeRecordingHook();
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    potSalesHook: port,
  });

  await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "cash_agent",
    agentUserId: "agent-1",
    idempotencyKey: "idem-t3-cash",
  });

  assert.equal(calls.length, 1, "cash-agent skal også trigge pot-akkumulering");
  assert.equal(calls[0]!.hallId, "hall-a");
  assert.equal(calls[0]!.saleAmountCents, 2000);
});

test("PR-T3: default NoopPotSalesHook → purchase fungerer uten hook", async () => {
  const { pool } = createStubPool(defaultPoolResponses());
  const wallet = new InMemoryWalletAdapter();
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 1000 });
  // Ingen potSalesHook parameter → default no-op
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
  });

  const result = await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-t3-noop",
  });
  assert.equal(result.purchaseId, "g1p-inserted");
});

test("PR-T3: 100%-winnings-kjøp → hook kalles (pot er ikke loss-ledger)", async () => {
  const { pool } = createStubPool(defaultPoolResponses());
  const wallet = new InMemoryWalletAdapter();
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 0 });
  await wallet.credit("wallet-p1", 100, "winnings seed", { to: "winnings" });
  const { port, calls } = makeRecordingHook();
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    potSalesHook: port,
  });

  await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-t3-winnings",
  });

  // Selv om dette er 100%-winnings (som hopper over ComplianceLoss BUYIN),
  // skal pot-hook fortsatt få hele beløpet — pot-akkumulering er ikke
  // loss-ledger; det er intern salg-akkumulering.
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.saleAmountCents, 2000);
});

test("PR-T3: idempotency retry (eksisterende purchase) → hook kalles IKKE", async () => {
  // Første SELECT for idempotency finner allerede-eksisterende purchase.
  const { pool } = createStubPool([
    {
      match: (s) =>
        s.includes("FROM") &&
        s.includes("app_game1_ticket_purchases") &&
        s.includes("idempotency_key"),
      rows: [insertedRow({ id: "g1p-existing" })],
    },
  ]);
  const wallet = new InMemoryWalletAdapter();
  const { port, calls } = makeRecordingHook();
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    potSalesHook: port,
  });

  const result = await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-t3-retry",
  });

  assert.equal(result.alreadyExisted, true);
  assert.equal(calls.length, 0, "hook skal IKKE kalles ved retry");
});

test("PR-T3: hookens hallId matcher purchase-input, ikke scheduled-game-master-hall", async () => {
  // Scheduled-game har master_hall_id = hall-a, men kjøpet er for hall-b.
  const gameWithMultipleHalls = {
    ...(scheduledGameRow() as Record<string, unknown>),
    participating_halls_json: ["hall-a", "hall-b"],
    master_hall_id: "hall-a",
  };
  const { pool } = createStubPool([
    {
      match: (s) =>
        s.includes("FROM") &&
        s.includes("app_game1_ticket_purchases") &&
        s.includes("idempotency_key"),
      rows: [],
    },
    {
      match: (s) =>
        s.includes("FROM") && s.includes("app_game1_scheduled_games"),
      rows: [gameWithMultipleHalls],
    },
    {
      match: (s) =>
        s.includes("INSERT INTO") &&
        s.includes("app_game1_ticket_purchases"),
      rows: [insertedRow({ hall_id: "hall-b", id: "g1p-hall-b" })],
    },
  ]);
  const wallet = new InMemoryWalletAdapter();
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 1000 });
  const { port, calls } = makeRecordingHook();
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    potSalesHook: port,
  });

  await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-b",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-t3-hall-b",
  });

  assert.equal(calls.length, 1);
  // Pot-akkumulering skal gå til hall-b (der kjøpet ble gjort), ikke master-hall.
  assert.equal(calls[0]!.hallId, "hall-b");
});

test("PR-T3: multiple tickets → hook får totalAmount", async () => {
  const { pool } = createStubPool(
    defaultPoolResponses(
      insertedRow({ total_amount_cents: 10_000, id: "g1p-multi" })
    )
  );
  const wallet = new InMemoryWalletAdapter();
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 1000 });
  const { port, calls } = makeRecordingHook();
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    potSalesHook: port,
  });

  await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 5, priceCentsEach: 2000 },
    ],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-t3-multi",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.saleAmountCents, 10_000); // 5 × 2000
});

test("PR-T3: hook + ComplianceLoss port kan sameksistere (begge kalles)", async () => {
  // Parallel kontrakt-test — hook + compliance må begge få sitt kall uten
  // å blokkere hverandre.
  const { pool } = createStubPool(defaultPoolResponses());
  const wallet = new InMemoryWalletAdapter();
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 1000 });
  const { port: potHook, calls: potCalls } = makeRecordingHook();
  const complianceCalls: Array<{ type: string; amount: number }> = [];
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    potSalesHook: potHook,
    complianceLossPort: {
      async recordLossEntry(_walletId, _hallId, entry) {
        complianceCalls.push({ type: entry.type, amount: entry.amount });
      },
    },
  });

  await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-t3-both",
  });

  assert.equal(potCalls.length, 1, "pot-hook skal kalles");
  assert.equal(complianceCalls.length, 1, "compliance-hook skal også kalles");
  assert.equal(complianceCalls[0]!.type, "BUYIN");
});

test("PR-T3: hook-feil påvirker ikke compliance-logging (begge isolerte)", async () => {
  const { pool } = createStubPool(defaultPoolResponses());
  const wallet = new InMemoryWalletAdapter();
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 1000 });
  const { port: potHook } = makeRecordingHook({ throwError: true });
  const complianceCalls: Array<{ type: string; amount: number }> = [];
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    potSalesHook: potHook,
    complianceLossPort: {
      async recordLossEntry(_walletId, _hallId, entry) {
        complianceCalls.push({ type: entry.type, amount: entry.amount });
      },
    },
  });

  const result = await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-t3-pot-fail-compliance-ok",
  });

  assert.equal(result.purchaseId, "g1p-inserted");
  assert.equal(
    complianceCalls.length,
    1,
    "compliance skal være logget selv om pot-hook kastet"
  );
});

test("PR-T3: card_agent → hook også kalles", async () => {
  const { pool } = createStubPool(
    defaultPoolResponses(
      insertedRow({
        id: "g1p-card",
        payment_method: "card_agent",
        agent_user_id: "agent-2",
      })
    )
  );
  const wallet = new InMemoryWalletAdapter();
  const { port, calls } = makeRecordingHook();
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    potSalesHook: port,
  });

  await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "card_agent",
    agentUserId: "agent-2",
    idempotencyKey: "idem-t3-card",
  });
  assert.equal(calls.length, 1);
});
