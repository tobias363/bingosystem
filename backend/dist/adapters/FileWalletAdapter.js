import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { WalletError } from "./WalletAdapter.js";
export class FileWalletAdapter {
    dataFilePath;
    defaultInitialBalance;
    loaded = false;
    store = {
        accounts: {},
        transactions: []
    };
    mutex = Promise.resolve();
    constructor(options) {
        this.dataFilePath = options.dataFilePath;
        this.defaultInitialBalance = options.defaultInitialBalance ?? 1000;
    }
    async createAccount(input) {
        return this.withLock(async () => {
            await this.load();
            const accountId = input?.accountId?.trim() || `wallet-${randomUUID()}`;
            if (!accountId) {
                throw new WalletError("INVALID_ACCOUNT_ID", "walletId kan ikke være tom.");
            }
            const existing = this.store.accounts[accountId];
            if (existing) {
                if (input?.allowExisting) {
                    return { ...existing };
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
            this.store.accounts[accountId] = account;
            if (initialBalance > 0) {
                this.recordTx(accountId, "TOPUP", initialBalance, "Initial wallet funding");
            }
            await this.persist();
            return { ...account };
        });
    }
    async ensureAccount(accountId) {
        const accountIdTrimmed = accountId.trim();
        if (!accountIdTrimmed) {
            throw new WalletError("INVALID_ACCOUNT_ID", "walletId kan ikke være tom.");
        }
        return this.withLock(async () => {
            await this.load();
            const existing = this.store.accounts[accountIdTrimmed];
            if (existing) {
                return { ...existing };
            }
            const now = new Date().toISOString();
            const account = {
                id: accountIdTrimmed,
                balance: this.defaultInitialBalance,
                createdAt: now,
                updatedAt: now
            };
            this.store.accounts[accountIdTrimmed] = account;
            if (this.defaultInitialBalance > 0) {
                this.recordTx(accountIdTrimmed, "TOPUP", this.defaultInitialBalance, "Initial wallet funding");
            }
            await this.persist();
            return { ...account };
        });
    }
    async getAccount(accountId) {
        return this.withLock(async () => {
            await this.load();
            const normalized = this.assertAccountId(accountId);
            const account = this.store.accounts[normalized];
            if (!account) {
                throw new WalletError("ACCOUNT_NOT_FOUND", `Wallet ${normalized} finnes ikke.`);
            }
            return { ...account };
        });
    }
    async listAccounts() {
        return this.withLock(async () => {
            await this.load();
            return Object.values(this.store.accounts)
                .map((account) => ({ ...account }))
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
    }
    async getBalance(accountId) {
        const account = await this.ensureAccount(accountId);
        return account.balance;
    }
    async debit(accountId, amount, reason) {
        return this.withLock(async () => {
            await this.load();
            const normalized = this.assertAccountId(accountId);
            this.assertPositiveAmount(amount);
            const account = this.store.accounts[normalized];
            if (!account) {
                throw new WalletError("ACCOUNT_NOT_FOUND", `Wallet ${normalized} finnes ikke.`);
            }
            if (account.balance < amount) {
                throw new WalletError("INSUFFICIENT_FUNDS", `Wallet ${account.id} mangler saldo.`);
            }
            account.balance -= amount;
            account.updatedAt = new Date().toISOString();
            const tx = this.recordTx(account.id, "DEBIT", amount, reason || "Debit");
            await this.persist();
            return tx;
        });
    }
    async credit(accountId, amount, reason) {
        return this.withLock(async () => {
            await this.load();
            const normalized = this.assertAccountId(accountId);
            this.assertPositiveAmount(amount);
            const account = this.store.accounts[normalized];
            if (!account) {
                throw new WalletError("ACCOUNT_NOT_FOUND", `Wallet ${normalized} finnes ikke.`);
            }
            account.balance += amount;
            account.updatedAt = new Date().toISOString();
            const tx = this.recordTx(account.id, "CREDIT", amount, reason || "Credit");
            await this.persist();
            return tx;
        });
    }
    async topUp(accountId, amount, reason = "Manual top-up") {
        return this.withLock(async () => {
            await this.load();
            const normalized = this.assertAccountId(accountId);
            this.assertPositiveAmount(amount);
            const account = this.store.accounts[normalized];
            if (!account) {
                throw new WalletError("ACCOUNT_NOT_FOUND", `Wallet ${normalized} finnes ikke.`);
            }
            account.balance += amount;
            account.updatedAt = new Date().toISOString();
            const tx = this.recordTx(account.id, "TOPUP", amount, reason);
            await this.persist();
            return tx;
        });
    }
    async withdraw(accountId, amount, reason = "Manual withdrawal") {
        return this.withLock(async () => {
            await this.load();
            const normalized = this.assertAccountId(accountId);
            this.assertPositiveAmount(amount);
            const account = this.store.accounts[normalized];
            if (!account) {
                throw new WalletError("ACCOUNT_NOT_FOUND", `Wallet ${normalized} finnes ikke.`);
            }
            if (account.balance < amount) {
                throw new WalletError("INSUFFICIENT_FUNDS", `Wallet ${account.id} mangler saldo.`);
            }
            account.balance -= amount;
            account.updatedAt = new Date().toISOString();
            const tx = this.recordTx(account.id, "WITHDRAWAL", amount, reason);
            await this.persist();
            return tx;
        });
    }
    async transfer(fromAccountId, toAccountId, amount, reason = "Wallet transfer") {
        return this.withLock(async () => {
            await this.load();
            const fromId = this.assertAccountId(fromAccountId);
            const toId = this.assertAccountId(toAccountId);
            if (fromId === toId) {
                throw new WalletError("INVALID_TRANSFER", "Kan ikke overføre til samme wallet.");
            }
            this.assertPositiveAmount(amount);
            const from = this.store.accounts[fromId];
            const to = this.store.accounts[toId];
            if (!from) {
                throw new WalletError("ACCOUNT_NOT_FOUND", `Wallet ${fromId} finnes ikke.`);
            }
            if (!to) {
                throw new WalletError("ACCOUNT_NOT_FOUND", `Wallet ${toId} finnes ikke.`);
            }
            if (from.balance < amount) {
                throw new WalletError("INSUFFICIENT_FUNDS", `Wallet ${from.id} mangler saldo.`);
            }
            from.balance -= amount;
            from.updatedAt = new Date().toISOString();
            to.balance += amount;
            to.updatedAt = new Date().toISOString();
            const fromTx = this.recordTx(from.id, "TRANSFER_OUT", amount, reason, to.id);
            const toTx = this.recordTx(to.id, "TRANSFER_IN", amount, reason, from.id);
            await this.persist();
            return { fromTx, toTx };
        });
    }
    async listTransactions(accountId, limit = 100) {
        return this.withLock(async () => {
            await this.load();
            const normalized = this.assertAccountId(accountId);
            if (!this.store.accounts[normalized]) {
                throw new WalletError("ACCOUNT_NOT_FOUND", `Wallet ${normalized} finnes ikke.`);
            }
            return this.store.transactions
                .filter((tx) => tx.accountId === normalized)
                .slice(-limit)
                .reverse()
                .map((tx) => ({ ...tx }));
        });
    }
    async withLock(work) {
        const run = this.mutex.then(work, work);
        this.mutex = run.then(() => undefined, () => undefined);
        return run;
    }
    async load() {
        if (this.loaded) {
            return;
        }
        try {
            const raw = await readFile(this.dataFilePath, "utf8");
            const parsed = JSON.parse(raw);
            this.store = {
                accounts: parsed.accounts ?? {},
                transactions: parsed.transactions ?? []
            };
        }
        catch (error) {
            if (error.code === "ENOENT") {
                await this.persist();
            }
            else {
                throw error;
            }
        }
        this.loaded = true;
    }
    async persist() {
        await mkdir(path.dirname(this.dataFilePath), { recursive: true });
        await writeFile(this.dataFilePath, JSON.stringify(this.store, null, 2), "utf8");
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
        this.store.transactions.push(tx);
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
