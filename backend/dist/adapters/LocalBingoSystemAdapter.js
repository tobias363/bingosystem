import { generateTraditional75Ticket } from "../game/ticket.js";
export class LocalBingoSystemAdapter {
    async createTicket(_input) {
        return generateTraditional75Ticket();
    }
    async onGameStarted(_input) {
        // No-op for local development.
    }
    async onNumberDrawn(_input) {
        // No-op for local development.
    }
    async onClaimLogged(_input) {
        // No-op for local development.
    }
    async onGameEnded(_input) {
        // No-op for local development.
    }
}
