import { WalletError } from "./WalletAdapter.js";
function toWalletErrorCodeFromStatus(status) {
    if (status === 400) {
        return "INVALID_INPUT";
    }
    if (status === 401 || status === 403) {
        return "UNAUTHORIZED";
    }
    if (status === 404) {
        return "ACCOUNT_NOT_FOUND";
    }
    if (status === 409) {
        return "ACCOUNT_EXISTS";
    }
    if (status === 429) {
        return "RATE_LIMITED";
    }
    if (status >= 500) {
        return "WALLET_API_ERROR";
    }
    return "WALLET_API_REQUEST_FAILED";
}
function asNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function asFiniteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function toWalletAccount(payload) {
    if (!payload || typeof payload !== "object") {
        throw new WalletError("INVALID_WALLET_RESPONSE", "Ugyldig account payload fra wallet-API.");
    }
    const raw = payload;
    const id = asNonEmptyString(raw.id) ?? asNonEmptyString(raw.walletId) ?? asNonEmptyString(raw.accountId);
    const balance = asFiniteNumber(raw.balance);
    const createdAt = asNonEmptyString(raw.createdAt) ?? new Date().toISOString();
    const updatedAt = asNonEmptyString(raw.updatedAt) ?? createdAt;
    if (!id || balance === null) {
        throw new WalletError("INVALID_WALLET_RESPONSE", "Mangler id eller balance i wallet account.");
    }
    return { id, balance, createdAt, updatedAt };
}
function toWalletTransaction(payload) {
    if (!payload || typeof payload !== "object") {
        throw new WalletError("INVALID_WALLET_RESPONSE", "Ugyldig transaction payload fra wallet-API.");
    }
    const raw = payload;
    const id = asNonEmptyString(raw.id);
    const accountId = asNonEmptyString(raw.accountId) ?? asNonEmptyString(raw.walletId) ?? asNonEmptyString(raw.account);
    const type = asNonEmptyString(raw.type);
    const amount = asFiniteNumber(raw.amount);
    const reason = asNonEmptyString(raw.reason) ?? "Wallet transaction";
    const createdAt = asNonEmptyString(raw.createdAt) ?? asNonEmptyString(raw.timestamp) ?? new Date().toISOString();
    const relatedAccountId = asNonEmptyString(raw.relatedAccountId) ??
        asNonEmptyString(raw.relatedWalletId) ??
        asNonEmptyString(raw.counterpartyAccountId);
    if (!id || !accountId || !type || amount === null) {
        throw new WalletError("INVALID_WALLET_RESPONSE", "Mangler felter i wallet transaction.");
    }
    return {
        id,
        accountId,
        type: type,
        amount,
        reason,
        createdAt,
        relatedAccountId: relatedAccountId ?? undefined
    };
}
function toWalletTransferResult(payload) {
    if (!payload || typeof payload !== "object") {
        throw new WalletError("INVALID_WALLET_RESPONSE", "Ugyldig transfer payload fra wallet-API.");
    }
    const raw = payload;
    const fromSource = raw.fromTx ?? raw.debitTx ?? raw.fromTransaction;
    const toSource = raw.toTx ?? raw.creditTx ?? raw.toTransaction;
    if (!fromSource || !toSource) {
        throw new WalletError("INVALID_WALLET_RESPONSE", "Transfer payload mangler from/to transaction.");
    }
    return {
        fromTx: toWalletTransaction(fromSource),
        toTx: toWalletTransaction(toSource)
    };
}
export class HttpWalletAdapter {
    baseUrl;
    apiPrefix;
    apiKey;
    timeoutMs;
    defaultInitialBalance;
    constructor(options) {
        if (!options.baseUrl || !options.baseUrl.trim()) {
            throw new WalletError("INVALID_WALLET_CONFIG", "WALLET_API_BASE_URL mangler.");
        }
        this.baseUrl = options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`;
        this.apiPrefix = options.apiPrefix ?? "/api";
        this.apiKey = options.apiKey;
        this.timeoutMs = options.timeoutMs ?? 8000;
        this.defaultInitialBalance = options.defaultInitialBalance ?? 1000;
    }
    async createAccount(input) {
        const accountId = input?.accountId?.trim();
        const initialBalance = input?.initialBalance ?? this.defaultInitialBalance;
        try {
            const payload = await this.request("POST", "/wallets", {
                walletId: accountId || undefined,
                initialBalance
            });
            return toWalletAccount(payload);
        }
        catch (error) {
            if (error instanceof WalletError && error.code === "ACCOUNT_EXISTS" && input?.allowExisting && accountId) {
                return this.getAccount(accountId);
            }
            throw error;
        }
    }
    async ensureAccount(accountId) {
        const id = accountId.trim();
        if (!id) {
            throw new WalletError("INVALID_ACCOUNT_ID", "walletId kan ikke være tom.");
        }
        try {
            return await this.getAccount(id);
        }
        catch (error) {
            if (error instanceof WalletError && error.code === "ACCOUNT_NOT_FOUND") {
                return this.createAccount({
                    accountId: id,
                    allowExisting: true,
                    initialBalance: this.defaultInitialBalance
                });
            }
            throw error;
        }
    }
    async getAccount(accountId) {
        const id = accountId.trim();
        if (!id) {
            throw new WalletError("INVALID_ACCOUNT_ID", "walletId kan ikke være tom.");
        }
        const payload = await this.request("GET", `/wallets/${encodeURIComponent(id)}`);
        if (payload && typeof payload === "object" && "account" in payload) {
            return toWalletAccount(payload.account);
        }
        return toWalletAccount(payload);
    }
    async listAccounts() {
        const payload = await this.request("GET", "/wallets");
        const values = Array.isArray(payload)
            ? payload
            : payload && typeof payload === "object" && "accounts" in payload
                ? payload.accounts
                : null;
        if (!Array.isArray(values)) {
            throw new WalletError("INVALID_WALLET_RESPONSE", "Wallet list returnerte ugyldig format.");
        }
        return values.map(toWalletAccount);
    }
    async getBalance(accountId) {
        const account = await this.getAccount(accountId);
        return account.balance;
    }
    async debit(accountId, amount, reason) {
        const id = accountId.trim();
        const payload = await this.request("POST", `/wallets/${encodeURIComponent(id)}/debit`, {
            amount,
            reason
        });
        return toWalletTransaction(payload);
    }
    async credit(accountId, amount, reason) {
        const id = accountId.trim();
        const payload = await this.request("POST", `/wallets/${encodeURIComponent(id)}/credit`, {
            amount,
            reason
        });
        return toWalletTransaction(payload);
    }
    async topUp(accountId, amount, reason = "Manual top-up") {
        const id = accountId.trim();
        const payload = await this.request("POST", `/wallets/${encodeURIComponent(id)}/topup`, {
            amount,
            reason
        });
        return toWalletTransaction(payload);
    }
    async withdraw(accountId, amount, reason = "Manual withdrawal") {
        const id = accountId.trim();
        const payload = await this.request("POST", `/wallets/${encodeURIComponent(id)}/withdraw`, {
            amount,
            reason
        });
        return toWalletTransaction(payload);
    }
    async transfer(fromAccountId, toAccountId, amount, reason = "Wallet transfer") {
        const payload = await this.request("POST", "/wallets/transfer", {
            fromWalletId: fromAccountId,
            toWalletId: toAccountId,
            amount,
            reason
        });
        return toWalletTransferResult(payload);
    }
    async listTransactions(accountId, limit = 100) {
        const id = accountId.trim();
        const payload = await this.request("GET", `/wallets/${encodeURIComponent(id)}/transactions?limit=${encodeURIComponent(String(limit))}`);
        const values = Array.isArray(payload)
            ? payload
            : payload && typeof payload === "object" && "transactions" in payload
                ? payload.transactions
                : null;
        if (!Array.isArray(values)) {
            throw new WalletError("INVALID_WALLET_RESPONSE", "Transactions returnerte ugyldig format.");
        }
        return values.map(toWalletTransaction);
    }
    async request(method, path, body) {
        const url = this.makeUrl(path);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const headers = {
                Accept: "application/json"
            };
            if (body !== undefined) {
                headers["Content-Type"] = "application/json";
            }
            if (this.apiKey) {
                headers.Authorization = `Bearer ${this.apiKey}`;
            }
            const response = await fetch(url, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: controller.signal
            });
            const text = await response.text();
            let parsed = undefined;
            if (text) {
                try {
                    parsed = JSON.parse(text);
                }
                catch {
                    parsed = undefined;
                }
            }
            if (!response.ok) {
                const apiMessage = parsed &&
                    typeof parsed === "object" &&
                    "error" in parsed &&
                    typeof parsed.error === "object"
                    ? asNonEmptyString(parsed.error.message)
                    : null;
                const message = apiMessage ?? `Wallet API feilet (${response.status}) ved ${method} ${this.makeRelativePath(path)}.`;
                throw new WalletError(toWalletErrorCodeFromStatus(response.status), message);
            }
            if (parsed && typeof parsed === "object" && "ok" in parsed) {
                const envelope = parsed;
                if (!envelope.ok) {
                    throw new WalletError(envelope.error?.code ?? "WALLET_API_ERROR", envelope.error?.message ?? "Wallet API returnerte ok=false.");
                }
                return envelope.data;
            }
            return parsed;
        }
        catch (error) {
            if (error instanceof WalletError) {
                throw error;
            }
            if (error.name === "AbortError") {
                throw new WalletError("WALLET_API_TIMEOUT", "Timeout ved kall mot wallet-API.");
            }
            throw new WalletError("WALLET_API_UNAVAILABLE", "Kunne ikke kontakte wallet-API.");
        }
        finally {
            clearTimeout(timeout);
        }
    }
    makeUrl(path) {
        const relative = this.makeRelativePath(path);
        return new URL(relative, this.baseUrl).toString();
    }
    makeRelativePath(path) {
        const normalizedPrefix = this.apiPrefix.startsWith("/") ? this.apiPrefix : `/${this.apiPrefix}`;
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        return `${normalizedPrefix}${normalizedPath}`;
    }
}
