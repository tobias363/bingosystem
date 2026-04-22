/**
 * PR-W5 wallet-split: BUYIN-logging-tester for Game1TicketPurchaseService.
 *
 * Verifiserer at `purchase()` kaller `complianceLossPort.recordLossEntry`
 * med kun deposit-delen av wallet-debit (ikke winnings-delen). Teste-matrise:
 *
 *   1) Default path: deposit-only debit → BUYIN amount = full trekk.
 *   2) Blandet deposit + winnings → BUYIN amount = kun deposit-delen.
 *   3) 100% winnings-kjøp → ingen BUYIN-entry logget (amount = 0).
 *   4) Compliance-port kaster → purchase feiler IKKE (soft-fail + warning).
 *   5) Konstruktør uten complianceLossPort → default NoopComplianceLossPort
 *      (ingen kall, ingen feil — bakoverkompat).
 *   6) cash_agent / card_agent → ingen wallet-flyt → ingen BUYIN-entry.
 *
 * Se docs/architecture/WALLET_SPLIT_DESIGN_2026-04-22.md §3.4.
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
import type {
  ComplianceLossEntry,
  ComplianceLossPort,
} from "../adapters/ComplianceLossPort.js";

// ── Recording port (mock som samler opp alle kall) ───────────────────────────

interface RecordedLossCall {
  walletId: string;
  hallId: string;
  entry: ComplianceLossEntry;
}

function makeRecordingPort(opts?: { throwOn?: "BUYIN" | "PAYOUT" }): {
  port: ComplianceLossPort;
  calls: RecordedLossCall[];
} {
  const calls: RecordedLossCall[] = [];
  const port: ComplianceLossPort = {
    async recordLossEntry(walletId, hallId, entry) {
      if (opts?.throwOn && entry.type === opts.throwOn) {
        throw new Error(`simulated compliance failure for ${entry.type}`);
      }
      calls.push({ walletId, hallId, entry });
    },
  };
  return { port, calls };
}

// ── Stub-pool + fixtures ─────────────────────────────────────────────────────

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

function insertedRow(): unknown {
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
    idempotency_key: "idem-buyin",
    purchased_at: "2026-04-22T12:00:00.000Z",
    refunded_at: null,
    refund_reason: null,
    refunded_by_user_id: null,
    refund_transaction_id: null,
  };
}

function cashInsertedRow(): unknown {
  return {
    ...(insertedRow() as Record<string, unknown>),
    id: "g1p-cash",
    payment_method: "cash_agent",
    agent_user_id: "agent-1",
    idempotency_key: "idem-cash",
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

test("PR-W5: deposit-only debit → BUYIN logget med full beløp", async () => {
  const { pool } = createStubPool(defaultPoolResponses());
  const wallet = new InMemoryWalletAdapter();
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 1000 });
  const { port, calls } = makeRecordingPort();
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    complianceLossPort: port,
  });

  await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-buyin",
  });

  // 2000 øre = 20 NOK, alt fra deposit
  assert.equal(calls.length, 1, "én BUYIN-entry logget");
  assert.equal(calls[0]!.walletId, "wallet-p1");
  assert.equal(calls[0]!.hallId, "hall-a");
  assert.equal(calls[0]!.entry.type, "BUYIN");
  assert.equal(calls[0]!.entry.amount, 20);
  assert.ok(calls[0]!.entry.createdAtMs > 0);
});

test("PR-W5: blandet deposit + winnings → BUYIN teller kun deposit-delen", async () => {
  const { pool } = createStubPool(defaultPoolResponses());
  const wallet = new InMemoryWalletAdapter();
  // Lag wallet med 5 NOK deposit + 15 NOK winnings via direkte credit
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 5 });
  await wallet.credit("wallet-p1", 15, "test winnings seed", {
    to: "winnings",
  });
  const { port, calls } = makeRecordingPort();
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    complianceLossPort: port,
  });

  await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-mixed",
  });

  // Totalt 20 NOK debit, winnings-first tar 15 NOK → kun 5 NOK fra deposit.
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.entry.type, "BUYIN");
  assert.equal(calls[0]!.entry.amount, 5, "kun 5 kr deposit teller mot loss-limit");
});

test("PR-W5: 100% winnings-kjøp → ingen BUYIN-entry (amount=0, skip)", async () => {
  const { pool } = createStubPool(defaultPoolResponses());
  const wallet = new InMemoryWalletAdapter();
  // Wallet med 0 deposit + 100 NOK winnings.
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 0 });
  await wallet.credit("wallet-p1", 100, "big win", { to: "winnings" });
  const { port, calls } = makeRecordingPort();
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    complianceLossPort: port,
  });

  await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-all-win",
  });

  // 20 NOK debit helt fra winnings → 0 NOK deposit-del → ingen BUYIN logget.
  assert.equal(calls.length, 0, "skal ikke logge BUYIN når amount=0");
});

test("PR-W5: compliance-port kaster → purchase feiler IKKE (soft-fail)", async () => {
  const { pool } = createStubPool(defaultPoolResponses());
  const wallet = new InMemoryWalletAdapter();
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 1000 });
  const { port } = makeRecordingPort({ throwOn: "BUYIN" });
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    complianceLossPort: port,
  });

  const result = await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-soft-fail",
  });

  // Purchase må fullføres selv om compliance kaster (matcher BingoEngine.buyIn).
  assert.equal(result.alreadyExisted, false);
  assert.equal(result.totalAmountCents, 2000);
  // Wallet-debit skal være committed (ingen rollback).
  const balance = await wallet.getBalance("wallet-p1");
  assert.equal(balance, 980);
});

test("PR-W5: konstruktør uten complianceLossPort → default Noop (ingen feil)", async () => {
  const { pool } = createStubPool(defaultPoolResponses());
  const wallet = new InMemoryWalletAdapter();
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 1000 });
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    // complianceLossPort utelatt — skal falle tilbake til NoopComplianceLossPort.
  });

  const result = await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-noop",
  });

  assert.equal(result.alreadyExisted, false);
});

test("PR-W5: cash_agent → ingen wallet-debit, ingen BUYIN-entry", async () => {
  const { pool } = createStubPool(defaultPoolResponses(cashInsertedRow()));
  const wallet = new InMemoryWalletAdapter();
  const { port, calls } = makeRecordingPort();
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    complianceLossPort: port,
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
    idempotencyKey: "idem-cash",
  });

  // Cash_agent har ingen wallet-flyt → ingen compliance-entry heller (kontanttap
  // logges ikke mot Spillvett — kun digital_wallet-kjøp teller).
  assert.equal(calls.length, 0, "cash_agent skal ikke trigge BUYIN-entry");
});

test("PR-W5: card_agent → ingen wallet-debit, ingen BUYIN-entry", async () => {
  const cardRow = {
    ...(cashInsertedRow() as Record<string, unknown>),
    payment_method: "card_agent",
    idempotency_key: "idem-card",
  };
  const { pool } = createStubPool(defaultPoolResponses(cardRow));
  const wallet = new InMemoryWalletAdapter();
  const { port, calls } = makeRecordingPort();
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    complianceLossPort: port,
  });

  await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [
      { color: "yellow", size: "small", count: 1, priceCentsEach: 2000 },
    ],
    paymentMethod: "card_agent",
    agentUserId: "agent-1",
    idempotencyKey: "idem-card",
  });

  assert.equal(calls.length, 0);
});

test("PR-W5: multiple purchases akkumulerer BUYIN-entries (audit-spor)", async () => {
  const { pool } = createStubPool([
    // Første purchase: find-idempotency (tom) → loadGame → INSERT.
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
      rows: [insertedRow()],
    },
    // Andre purchase: samme pattern med ny idempotency-key.
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
      rows: [{ ...(insertedRow() as Record<string, unknown>), id: "g1p-2", idempotency_key: "idem-2" }],
    },
  ]);
  const wallet = new InMemoryWalletAdapter();
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 1000 });
  const { port, calls } = makeRecordingPort();
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    complianceLossPort: port,
  });

  await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [{ color: "yellow", size: "small", count: 1, priceCentsEach: 2000 }],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-1",
  });
  await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [{ color: "yellow", size: "small", count: 1, priceCentsEach: 2000 }],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-2",
  });

  assert.equal(calls.length, 2, "to BUYIN-entries logget");
  assert.equal(calls[0]!.entry.amount, 20);
  assert.equal(calls[1]!.entry.amount, 20);
});

test("PR-W5: idempotency-hit → ingen BUYIN-entry (allerede handlet første gang)", async () => {
  const { pool } = createStubPool([
    // Første og eneste kall: findByIdempotencyKey returnerer eksisterende rad.
    {
      match: (s) =>
        s.includes("FROM") &&
        s.includes("app_game1_ticket_purchases") &&
        s.includes("idempotency_key"),
      rows: [insertedRow()],
    },
  ]);
  const wallet = new InMemoryWalletAdapter();
  await wallet.createAccount({ accountId: "wallet-p1", initialBalance: 1000 });
  const { port, calls } = makeRecordingPort();
  const service = new Game1TicketPurchaseService({
    pool: pool as never,
    walletAdapter: wallet,
    platformService: makeFakePlatform("wallet-p1"),
    hallReadyService: makeFakeHallReady(),
    auditLogService: new AuditLogService(new InMemoryAuditLogStore()),
    complianceLossPort: port,
  });

  const result = await service.purchase({
    scheduledGameId: "g1",
    buyerUserId: "p1",
    hallId: "hall-a",
    ticketSpec: [{ color: "yellow", size: "small", count: 1, priceCentsEach: 2000 }],
    paymentMethod: "digital_wallet",
    idempotencyKey: "idem-dupe",
  });

  // Idempotent retry returnerer eksisterende rad uten ny wallet-flyt.
  assert.equal(result.alreadyExisted, true);
  // Derfor skal heller ikke en ny BUYIN-entry logges — loss-telling må
  // ikke dobles for retries.
  assert.equal(calls.length, 0, "idempotent retry skal ikke logge ny BUYIN");
});
