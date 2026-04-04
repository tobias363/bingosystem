import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { DomainError } from "../game/BingoEngine.js";
function asObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value;
}
function asString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function asNumber(value) {
    if (typeof value !== "number") {
        return undefined;
    }
    if (!Number.isFinite(value)) {
        return undefined;
    }
    return value;
}
function extractProblemsSummary(root) {
    if (!root) {
        return undefined;
    }
    const rawProblems = root.problems;
    if (!Array.isArray(rawProblems) || rawProblems.length === 0) {
        return undefined;
    }
    const summaries = rawProblems
        .map((problem) => {
        const parsed = asObject(problem);
        if (!parsed) {
            return undefined;
        }
        const name = asString(parsed.name);
        const description = asString(parsed.description);
        if (name && description) {
            return `${name}: ${description}`;
        }
        return name || description || undefined;
    })
        .filter((entry) => Boolean(entry));
    if (!summaries.length) {
        return undefined;
    }
    return summaries.slice(0, 3).join(" | ");
}
function asDateIso(value) {
    if (!value) {
        return undefined;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return undefined;
    }
    return date.toISOString();
}
function isHttpUrl(value) {
    return /^https?:\/\//i.test(value);
}
function assertSchemaName(schema) {
    const trimmed = schema.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
        throw new DomainError("INVALID_CONFIG", "SWEDBANK_PAY schema er ugyldig.");
    }
    return trimmed;
}
function normalizeBaseUrl(value, fieldName) {
    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }
    if (!isHttpUrl(trimmed)) {
        throw new DomainError("INVALID_CONFIG", `${fieldName} må være en full http/https URL.`);
    }
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}
function toMinorUnits(amountMajor) {
    if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
        throw new DomainError("INVALID_INPUT", "amount må være større enn 0.");
    }
    const minor = Math.round(amountMajor * 100);
    if (!Number.isFinite(minor) || minor <= 0) {
        throw new DomainError("INVALID_INPUT", "amount er ugyldig.");
    }
    return minor;
}
function fromMinorUnits(amountMinor) {
    return amountMinor / 100;
}
function randomReference(prefix, length) {
    const base = `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e9)
        .toString(36)
        .toUpperCase()}`;
    return base
        .replace(/[^A-Za-z0-9-]/g, "")
        .toUpperCase()
        .slice(0, length);
}
function normalizePaymentOrderId(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new DomainError("SWEDBANK_INVALID_RESPONSE", "Mangler payment order id fra Swedbank.");
    }
    if (isHttpUrl(trimmed)) {
        const url = new URL(trimmed);
        return `${url.pathname}${url.search}`;
    }
    if (!trimmed.startsWith("/")) {
        return `/${trimmed}`;
    }
    return trimmed;
}
function normalizeSwedbankStatus(value) {
    if (!value) {
        return "UNKNOWN";
    }
    return value.trim().toUpperCase();
}
function isPaidStatus(value) {
    const status = normalizeSwedbankStatus(value);
    return status === "PAID" || status === "FULLYPAID";
}
export class SwedbankPayService {
    walletAdapter;
    pool;
    schema;
    apiBaseUrl;
    accessToken;
    payeeId;
    payeeName;
    productName;
    currency;
    language;
    merchantBaseUrl;
    callbackUrl;
    completeUrl;
    cancelUrl;
    termsOfServiceUrl;
    requestTimeoutMs;
    initPromise = null;
    constructor(walletAdapter, options) {
        this.walletAdapter = walletAdapter;
        if (!options.connectionString.trim()) {
            throw new DomainError("INVALID_CONFIG", "Mangler APP_PG_CONNECTION_STRING for SwedbankPayService.");
        }
        this.schema = assertSchemaName(options.schema || "public");
        this.apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl || "https://api.externalintegration.payex.com", "SWEDBANK_PAY_API_BASE_URL");
        this.accessToken = (options.accessToken || "").trim();
        this.payeeId = (options.payeeId || "").trim();
        this.payeeName = (options.payeeName || "Bingo").trim();
        this.productName = (options.productName || "Checkout3").trim();
        this.currency = (options.currency || "NOK").trim().toUpperCase();
        this.language = (options.language || "nb-NO").trim();
        this.merchantBaseUrl = normalizeBaseUrl(options.merchantBaseUrl || "", "SWEDBANK_PAY_MERCHANT_BASE_URL");
        this.callbackUrl = (options.callbackUrl || "").trim();
        this.completeUrl = (options.completeUrl || "").trim();
        this.cancelUrl = (options.cancelUrl || "").trim();
        this.termsOfServiceUrl = (options.termsOfServiceUrl || "").trim();
        this.requestTimeoutMs = Math.max(1000, Math.floor(options.requestTimeoutMs ?? 10000));
        this.pool = new Pool({
            connectionString: options.connectionString
        });
    }
    isConfigured() {
        const hasUrls = (this.callbackUrl.length > 0 && this.completeUrl.length > 0 && this.cancelUrl.length > 0) ||
            this.merchantBaseUrl.length > 0;
        return this.accessToken.length > 0 && this.payeeId.length > 0 && hasUrls;
    }
    async createTopupIntent(input) {
        await this.ensureInitialized();
        this.assertConfigured();
        const userId = input.userId.trim();
        const walletId = input.walletId.trim();
        if (!userId || !walletId) {
            throw new DomainError("INVALID_INPUT", "Mangler userId eller walletId for top-up intent.");
        }
        const amountMinor = toMinorUnits(input.amountMajor);
        const amountMajor = fromMinorUnits(amountMinor);
        const intentId = randomUUID();
        const orderReference = randomReference("TOPUP", 40);
        const payeeReference = randomReference("TP", 30);
        const completeUrl = this.withQuery(this.resolveCompleteUrl(), {
            swedbank_intent: intentId,
            swedbank_result: "complete"
        });
        const cancelUrl = this.withQuery(this.resolveCancelUrl(), {
            swedbank_intent: intentId,
            swedbank_result: "cancel"
        });
        const callbackUrl = this.resolveCallbackUrl();
        const hostUrls = this.resolveHostUrls(completeUrl, cancelUrl, callbackUrl);
        const payload = {
            paymentorder: {
                operation: "Purchase",
                intent: "Authorization",
                currency: this.currency,
                amount: amountMinor,
                vatAmount: 0,
                description: `Wallet top-up ${walletId}`.slice(0, 40),
                userAgent: input.userAgent?.trim() || "BingoBackend/0.1",
                language: this.language,
                productName: this.productName,
                urls: {
                    hostUrls,
                    completeUrl,
                    cancelUrl,
                    callbackUrl,
                    ...(this.termsOfServiceUrl ? { termsOfServiceUrl: this.termsOfServiceUrl } : {})
                },
                payeeInfo: {
                    payeeId: this.payeeId,
                    payeeReference,
                    orderReference,
                    ...(this.payeeName ? { payeeName: this.payeeName } : {})
                },
                orderItems: [
                    {
                        reference: `wallet-${walletId}`.slice(0, 50),
                        name: "Wallet Top-up",
                        type: "PRODUCT",
                        class: "TopUp",
                        quantity: 1,
                        quantityUnit: "pcs",
                        unitPrice: amountMinor,
                        amount: amountMinor,
                        vatAmount: 0,
                        vatPercent: 0
                    }
                ],
                metadata: {
                    intentId,
                    userId,
                    walletId
                }
            }
        };
        const created = await this.request("POST", "/psp/paymentorders", payload);
        const paymentOrderId = this.extractPaymentOrderId(created);
        const status = this.extractPaymentOrderStatus(created);
        const operations = this.extractOperations(created);
        const redirectUrl = this.findOperationUrl(operations, "redirect-checkout");
        const viewUrl = this.findOperationUrl(operations, "view-checkout");
        const { rows } = await this.pool.query(`INSERT INTO ${this.intentsTable()} (
        id,
        provider,
        user_id,
        wallet_id,
        order_reference,
        payee_reference,
        swedbank_payment_order_id,
        amount_minor,
        amount_major,
        currency,
        status,
        checkout_redirect_url,
        checkout_view_url,
        raw_create_response
      )
      VALUES ($1, 'swedbankpay', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      RETURNING
        id,
        provider,
        user_id,
        wallet_id,
        order_reference,
        payee_reference,
        swedbank_payment_order_id,
        amount_minor,
        amount_major,
        currency,
        status,
        checkout_redirect_url,
        checkout_view_url,
        credited_transaction_id,
        credited_at,
        last_error,
        created_at,
        updated_at`, [
            intentId,
            userId,
            walletId,
            orderReference,
            payeeReference,
            paymentOrderId,
            amountMinor,
            amountMajor.toFixed(2),
            this.currency,
            status,
            redirectUrl ?? null,
            viewUrl ?? null,
            JSON.stringify(created)
        ]);
        return this.mapRow(rows[0]);
    }
    async getIntentForUser(intentId, userId) {
        await this.ensureInitialized();
        const row = await this.getIntentRowForUser(intentId, userId);
        if (!row) {
            throw new DomainError("PAYMENT_INTENT_NOT_FOUND", "Fant ikke Swedbank intent for bruker.");
        }
        return this.mapRow(row);
    }
    async reconcileIntentForUser(intentId, userId) {
        await this.ensureInitialized();
        const row = await this.getIntentRowForUser(intentId, userId);
        if (!row) {
            throw new DomainError("PAYMENT_INTENT_NOT_FOUND", "Fant ikke Swedbank intent for bruker.");
        }
        return this.reconcileRow(row);
    }
    async processCallback(payload) {
        await this.ensureInitialized();
        const callback = asObject(payload);
        const paymentOrder = asObject(callback?.paymentOrder);
        const paymentOrderId = asString(paymentOrder?.id);
        const orderReference = asString(callback?.orderReference);
        let row = null;
        if (orderReference) {
            row = await this.findIntentByOrderReference(orderReference);
        }
        if (!row && paymentOrderId) {
            row = await this.findIntentByPaymentOrderId(normalizePaymentOrderId(paymentOrderId));
        }
        if (!row) {
            throw new DomainError("PAYMENT_INTENT_NOT_FOUND", "Callback peker til ukjent Swedbank intent.");
        }
        if (paymentOrderId && normalizePaymentOrderId(paymentOrderId) !== row.swedbank_payment_order_id) {
            await this.pool.query(`UPDATE ${this.intentsTable()}
         SET swedbank_payment_order_id = $2,
             updated_at = now()
         WHERE id = $1`, [row.id, normalizePaymentOrderId(paymentOrderId)]);
            row.swedbank_payment_order_id = normalizePaymentOrderId(paymentOrderId);
        }
        return this.reconcileRow(row);
    }
    async reconcileRow(row) {
        if (row.credited_at) {
            return {
                intent: this.mapRow(row),
                walletCreditedNow: false
            };
        }
        const paymentOrder = await this.fetchPaymentOrder(row.swedbank_payment_order_id);
        const remoteStatus = normalizeSwedbankStatus(this.extractPaymentOrderStatus(paymentOrder));
        const remoteAmountMinor = this.extractPaymentOrderAmountMinor(paymentOrder);
        const remoteCurrency = this.extractPaymentOrderCurrency(paymentOrder);
        if (remoteAmountMinor !== undefined && Number(row.amount_minor) !== remoteAmountMinor) {
            const message = "Swedbank amount matcher ikke opprinnelig top-up intent.";
            await this.updateIntentError(row.id, "FAILED", message, paymentOrder);
            throw new DomainError("SWEDBANK_AMOUNT_MISMATCH", message);
        }
        if (remoteCurrency && remoteCurrency.toUpperCase() !== row.currency.toUpperCase()) {
            const message = "Swedbank currency matcher ikke opprinnelig top-up intent.";
            await this.updateIntentError(row.id, "FAILED", message, paymentOrder);
            throw new DomainError("SWEDBANK_CURRENCY_MISMATCH", message);
        }
        if (!isPaidStatus(remoteStatus)) {
            const pendingRow = await this.updateIntentStatus(row.id, remoteStatus, paymentOrder);
            return {
                intent: this.mapRow(pendingRow),
                walletCreditedNow: false
            };
        }
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const locked = await this.getIntentRowForUpdate(client, row.id);
            if (!locked) {
                throw new DomainError("PAYMENT_INTENT_NOT_FOUND", "Fant ikke intent under avstemming.");
            }
            if (locked.credited_at) {
                await client.query("COMMIT");
                return {
                    intent: this.mapRow(locked),
                    walletCreditedNow: false
                };
            }
            const tx = await this.walletAdapter.topUp(locked.wallet_id, Number(locked.amount_major), `Swedbank top-up ${locked.order_reference}`);
            const { rows } = await client.query(`UPDATE ${this.intentsTable()}
         SET status = 'CREDITED',
             raw_latest_status = $2::jsonb,
             credited_transaction_id = $3,
             credited_at = now(),
             last_error = NULL,
             updated_at = now()
         WHERE id = $1
         RETURNING
           id,
           provider,
           user_id,
           wallet_id,
           order_reference,
           payee_reference,
           swedbank_payment_order_id,
           amount_minor,
           amount_major,
           currency,
           status,
           checkout_redirect_url,
           checkout_view_url,
           credited_transaction_id,
           credited_at,
           last_error,
           created_at,
           updated_at`, [locked.id, JSON.stringify(paymentOrder), tx.id]);
            await client.query("COMMIT");
            return {
                intent: this.mapRow(rows[0]),
                walletCreditedNow: true
            };
        }
        catch (error) {
            await client.query("ROLLBACK");
            if (error instanceof DomainError) {
                throw error;
            }
            throw new DomainError("SWEDBANK_RECONCILE_ERROR", "Kunne ikke avstemme Swedbank-betaling.");
        }
        finally {
            client.release();
        }
    }
    async fetchPaymentOrder(paymentOrderId) {
        const path = paymentOrderId.includes("?") ? paymentOrderId : `${paymentOrderId}?$expand=paid`;
        return this.request("GET", path);
    }
    extractPaymentOrderId(payload) {
        const root = asObject(payload);
        const paymentOrder = asObject(root?.paymentOrder);
        const id = asString(paymentOrder?.id) ?? asString(root?.id);
        if (!id) {
            throw new DomainError("SWEDBANK_INVALID_RESPONSE", "Swedbank svarte uten paymentOrder.id.");
        }
        return normalizePaymentOrderId(id);
    }
    extractPaymentOrderStatus(payload) {
        const root = asObject(payload);
        const paymentOrder = asObject(root?.paymentOrder);
        const status = asString(paymentOrder?.status);
        return normalizeSwedbankStatus(status);
    }
    extractPaymentOrderAmountMinor(payload) {
        const root = asObject(payload);
        const paymentOrder = asObject(root?.paymentOrder);
        const amount = asNumber(paymentOrder?.amount);
        return amount !== undefined ? Math.floor(amount) : undefined;
    }
    extractPaymentOrderCurrency(payload) {
        const root = asObject(payload);
        const paymentOrder = asObject(root?.paymentOrder);
        const currency = asString(paymentOrder?.currency);
        return currency ? currency.toUpperCase() : undefined;
    }
    extractOperations(payload) {
        const root = asObject(payload);
        const paymentOrder = asObject(root?.paymentOrder);
        const operationsRaw = root?.operations ?? paymentOrder?.operations;
        if (!Array.isArray(operationsRaw)) {
            return [];
        }
        const operations = [];
        for (const value of operationsRaw) {
            const operation = asObject(value);
            const rel = asString(operation?.rel);
            const href = asString(operation?.href);
            if (!rel || !href) {
                continue;
            }
            operations.push({ rel, href });
        }
        return operations;
    }
    findOperationUrl(operations, relName) {
        const operation = operations.find((item) => item.rel === relName);
        return operation?.href;
    }
    resolveCallbackUrl() {
        if (this.callbackUrl) {
            return this.callbackUrl;
        }
        if (!this.merchantBaseUrl) {
            throw new DomainError("INVALID_CONFIG", "Mangler SWEDBANK_PAY_CALLBACK_URL eller SWEDBANK_PAY_MERCHANT_BASE_URL.");
        }
        return new URL("api/payments/swedbank/callback", this.merchantBaseUrl).toString();
    }
    resolveCompleteUrl() {
        if (this.completeUrl) {
            return this.completeUrl;
        }
        if (!this.merchantBaseUrl) {
            throw new DomainError("INVALID_CONFIG", "Mangler SWEDBANK_PAY_COMPLETE_URL eller SWEDBANK_PAY_MERCHANT_BASE_URL.");
        }
        return new URL("", this.merchantBaseUrl).toString();
    }
    resolveCancelUrl() {
        if (this.cancelUrl) {
            return this.cancelUrl;
        }
        if (!this.merchantBaseUrl) {
            throw new DomainError("INVALID_CONFIG", "Mangler SWEDBANK_PAY_CANCEL_URL eller SWEDBANK_PAY_MERCHANT_BASE_URL.");
        }
        return new URL("", this.merchantBaseUrl).toString();
    }
    resolveHostUrls(...urls) {
        const set = new Set();
        for (const value of urls) {
            if (!value) {
                continue;
            }
            const parsed = new URL(value);
            set.add(parsed.origin);
        }
        if (this.merchantBaseUrl) {
            set.add(new URL(this.merchantBaseUrl).origin);
        }
        const hostUrls = [...set.values()];
        if (!hostUrls.length) {
            throw new DomainError("INVALID_CONFIG", "Mangler gyldig hostUrl for Swedbank checkout.");
        }
        return hostUrls;
    }
    withQuery(url, query) {
        const parsed = new URL(url);
        for (const [key, value] of Object.entries(query)) {
            parsed.searchParams.set(key, value);
        }
        return parsed.toString();
    }
    async request(method, path, body) {
        this.assertConfigured();
        const url = this.makeAbsoluteApiUrl(path);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
        try {
            const response = await fetch(url, {
                method,
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    Accept: "application/json;version=3.1",
                    ...(body !== undefined ? { "Content-Type": "application/json;version=3.1" } : {})
                },
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
                const root = asObject(parsed);
                const errorMessage = asString(root?.detail) || asString(root?.title) || asString(root?.errorCode);
                const problemsSummary = extractProblemsSummary(root);
                const messageBase = errorMessage
                    ? `Swedbank Pay API feilet (${response.status}): ${errorMessage}`
                    : `Swedbank Pay API feilet (${response.status}).`;
                throw new DomainError("SWEDBANK_API_ERROR", problemsSummary ? `${messageBase} Problems: ${problemsSummary}` : messageBase);
            }
            return parsed;
        }
        catch (error) {
            if (error instanceof DomainError) {
                throw error;
            }
            if (error.name === "AbortError") {
                throw new DomainError("SWEDBANK_API_TIMEOUT", "Timeout mot Swedbank Pay API.");
            }
            throw new DomainError("SWEDBANK_API_UNAVAILABLE", "Kunne ikke kontakte Swedbank Pay API.");
        }
        finally {
            clearTimeout(timeout);
        }
    }
    makeAbsoluteApiUrl(path) {
        if (isHttpUrl(path)) {
            return path;
        }
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        return new URL(normalizedPath, this.apiBaseUrl).toString();
    }
    assertConfigured() {
        if (this.isConfigured()) {
            return;
        }
        throw new DomainError("SWEDBANK_NOT_CONFIGURED", "Swedbank er ikke konfigurert. Sett SWEDBANK_PAY_ACCESS_TOKEN, SWEDBANK_PAY_PAYEE_ID og URL-innstillinger.");
    }
    intentsTable() {
        return `"${this.schema}"."swedbank_payment_intents"`;
    }
    async ensureInitialized() {
        if (!this.initPromise) {
            this.initPromise = this.initializeSchema();
        }
        await this.initPromise;
    }
    async initializeSchema() {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
            await client.query(`CREATE TABLE IF NOT EXISTS ${this.intentsTable()} (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          user_id TEXT NOT NULL,
          wallet_id TEXT NOT NULL,
          order_reference TEXT UNIQUE NOT NULL,
          payee_reference TEXT UNIQUE NOT NULL,
          swedbank_payment_order_id TEXT UNIQUE NOT NULL,
          amount_minor BIGINT NOT NULL,
          amount_major NUMERIC(18, 2) NOT NULL,
          currency TEXT NOT NULL,
          status TEXT NOT NULL,
          checkout_redirect_url TEXT NULL,
          checkout_view_url TEXT NULL,
          credited_transaction_id TEXT NULL,
          credited_at TIMESTAMPTZ NULL,
          last_error TEXT NULL,
          raw_create_response JSONB NULL,
          raw_latest_status JSONB NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_swedbank_payment_intents_user
         ON ${this.intentsTable()} (user_id, created_at DESC)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_swedbank_payment_intents_wallet
         ON ${this.intentsTable()} (wallet_id, created_at DESC)`);
            await client.query("COMMIT");
        }
        catch (error) {
            await client.query("ROLLBACK");
            if (error instanceof DomainError) {
                throw error;
            }
            throw new DomainError("PLATFORM_DB_ERROR", "Kunne ikke initialisere Swedbank payment-tabell.");
        }
        finally {
            client.release();
        }
    }
    async getIntentRowForUser(intentId, userId) {
        const { rows } = await this.pool.query(`SELECT
         id,
         provider,
         user_id,
         wallet_id,
         order_reference,
         payee_reference,
         swedbank_payment_order_id,
         amount_minor,
         amount_major,
         currency,
         status,
         checkout_redirect_url,
         checkout_view_url,
         credited_transaction_id,
         credited_at,
         last_error,
         created_at,
         updated_at
       FROM ${this.intentsTable()}
       WHERE id = $1
         AND user_id = $2`, [intentId.trim(), userId.trim()]);
        return rows[0] ?? null;
    }
    async findIntentByOrderReference(orderReference) {
        const { rows } = await this.pool.query(`SELECT
         id,
         provider,
         user_id,
         wallet_id,
         order_reference,
         payee_reference,
         swedbank_payment_order_id,
         amount_minor,
         amount_major,
         currency,
         status,
         checkout_redirect_url,
         checkout_view_url,
         credited_transaction_id,
         credited_at,
         last_error,
         created_at,
         updated_at
       FROM ${this.intentsTable()}
       WHERE order_reference = $1`, [orderReference.trim()]);
        return rows[0] ?? null;
    }
    async findIntentByPaymentOrderId(paymentOrderId) {
        const { rows } = await this.pool.query(`SELECT
         id,
         provider,
         user_id,
         wallet_id,
         order_reference,
         payee_reference,
         swedbank_payment_order_id,
         amount_minor,
         amount_major,
         currency,
         status,
         checkout_redirect_url,
         checkout_view_url,
         credited_transaction_id,
         credited_at,
         last_error,
         created_at,
         updated_at
       FROM ${this.intentsTable()}
       WHERE swedbank_payment_order_id = $1`, [paymentOrderId]);
        return rows[0] ?? null;
    }
    async getIntentRowForUpdate(client, intentId) {
        const { rows } = await client.query(`SELECT
         id,
         provider,
         user_id,
         wallet_id,
         order_reference,
         payee_reference,
         swedbank_payment_order_id,
         amount_minor,
         amount_major,
         currency,
         status,
         checkout_redirect_url,
         checkout_view_url,
         credited_transaction_id,
         credited_at,
         last_error,
         created_at,
         updated_at
       FROM ${this.intentsTable()}
       WHERE id = $1
       FOR UPDATE`, [intentId]);
        return rows[0] ?? null;
    }
    async updateIntentStatus(intentId, status, rawLatestStatus) {
        const { rows } = await this.pool.query(`UPDATE ${this.intentsTable()}
       SET status = $2,
           raw_latest_status = $3::jsonb,
           updated_at = now(),
           last_error = NULL
       WHERE id = $1
       RETURNING
         id,
         provider,
         user_id,
         wallet_id,
         order_reference,
         payee_reference,
         swedbank_payment_order_id,
         amount_minor,
         amount_major,
         currency,
         status,
         checkout_redirect_url,
         checkout_view_url,
         credited_transaction_id,
         credited_at,
         last_error,
         created_at,
         updated_at`, [intentId, status, JSON.stringify(rawLatestStatus)]);
        if (!rows[0]) {
            throw new DomainError("PAYMENT_INTENT_NOT_FOUND", "Fant ikke intent under status-oppdatering.");
        }
        return rows[0];
    }
    async updateIntentError(intentId, status, message, rawLatestStatus) {
        await this.pool.query(`UPDATE ${this.intentsTable()}
       SET status = $2,
           last_error = $3,
           raw_latest_status = $4::jsonb,
           updated_at = now()
       WHERE id = $1`, [intentId, status, message, JSON.stringify(rawLatestStatus)]);
    }
    mapRow(row) {
        const amountMinor = Number(row.amount_minor);
        const amountMajor = Number(row.amount_major);
        return {
            id: row.id,
            provider: "swedbankpay",
            userId: row.user_id,
            walletId: row.wallet_id,
            orderReference: row.order_reference,
            payeeReference: row.payee_reference,
            paymentOrderId: row.swedbank_payment_order_id,
            amountMajor: Number.isFinite(amountMajor) ? amountMajor : fromMinorUnits(amountMinor),
            amountMinor,
            currency: row.currency,
            status: row.status,
            redirectUrl: row.checkout_redirect_url ?? undefined,
            viewUrl: row.checkout_view_url ?? undefined,
            creditedTransactionId: row.credited_transaction_id ?? undefined,
            creditedAt: asDateIso(row.credited_at),
            lastError: row.last_error ?? undefined,
            createdAt: asDateIso(row.created_at) ?? new Date().toISOString(),
            updatedAt: asDateIso(row.updated_at) ?? new Date().toISOString()
        };
    }
}
