// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------
/**
 * Decorates a BingoSystemAdapter with webhook delivery for integration mode.
 * Delegates all core operations to the inner adapter and adds webhook calls
 * on game-end events.
 */
export class IntegrationBingoSystemAdapter {
    inner;
    webhookService;
    currency;
    resolveExternalPlayerId;
    constructor(options) {
        this.inner = options.inner;
        this.webhookService = options.webhookService;
        this.currency = options.currency ?? "NOK";
        this.resolveExternalPlayerId = options.resolveExternalPlayerId;
    }
    async createTicket(input) {
        return this.inner.createTicket(input);
    }
    async onGameStarted(input) {
        if (this.inner.onGameStarted) {
            await this.inner.onGameStarted(input);
        }
    }
    async onNumberDrawn(input) {
        if (this.inner.onNumberDrawn) {
            await this.inner.onNumberDrawn(input);
        }
    }
    async onClaimLogged(input) {
        if (this.inner.onClaimLogged) {
            await this.inner.onClaimLogged(input);
        }
    }
    async onGameEnded(input) {
        // Delegate to inner first.
        if (this.inner.onGameEnded) {
            await this.inner.onGameEnded(input);
        }
        // Send webhook for each player in the game.
        for (const playerId of input.playerIds) {
            const externalId = await this.resolveExternalPlayerId(playerId);
            if (!externalId)
                continue; // Not an integration player — skip.
            // Calculate payout for this player from claims.
            const playerClaims = input.claims.filter((c) => c.playerId === playerId && c.valid);
            const totalPayout = playerClaims.reduce((sum, c) => sum + (c.payoutAmount ?? 0), 0);
            const patterns = playerClaims.map((c) => c.type);
            const payload = this.webhookService.buildGameResultPayload({
                gameId: input.gameId,
                sessionId: input.roomCode, // Use room code as session reference.
                playerId: externalId,
                entryFee: input.entryFee,
                totalPayout,
                currency: this.currency,
                ticketsPlayed: 1, // Each player ID has one ticket set.
                numbersDrawn: input.drawnNumbers.length,
                patterns
            });
            // Non-blocking delivery — don't hold up game flow.
            this.webhookService.sendGameResult(payload).catch((err) => {
                console.error(`[IntegrationAdapter] Webhook delivery failed for player ${externalId}:`, err);
            });
        }
    }
}
