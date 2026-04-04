import { createHmac } from "node:crypto";
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export class WebhookService {
    gameResultUrl;
    complianceUrl;
    secret;
    timeoutMs;
    maxRetries;
    /** Delivery log for admin inspection. */
    deliveryLog = [];
    static MAX_LOG_SIZE = 500;
    constructor(options) {
        this.gameResultUrl = options.gameResultWebhookUrl;
        this.complianceUrl = options.complianceWebhookUrl ?? options.gameResultWebhookUrl;
        this.secret = options.webhookSecret;
        this.timeoutMs = options.timeoutMs ?? 10_000;
        this.maxRetries = options.maxRetries ?? 5;
    }
    // -----------------------------------------------------------------------
    // Game result webhook (BIN-34)
    // -----------------------------------------------------------------------
    /**
     * Send a game result webhook to the provider.
     * Retries with exponential backoff on failure.
     */
    async sendGameResult(payload) {
        const body = JSON.stringify(payload);
        const signature = this.sign(body);
        const signedPayload = { ...payload, signature };
        return this.deliverWithRetry(this.gameResultUrl, signedPayload, `game-result:${payload.gameId}`);
    }
    /**
     * Build a GameResultWebhookPayload from game-end data.
     */
    buildGameResultPayload(params) {
        const result = {
            entryFee: params.entryFee,
            totalPayout: params.totalPayout,
            netResult: params.totalPayout - params.entryFee,
            currency: params.currency,
            ticketsPlayed: params.ticketsPlayed,
            numbersDrawn: params.numbersDrawn,
            patterns: params.patterns
        };
        return {
            event: "game.completed",
            gameId: params.gameId,
            sessionId: params.sessionId,
            playerId: params.playerId,
            timestamp: new Date().toISOString(),
            result
        };
    }
    // -----------------------------------------------------------------------
    // Compliance callbacks (BIN-35)
    // -----------------------------------------------------------------------
    /**
     * Send a compliance event to the provider.
     */
    async sendComplianceEvent(payload) {
        const body = JSON.stringify(payload);
        const signature = this.sign(body);
        const signedPayload = { ...payload, signature };
        return this.deliverWithRetry(this.complianceUrl, signedPayload, `compliance:${payload.event}:${payload.playerId}`);
    }
    /**
     * Build a compliance event payload.
     */
    buildCompliancePayload(event, playerId, details) {
        return {
            event,
            playerId,
            timestamp: new Date().toISOString(),
            details
        };
    }
    // -----------------------------------------------------------------------
    // Admin / inspection
    // -----------------------------------------------------------------------
    getDeliveryLog() {
        return this.deliveryLog.map((r) => ({ ...r }));
    }
    getRecentDeliveries(limit = 20) {
        return this.deliveryLog.slice(-limit).reverse().map((r) => ({ ...r }));
    }
    // -----------------------------------------------------------------------
    // Internal: delivery with retry
    // -----------------------------------------------------------------------
    async deliverWithRetry(url, payload, tag) {
        let lastError;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            if (attempt > 0) {
                const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 16_000);
                await this.sleep(delayMs);
            }
            try {
                const body = JSON.stringify(payload);
                const signature = this.sign(body);
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Webhook-Signature": signature
                    },
                    body,
                    signal: controller.signal
                });
                clearTimeout(timeout);
                const record = {
                    tag,
                    url,
                    attempt: attempt + 1,
                    status: response.status,
                    success: response.ok,
                    timestamp: new Date().toISOString()
                };
                this.addToLog(record);
                if (response.ok) {
                    return record;
                }
                lastError = `HTTP ${response.status}`;
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
            }
        }
        // All retries exhausted.
        const failRecord = {
            tag,
            url,
            attempt: this.maxRetries + 1,
            status: 0,
            success: false,
            error: lastError,
            timestamp: new Date().toISOString()
        };
        this.addToLog(failRecord);
        console.error(`[WebhookService] Delivery failed after ${this.maxRetries + 1} attempts: ${tag} — ${lastError}`);
        return failRecord;
    }
    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    sign(body) {
        return createHmac("sha256", this.secret).update(body).digest("hex");
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    addToLog(record) {
        this.deliveryLog.push(record);
        if (this.deliveryLog.length > WebhookService.MAX_LOG_SIZE) {
            this.deliveryLog.splice(0, this.deliveryLog.length - WebhookService.MAX_LOG_SIZE);
        }
    }
}
