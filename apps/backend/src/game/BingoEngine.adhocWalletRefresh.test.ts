// W1-hotfix backport (Tobias 2026-04-26 — PR #553 til ad-hoc-engine):
// Verifiserer at BingoEngine.submitClaim + BingoEngineMiniGames.playMiniGame
// kaller `walletAdapter.getAvailableBalance` (eller getBalance som fallback)
// etter prize-payout, slik at in-memory `Player.balance` matcher DB-verdi
// for room:update-broadcast.
//
// Pre-fix: optimistisk `player.balance += payout` tapte deposit/winnings-
// split-informasjonen. Post-fix: refresh fra walletAdapter speiler det
// adapteren faktisk persisterte (samme path som getAvailableBalance).
//
// Tilnærming: spy-adapter fanger `getAvailableBalance`-kall og kontrollerer
// returverdiene. Vi sjekker at refresh-en kalles AFTER prize-transfer.

import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { BingoEngine } from "./BingoEngine.js";
import type { BingoSystemAdapter, CreateTicketInput } from "../adapters/BingoSystemAdapter.js";
import type {
  CreateWalletAccountInput,
  TransferOptions,
  WalletAccount,
  WalletAdapter,
  WalletTransaction,
  WalletTransferResult,
} from "../adapters/WalletAdapter.js";
import { WalletError } from "../adapters/WalletAdapter.js";
import type { Ticket } from "./types.js";

interface CapturedCall {
  kind: "transfer" | "getAvailableBalance" | "getBalance";
  walletId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  amount?: number;
  options?: TransferOptions;
  reason?: string;
}

class RefreshSpyWalletAdapter implements WalletAdapter {
  private readonly accounts = new Map<string, WalletAccount>();
  private readonly transactions: WalletTransaction[] = [];
  private txCounter = 0;

  /** Ordered log of all transfer + balance-fetch calls. */
  public readonly calls: CapturedCall[] = [];

  async createAccount(input?: CreateWalletAccountInput): Promise<WalletAccount> {
    const accountId = input?.accountId?.trim() || `wallet-${randomUUID()}`;
    const initialBalance = Number(input?.initialBalance ?? 0);
    if (this.accounts.has(accountId)) {
      if (input?.allowExisting) return { ...this.accounts.get(accountId)! };
      throw new WalletError("ACCOUNT_EXISTS", "Account exists");
    }
    const now = new Date().toISOString();
    const account: WalletAccount = {
      id: accountId,
      balance: initialBalance,
      depositBalance: initialBalance,
      winningsBalance: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(accountId, account);
    return { ...account };
  }

  async ensureAccount(accountId: string): Promise<WalletAccount> {
    const id = accountId.trim();
    if (!this.accounts.has(id)) {
      await this.createAccount({ accountId: id, initialBalance: 1000, allowExisting: true });
    }
    return { ...this.accounts.get(id)! };
  }

  async getAccount(accountId: string): Promise<WalletAccount> {
    const id = accountId.trim();
    const a = this.accounts.get(id);
    if (!a) throw new WalletError("ACCOUNT_NOT_FOUND", "Not found");
    return { ...a };
  }

  async listAccounts(): Promise<WalletAccount[]> {
    return [...this.accounts.values()].map((a) => ({ ...a }));
  }

  async getBalance(accountId: string): Promise<number> {
    this.calls.push({ kind: "getBalance", walletId: accountId.trim() });
    return (await this.getAccount(accountId)).balance;
  }

  async getAvailableBalance(accountId: string): Promise<number> {
    this.calls.push({ kind: "getAvailableBalance", walletId: accountId.trim() });
    return (await this.getAccount(accountId)).balance;
  }

  async getDepositBalance(accountId: string): Promise<number> {
    return (await this.getAccount(accountId)).depositBalance;
  }

  async getWinningsBalance(accountId: string): Promise<number> {
    return (await this.getAccount(accountId)).winningsBalance;
  }

  async getBothBalances(
    accountId: string,
  ): Promise<{ deposit: number; winnings: number; total: number }> {
    const a = await this.getAccount(accountId);
    return { deposit: a.depositBalance, winnings: a.winningsBalance, total: a.balance };
  }

  async debit(accountId: string, amount: number, reason: string): Promise<WalletTransaction> {
    return this.adjust(accountId, -Math.abs(amount), "DEBIT", reason);
  }

  async credit(accountId: string, amount: number, reason: string): Promise<WalletTransaction> {
    return this.adjust(accountId, Math.abs(amount), "CREDIT", reason);
  }

  async topUp(accountId: string, amount: number, reason = "Top-up"): Promise<WalletTransaction> {
    return this.adjust(accountId, Math.abs(amount), "TOPUP", reason);
  }

  async withdraw(accountId: string, amount: number, reason = "Withdraw"): Promise<WalletTransaction> {
    return this.adjust(accountId, -Math.abs(amount), "WITHDRAWAL", reason);
  }

  async transfer(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    reason = "Transfer",
    options?: TransferOptions,
  ): Promise<WalletTransferResult> {
    this.calls.push({ kind: "transfer", fromAccountId, toAccountId, amount, reason, options });
    const amt = Math.abs(amount);
    const fromTx = await this.adjust(fromAccountId, -amt, "TRANSFER_OUT", reason, toAccountId);
    const toTx = await this.adjust(toAccountId, amt, "TRANSFER_IN", reason, fromAccountId);
    return { fromTx, toTx };
  }

  async listTransactions(accountId: string): Promise<WalletTransaction[]> {
    return this.transactions
      .filter((tx) => tx.accountId === accountId.trim())
      .map((tx) => ({ ...tx }));
  }

  private async adjust(
    accountId: string,
    delta: number,
    type: WalletTransaction["type"],
    reason: string,
    relatedAccountId?: string,
  ): Promise<WalletTransaction> {
    const id = accountId.trim();
    const account = await this.ensureAccount(id);
    const next = account.balance + delta;
    if (next < 0) throw new WalletError("INSUFFICIENT_FUNDS", "No funds");
    this.accounts.set(id, {
      ...account,
      balance: next,
      depositBalance: next,
      winningsBalance: 0,
      updatedAt: new Date().toISOString(),
    });
    const tx: WalletTransaction = {
      id: `tx-${++this.txCounter}`,
      accountId: id,
      type,
      amount: Math.abs(delta),
      reason,
      createdAt: new Date().toISOString(),
      relatedAccountId,
    };
    this.transactions.push(tx);
    return { ...tx };
  }
}

class FixedTicketAdapter implements BingoSystemAdapter {
  async createTicket(_input: CreateTicketInput): Promise<Ticket> {
    return {
      grid: [
        [1, 2, 3, 4, 5],
        [13, 14, 15, 16, 17],
        [25, 26, 0, 27, 28],
        [37, 38, 39, 40, 41],
        [49, 50, 51, 52, 53],
      ],
    };
  }
}

function prioritizeDrawNumbers(
  engine: BingoEngine,
  roomCode: string,
  preferred: readonly number[],
): void {
  const internal = (
    engine as unknown as { rooms: Map<string, { currentGame?: { drawBag: number[] } }> }
  ).rooms.get(roomCode);
  const drawBag = internal?.currentGame?.drawBag;
  if (!drawBag) return;
  const hit = preferred.filter((v) => drawBag.includes(v));
  if (hit.length === 0) return;
  const rest = drawBag.filter((v) => !hit.includes(v));
  internal!.currentGame!.drawBag = [...hit, ...rest];
}

// ── Tester ──────────────────────────────────────────────────────────────────

test("W1-hotfix adhoc: LINE-payout trigger refreshPlayerBalancesForWallet for vinneren", async () => {
  const spy = new RefreshSpyWalletAdapter();
  const engine = new BingoEngine(new FixedTicketAdapter(), spy, {
    maxDrawsPerRound: 60,
    minDrawIntervalMs: 0,
  });

  const { roomCode, playerId: hostId } = await engine.createRoom({
    hallId: "hall-1",
    playerName: "Host",
    walletId: "wallet-host",
  });
  await engine.joinRoom({
    roomCode,
    hallId: "hall-1",
    playerName: "Guest",
    walletId: "wallet-guest",
  });
  await engine.startGame({
    roomCode,
    actorPlayerId: hostId,
    entryFee: 100,
    ticketsPerPlayer: 1,
    payoutPercent: 80,
    patterns: [
      { id: "1-rad", name: "1 Rad", claimType: "LINE" as const, prizePercent: 30, order: 1, design: 1 },
      { id: "full-plate", name: "Full Plate", claimType: "BINGO" as const, prizePercent: 70, order: 2, design: 2 },
    ],
  });

  // Marker en hel rad
  const lineNumbers = new Set([1, 2, 3, 4, 5]);
  prioritizeDrawNumbers(engine, roomCode, [...lineNumbers]);
  let guard = 0;
  while (lineNumbers.size > 0 && guard < 60) {
    const { number } = await engine.drawNextNumber({ roomCode, actorPlayerId: hostId });
    if (lineNumbers.has(number)) {
      await engine.markNumber({ roomCode, playerId: hostId, number });
      lineNumbers.delete(number);
    }
    guard += 1;
  }
  assert.equal(lineNumbers.size, 0);

  // Tøm spy-loggen så vi kun ser submitClaim-calls
  spy.calls.length = 0;

  const lineClaim = await engine.submitClaim({
    roomCode,
    playerId: hostId,
    type: "LINE",
  });
  assert.equal(lineClaim.valid, true);
  assert.ok((lineClaim.payoutAmount ?? 0) > 0);

  // Forventet rekkefølge: transfer (Line prize) → getAvailableBalance (refresh)
  const linePrizeTransferIdx = spy.calls.findIndex(
    (c) => c.kind === "transfer" && c.reason?.includes("Line prize"),
  );
  assert.ok(linePrizeTransferIdx >= 0, "Line prize-transfer skal være kalt");

  const refreshAfterPayout = spy.calls
    .slice(linePrizeTransferIdx + 1)
    .find((c) => c.kind === "getAvailableBalance" && c.walletId === "wallet-host");
  assert.ok(
    refreshAfterPayout,
    "refreshPlayerBalancesForWallet skal kalle getAvailableBalance for vinneren ETTER prize-transfer",
  );
});

test("W1-hotfix adhoc: BINGO-payout trigger refreshPlayerBalancesForWallet for vinneren", async () => {
  const spy = new RefreshSpyWalletAdapter();
  const engine = new BingoEngine(new FixedTicketAdapter(), spy, {
    maxDrawsPerRound: 60,
    minDrawIntervalMs: 0,
  });

  const { roomCode, playerId: hostId } = await engine.createRoom({
    hallId: "hall-1",
    playerName: "Host",
    walletId: "wallet-host",
  });
  await engine.joinRoom({
    roomCode,
    hallId: "hall-1",
    playerName: "Guest",
    walletId: "wallet-guest",
  });
  await engine.startGame({
    roomCode,
    actorPlayerId: hostId,
    entryFee: 100,
    ticketsPerPlayer: 1,
    payoutPercent: 80,
    patterns: [
      { id: "1-rad", name: "1 Rad", claimType: "LINE" as const, prizePercent: 30, order: 1, design: 1 },
      { id: "full-plate", name: "Full Plate", claimType: "BINGO" as const, prizePercent: 70, order: 2, design: 2 },
    ],
  });

  const bingoNumbers = new Set([
    1, 2, 3, 4, 5, 13, 14, 15, 16, 17, 25, 26, 27, 28, 37, 38, 39, 40, 41, 49, 50, 51, 52, 53,
  ]);
  prioritizeDrawNumbers(engine, roomCode, [...bingoNumbers]);

  let guard = 0;
  const lineSet = new Set([1, 2, 3, 4, 5]);
  while (lineSet.size > 0 && guard < 60) {
    const { number } = await engine.drawNextNumber({ roomCode, actorPlayerId: hostId });
    if (bingoNumbers.has(number)) {
      await engine.markNumber({ roomCode, playerId: hostId, number });
      bingoNumbers.delete(number);
      lineSet.delete(number);
    }
    guard += 1;
  }
  await engine.submitClaim({ roomCode, playerId: hostId, type: "LINE" });

  while (bingoNumbers.size > 0 && guard < 150) {
    const { number } = await engine.drawNextNumber({ roomCode, actorPlayerId: hostId });
    if (bingoNumbers.has(number)) {
      await engine.markNumber({ roomCode, playerId: hostId, number });
      bingoNumbers.delete(number);
    }
    guard += 1;
  }

  spy.calls.length = 0;
  const bingoClaim = await engine.submitClaim({
    roomCode,
    playerId: hostId,
    type: "BINGO",
  });
  assert.equal(bingoClaim.valid, true);

  const bingoTransferIdx = spy.calls.findIndex(
    (c) => c.kind === "transfer" && c.reason?.includes("Bingo prize"),
  );
  assert.ok(bingoTransferIdx >= 0, "Bingo prize-transfer skal være kalt");

  const refreshAfter = spy.calls
    .slice(bingoTransferIdx + 1)
    .find((c) => c.kind === "getAvailableBalance" && c.walletId === "wallet-host");
  assert.ok(
    refreshAfter,
    "refreshPlayerBalancesForWallet skal kalle getAvailableBalance for vinneren ETTER BINGO-prize-transfer",
  );
});
