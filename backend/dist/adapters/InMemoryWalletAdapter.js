import { randomUUID } from "node:crypto";
import { WalletError } from "./WalletAdapter.js";
export class InMemoryWalletAdapter {
    defaultInitialBalance;
    accounts = new Map();
    ledger = [];
    constructor(defaultInitialBalance = 1000) {
        this.defaultInitialBalance = defaultInitialBalance;
    }
    async createAccount(input) {
        const accountId = input?.accountId?.trim() || `wallet-${randomUUID()}`;
        const existing = this.accounts.get(accountId);
        if (existing) {
            if (input?.allowExisting) {
                return existing;
            }
            throw new WalletError("ACCOUNT_EXISTS", `Wallet ${accountId} finnes allerede.`);
        }
        const initialBalance = input?.initialBalance ?? this.defaultInitialBalance;
        this.assertNonNegativeAmount(initialBalance);
        const now = new Date().toISOString();
        const account = {
            id: accountId,
            balance: initialBalance,
            createdAt: now,
            updatedAt: now
        };
        this.accounts.set(accountId, account);
        if (initialBalance > 0) {
            this.recordTx(accountId, "TOPUP", initialBalance, "Initial wallet funding");
        }
        return account;
    }
    async ensureAccount(accountId) {
        const trimmed = this.assertAccountId(accountId);
        const existing = this.accounts.get(trimmed);
        if (existing) {
            return existing;
        }
        return this.createAccount({ accountId: trimmed, allowExisting: true });
    }
    async getAccount(accountId) {
        const account = await this.ensureAccount(accountId);
        return { ...account };
    }
    async listAccounts() {
        return [...this.accounts.values()]
            .map((account) => ({ ...account }))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    async getBalance(accountId) {
        const account = await this.ensureAccount(accountId);
        return account.balance;
    }
    async debit(accountId, amount, reason) {
        this.assertPositiveAmount(amount);
        const account = await this.ensureAccount(accountId);
        if (account.balance < amount) {
            throw new WalletError("INSUFFICIENT_FUNDS", `Wallet ${account.id} mangler saldo.`);
        }
        account.balance -= amount;
        account.updatedAt = new Date().toISOString();
        this.accounts.set(account.id, account);
        return this.recordTx(account.id, "DEBIT", amount, reason || "Debit");
    }
    async credit(accountId, amount, reason) {
        this.assertPositiveAmount(amount);
        const account = await this.ensureAccount(accountId);
        account.balance += amount;
        account.updatedAt = new Date().toISOString();
        this.accounts.set(account.id, account);
        return this.recordTx(account.id, "CREDIT", amount, reason || "Credit");
    }
    async topUp(accountId, amount, reason = "Manual top-up") {
        this.assertPositiveAmount(amount);
        const account = await this.ensureAccount(accountId);
        account.balance += amount;
        account.updatedAt = new Date().toISOString();
        this.accounts.set(account.id, account);
        return this.recordTx(account.id, "TOPUP", amount, reason);
    }
    async withdraw(accountId, amount, reason = "Manual withdrawal") {
        this.assertPositiveAmount(amount);
        const account = await this.ensureAccount(accountId);
        if (account.balance < amount) {
            throw new WalletError("INSUFFICIENT_FUNDS", `Wallet ${account.id} mangler saldo.`);
        }
        account.balance -= amount;
        account.updatedAt = new Date().toISOString();
        this.accounts.set(account.id, account);
        return this.recordTx(account.id, "WITHDRAWAL", amount, reason);
    }
    async transfer(fromAccountId, toAccountId, amount, reason = "Wallet transfer") {
        const fromId = this.assertAccountId(fromAccountId);
        const toId = this.assertAccountId(toAccountId);
        if (fromId === toId) {
            throw new WalletError("INVALID_TRANSFER", "Kan ikke overføre til samme wallet.");
        }
        this.assertPositiveAmount(amount);
        const from = await this.ensureAccount(fromId);
        const to = await this.ensureAccount(toId);
        if (from.balance < amount) {
            throw new WalletError("INSUFFICIENT_FUNDS", `Wallet ${from.id} mangler saldo.`);
        }
        from.balance -= amount;
        from.updatedAt = new Date().toISOString();
        to.balance += amount;
        to.updatedAt = new Date().toISOString();
        this.accounts.set(from.id, from);
        this.accounts.set(to.id, to);
        const fromTx = this.recordTx(from.id, "TRANSFER_OUT", amount, reason, to.id);
        const toTx = this.recordTx(to.id, "TRANSFER_IN", amount, reason, from.id);
        return { fromTx, toTx };
    }
    async listTransactions(accountId, limit = 100) {
        const normalized = this.assertAccountId(accountId);
        await this.ensureAccount(normalized);
        return this.ledger
            .filter((tx) => tx.accountId === normalized)
            .slice(-limit)
            .reverse()
            .map((tx) => ({ ...tx }));
    }
    recordTx(accountId, type, amount, reason, relatedAccountId) {
        const tx = {
            id: randomUUID(),
            accountId,
            type,
            amount,
            reason,
            createdAt: new Date().toISOString(),
            relatedAccountId
        };
        this.ledger.push(tx);
        return { ...tx };
    }
    assertAccountId(accountId) {
        const normalized = accountId.trim();
        if (!normalized) {
            throw new WalletError("INVALID_ACCOUNT_ID", "walletId kan ikke være tom.");
        }
        return normalized;
    }
    assertPositiveAmount(amount) {
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new WalletError("INVALID_AMOUNT", "Beløp må være større enn 0.");
        }
    }
    assertNonNegativeAmount(amount) {
        if (!Number.isFinite(amount) || amount < 0) {
            throw new WalletError("INVALID_AMOUNT", "Beløp må være 0 eller større.");
        }
    }
}
