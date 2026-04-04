import { randomBytes } from "node:crypto";
export class CandyLaunchTokenStore {
    ttlMs;
    now;
    tokens = new Map();
    constructor(options) {
        this.ttlMs = Math.max(1, Math.floor(options.ttlMs));
        this.now = options.now ?? Date.now;
    }
    issue(input) {
        const nowMs = this.now();
        this.cleanupExpired(nowMs);
        let launchToken = "";
        do {
            launchToken = randomBytes(24).toString("base64url");
        } while (this.tokens.has(launchToken));
        const issuedAtMs = nowMs;
        const expiresAtMs = issuedAtMs + this.ttlMs;
        const issuedAt = new Date(issuedAtMs).toISOString();
        const expiresAt = new Date(expiresAtMs).toISOString();
        this.tokens.set(launchToken, {
            accessToken: input.accessToken,
            hallId: input.hallId,
            playerName: input.playerName,
            walletId: input.walletId,
            apiBaseUrl: input.apiBaseUrl,
            issuedAt,
            expiresAt,
            expiresAtMs
        });
        return {
            launchToken,
            issuedAt,
            expiresAt
        };
    }
    consume(rawLaunchToken) {
        const launchToken = (rawLaunchToken ?? "").trim();
        if (!launchToken) {
            return null;
        }
        const nowMs = this.now();
        this.cleanupExpired(nowMs);
        const stored = this.tokens.get(launchToken);
        if (!stored) {
            return null;
        }
        this.tokens.delete(launchToken);
        if (stored.expiresAtMs <= nowMs) {
            return null;
        }
        return {
            accessToken: stored.accessToken,
            hallId: stored.hallId,
            playerName: stored.playerName,
            walletId: stored.walletId,
            apiBaseUrl: stored.apiBaseUrl,
            issuedAt: stored.issuedAt,
            expiresAt: stored.expiresAt
        };
    }
    cleanupExpired(nowMs) {
        for (const [token, stored] of this.tokens.entries()) {
            if (stored.expiresAtMs <= nowMs) {
                this.tokens.delete(token);
            }
        }
    }
}
