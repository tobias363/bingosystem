import { createHash, randomUUID } from "node:crypto";
import { WalletError } from "../adapters/WalletAdapter.js";
import { findFirstCompleteLinePatternIndex, hasFullBingo, makeRoomCode, makeShuffledBallBag, ticketContainsNumber } from "./ticket.js";
export class DomainError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
const POLICY_WILDCARD = "*";
const DEFAULT_SELF_EXCLUSION_MIN_MS = 365 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_DRAWS_PER_ROUND = 30;
const MAX_BINGO_BALLS = 75;
const DEFAULT_BONUS_TRIGGER_PATTERN_INDEX = 1;
export class BingoEngine {
    bingoAdapter;
    walletAdapter;
    rooms = new Map();
    roomLastRoundStartMs = new Map();
    lossEntriesByScope = new Map();
    personalLossLimitsByScope = new Map();
    playStateByWallet = new Map();
    restrictionsByWallet = new Map();
    prizePoliciesByScope = new Map();
    extraPrizeEntriesByScope = new Map();
    extraDrawDenials = [];
    payoutAuditTrail = [];
    complianceLedger = [];
    dailyReportArchive = new Map();
    overskuddBatches = new Map();
    lastPayoutAuditHash = "GENESIS";
    minRoundIntervalMs;
    minPlayersToStart;
    regulatoryLossLimits;
    playSessionLimitMs;
    pauseDurationMs;
    selfExclusionMinMs;
    maxDrawsPerRound;
    constructor(bingoAdapter, walletAdapter, options = {}) {
        this.bingoAdapter = bingoAdapter;
        this.walletAdapter = walletAdapter;
        this.minRoundIntervalMs = Math.max(30000, Math.floor(options.minRoundIntervalMs ?? 30000));
        const minPlayersToStart = options.minPlayersToStart ?? 2;
        if (!Number.isFinite(minPlayersToStart) || !Number.isInteger(minPlayersToStart) || minPlayersToStart < 1) {
            throw new DomainError("INVALID_CONFIG", "minPlayersToStart må være et heltall >= 1.");
        }
        this.minPlayersToStart = Math.floor(minPlayersToStart);
        const dailyLossLimit = options.dailyLossLimit ?? 900;
        const monthlyLossLimit = options.monthlyLossLimit ?? 4400;
        if (!Number.isFinite(dailyLossLimit) || dailyLossLimit < 0) {
            throw new DomainError("INVALID_CONFIG", "dailyLossLimit må være >= 0.");
        }
        if (!Number.isFinite(monthlyLossLimit) || monthlyLossLimit < 0) {
            throw new DomainError("INVALID_CONFIG", "monthlyLossLimit må være >= 0.");
        }
        this.regulatoryLossLimits = {
            daily: dailyLossLimit,
            monthly: monthlyLossLimit
        };
        const playSessionLimitMs = options.playSessionLimitMs ?? 60 * 60 * 1000;
        const pauseDurationMs = options.pauseDurationMs ?? 5 * 60 * 1000;
        if (!Number.isFinite(playSessionLimitMs) || playSessionLimitMs <= 0) {
            throw new DomainError("INVALID_CONFIG", "playSessionLimitMs må være større enn 0.");
        }
        if (!Number.isFinite(pauseDurationMs) || pauseDurationMs <= 0) {
            throw new DomainError("INVALID_CONFIG", "pauseDurationMs må være større enn 0.");
        }
        const selfExclusionMinMs = options.selfExclusionMinMs ?? DEFAULT_SELF_EXCLUSION_MIN_MS;
        if (!Number.isFinite(selfExclusionMinMs) || selfExclusionMinMs < DEFAULT_SELF_EXCLUSION_MIN_MS) {
            throw new DomainError("INVALID_CONFIG", `selfExclusionMinMs må være minst ${DEFAULT_SELF_EXCLUSION_MIN_MS} ms (1 år).`);
        }
        const maxDrawsPerRound = options.maxDrawsPerRound ?? DEFAULT_MAX_DRAWS_PER_ROUND;
        if (!Number.isFinite(maxDrawsPerRound) ||
            !Number.isInteger(maxDrawsPerRound) ||
            maxDrawsPerRound < 1 ||
            maxDrawsPerRound > MAX_BINGO_BALLS) {
            throw new DomainError("INVALID_CONFIG", `maxDrawsPerRound må være et heltall mellom 1 og ${MAX_BINGO_BALLS}.`);
        }
        this.playSessionLimitMs = Math.floor(playSessionLimitMs);
        this.pauseDurationMs = Math.floor(pauseDurationMs);
        this.selfExclusionMinMs = Math.floor(selfExclusionMinMs);
        this.maxDrawsPerRound = Math.floor(maxDrawsPerRound);
        this.upsertPrizePolicy({
            gameType: "DATABINGO",
            hallId: POLICY_WILDCARD,
            linkId: POLICY_WILDCARD,
            effectiveFrom: new Date(0).toISOString(),
            singlePrizeCap: 2500,
            dailyExtraPrizeCap: 12000
        });
    }
    async createRoom(input) {
        const hallId = this.assertHallId(input.hallId);
        const playerId = randomUUID();
        const walletId = input.walletId?.trim() || `wallet-${playerId}`;
        this.assertWalletAllowedForGameplay(walletId, Date.now());
        this.assertWalletNotInRunningGame(walletId);
        await this.walletAdapter.ensureAccount(walletId);
        const balance = await this.walletAdapter.getBalance(walletId);
        const player = {
            id: playerId,
            name: this.assertPlayerName(input.playerName),
            walletId,
            balance,
            socketId: input.socketId
        };
        const code = makeRoomCode(new Set(this.rooms.keys()));
        const room = {
            code,
            hallId,
            hostPlayerId: playerId,
            createdAt: new Date().toISOString(),
            players: new Map([[playerId, player]]),
            gameHistory: []
        };
        this.rooms.set(code, room);
        return { roomCode: code, playerId };
    }
    async joinRoom(input) {
        const roomCode = input.roomCode.trim().toUpperCase();
        const hallId = this.assertHallId(input.hallId);
        const room = this.requireRoom(roomCode);
        if (room.hallId !== hallId) {
            throw new DomainError("HALL_MISMATCH", "Rommet tilhører en annen hall.");
        }
        const playerId = randomUUID();
        const walletId = input.walletId?.trim() || `wallet-${playerId}`;
        this.assertWalletAllowedForGameplay(walletId, Date.now());
        this.assertWalletNotInRunningGame(walletId, roomCode);
        this.assertWalletNotAlreadyInRoom(room, walletId);
        await this.walletAdapter.ensureAccount(walletId);
        const balance = await this.walletAdapter.getBalance(walletId);
        room.players.set(playerId, {
            id: playerId,
            name: this.assertPlayerName(input.playerName),
            walletId,
            balance,
            socketId: input.socketId
        });
        return { roomCode, playerId };
    }
    async startGame(input) {
        const room = this.requireRoom(input.roomCode);
        this.assertHost(room, input.actorPlayerId);
        this.assertNotRunning(room);
        this.archiveIfEnded(room);
        const nowMs = Date.now();
        this.assertRoundStartInterval(room, nowMs);
        if (room.players.size < this.minPlayersToStart) {
            throw new DomainError("NOT_ENOUGH_PLAYERS", `Du trenger minst ${this.minPlayersToStart} spiller${this.minPlayersToStart == 1 ? "" : "e"} for å starte.`);
        }
        const entryFee = input.entryFee ?? 0;
        if (!Number.isFinite(entryFee) || entryFee < 0) {
            throw new DomainError("INVALID_ENTRY_FEE", "entryFee må være >= 0.");
        }
        const ticketsPerPlayer = input.ticketsPerPlayer ?? 1;
        if (!Number.isInteger(ticketsPerPlayer) || ticketsPerPlayer < 1 || ticketsPerPlayer > 5) {
            throw new DomainError("INVALID_TICKETS_PER_PLAYER", "ticketsPerPlayer må være et heltall mellom 1 og 5.");
        }
        const payoutPercent = input.payoutPercent ?? 100;
        if (!Number.isFinite(payoutPercent) || payoutPercent < 0 || payoutPercent > 100) {
            throw new DomainError("INVALID_PAYOUT_PERCENT", "payoutPercent må være mellom 0 og 100.");
        }
        const normalizedPayoutPercent = Math.round(payoutPercent * 100) / 100;
        const players = [...room.players.values()];
        this.assertPlayersNotInAnotherRunningGame(room.code, players);
        this.assertPlayersNotBlockedByRestriction(players, nowMs);
        this.assertPlayersNotOnRequiredPause(players, nowMs);
        await this.refreshPlayerObjectsFromWallet(players);
        await this.assertLossLimitsBeforeBuyIn(players, entryFee, nowMs, room.hallId);
        const gameId = randomUUID();
        const gameType = "DATABINGO";
        const channel = "INTERNET";
        const houseAccountId = this.makeHouseAccountId(room.hallId, gameType, channel);
        if (entryFee > 0) {
            await this.ensureSufficientBalance(players, entryFee);
            for (const player of players) {
                const transfer = await this.walletAdapter.transfer(player.walletId, houseAccountId, entryFee, `Bingo buy-in ${room.code}`);
                player.balance -= entryFee;
                this.recordLossEntry(player.walletId, room.hallId, {
                    type: "BUYIN",
                    amount: entryFee,
                    createdAtMs: nowMs
                });
                this.recordComplianceLedgerEvent({
                    hallId: room.hallId,
                    gameType,
                    channel,
                    eventType: "STAKE",
                    amount: entryFee,
                    roomCode: room.code,
                    gameId,
                    playerId: player.id,
                    walletId: player.walletId,
                    sourceAccountId: transfer.fromTx.accountId,
                    targetAccountId: transfer.toTx.accountId,
                    metadata: {
                        reason: "BINGO_BUYIN"
                    }
                });
            }
        }
        const tickets = new Map();
        const marks = new Map();
        for (const player of players) {
            const playerTickets = [];
            const playerMarks = [];
            for (let ticketIndex = 0; ticketIndex < ticketsPerPlayer; ticketIndex += 1) {
                const ticket = await this.bingoAdapter.createTicket({
                    roomCode: room.code,
                    gameId,
                    player,
                    ticketIndex,
                    ticketsPerPlayer
                });
                playerTickets.push(ticket);
                playerMarks.push(new Set());
            }
            tickets.set(player.id, playerTickets);
            marks.set(player.id, playerMarks);
        }
        const prizePool = this.roundCurrency(entryFee * players.length);
        const maxPayoutBudget = this.roundCurrency((prizePool * normalizedPayoutPercent) / 100);
        const game = {
            id: gameId,
            status: "RUNNING",
            entryFee,
            ticketsPerPlayer,
            prizePool,
            remainingPrizePool: prizePool,
            payoutPercent: normalizedPayoutPercent,
            maxPayoutBudget,
            remainingPayoutBudget: maxPayoutBudget,
            drawBag: makeShuffledBallBag(MAX_BINGO_BALLS),
            drawnNumbers: [],
            tickets,
            marks,
            claims: [],
            startedAt: new Date().toISOString()
        };
        room.currentGame = game;
        this.roomLastRoundStartMs.set(room.code, Date.parse(game.startedAt));
        for (const player of players) {
            this.startPlaySession(player.walletId, nowMs);
        }
        if (this.bingoAdapter.onGameStarted) {
            await this.bingoAdapter.onGameStarted({
                roomCode: room.code,
                gameId,
                entryFee,
                playerIds: players.map((player) => player.id)
            });
        }
    }
    async drawNextNumber(input) {
        const room = this.requireRoom(input.roomCode);
        this.assertHost(room, input.actorPlayerId);
        const host = this.requirePlayer(room, input.actorPlayerId);
        this.assertWalletAllowedForGameplay(host.walletId, Date.now());
        const game = this.requireRunningGame(room);
        if (game.drawnNumbers.length >= this.maxDrawsPerRound) {
            const endedAt = new Date();
            game.status = "ENDED";
            game.endedAt = endedAt.toISOString();
            game.endedReason = "MAX_DRAWS_REACHED";
            this.finishPlaySessionsForGame(room, game, endedAt.getTime());
            throw new DomainError("NO_MORE_NUMBERS", `Maks antall trekk (${this.maxDrawsPerRound}) er nådd.`);
        }
        const nextNumber = game.drawBag.shift();
        if (!nextNumber) {
            const endedAt = new Date();
            game.status = "ENDED";
            game.endedAt = endedAt.toISOString();
            game.endedReason = "DRAW_BAG_EMPTY";
            this.finishPlaySessionsForGame(room, game, endedAt.getTime());
            throw new DomainError("NO_MORE_NUMBERS", "Ingen tall igjen i trekken.");
        }
        game.drawnNumbers.push(nextNumber);
        if (this.bingoAdapter.onNumberDrawn) {
            await this.bingoAdapter.onNumberDrawn({
                roomCode: room.code,
                gameId: game.id,
                number: nextNumber,
                drawIndex: game.drawnNumbers.length
            });
        }
        if (game.drawnNumbers.length >= this.maxDrawsPerRound) {
            const endedAt = new Date();
            game.status = "ENDED";
            game.endedAt = endedAt.toISOString();
            game.endedReason = "MAX_DRAWS_REACHED";
            this.finishPlaySessionsForGame(room, game, endedAt.getTime());
        }
        return nextNumber;
    }
    async markNumber(input) {
        const room = this.requireRoom(input.roomCode);
        const game = this.requireRunningGame(room);
        const player = this.requirePlayer(room, input.playerId);
        this.assertWalletAllowedForGameplay(player.walletId, Date.now());
        if (!game.drawnNumbers.includes(input.number)) {
            throw new DomainError("NUMBER_NOT_DRAWN", "Tallet er ikke trukket ennå.");
        }
        const playerTickets = game.tickets.get(player.id);
        const playerMarks = game.marks.get(player.id);
        if (!playerTickets || !playerMarks || playerTickets.length === 0 || playerMarks.length !== playerTickets.length) {
            throw new DomainError("MARKS_NOT_FOUND", "Kunne ikke finne markeringer for spiller.");
        }
        let numberFound = false;
        for (let i = 0; i < playerTickets.length; i += 1) {
            const ticket = playerTickets[i];
            if (!ticketContainsNumber(ticket, input.number)) {
                continue;
            }
            playerMarks[i].add(input.number);
            numberFound = true;
        }
        if (!numberFound) {
            throw new DomainError("NUMBER_NOT_ON_TICKET", "Tallet finnes ikke på spillerens brett.");
        }
    }
    async submitClaim(input) {
        const room = this.requireRoom(input.roomCode);
        const game = this.requireRunningGame(room);
        const player = this.requirePlayer(room, input.playerId);
        this.assertWalletAllowedForGameplay(player.walletId, Date.now());
        // BIN-45: Idempotency — if this player already has a paid-out claim of the
        // same type in this game, return the existing claim instead of processing again.
        // This prevents double payouts when the client retries after a network error.
        const existingClaim = game.claims.find((c) => c.playerId === player.id &&
            c.type === input.type &&
            c.valid &&
            c.payoutAmount !== undefined &&
            c.payoutAmount > 0);
        if (existingClaim) {
            return existingClaim;
        }
        const playerTickets = game.tickets.get(player.id);
        const playerMarks = game.marks.get(player.id);
        if (!playerTickets ||
            !playerMarks ||
            playerTickets.length === 0 ||
            playerMarks.length !== playerTickets.length) {
            throw new DomainError("TICKET_NOT_FOUND", "Spiller mangler brett i aktivt spill.");
        }
        let valid = false;
        let reason;
        let winningPatternIndex;
        if (input.type === "LINE") {
            if (game.lineWinnerId) {
                reason = "LINE_ALREADY_CLAIMED";
            }
            else {
                for (let ticketIndex = 0; ticketIndex < playerTickets.length; ticketIndex += 1) {
                    const resolvedPatternIndex = findFirstCompleteLinePatternIndex(playerTickets[ticketIndex], playerMarks[ticketIndex]);
                    if (resolvedPatternIndex < 0) {
                        continue;
                    }
                    valid = true;
                    winningPatternIndex = resolvedPatternIndex;
                    break;
                }
                if (!valid) {
                    reason = "NO_VALID_LINE";
                }
            }
        }
        else if (input.type === "BINGO") {
            valid = playerTickets.some((ticket, index) => hasFullBingo(ticket, playerMarks[index]));
            if (!valid) {
                reason = "NO_VALID_BINGO";
            }
        }
        else {
            reason = "UNKNOWN_CLAIM_TYPE";
        }
        const claim = {
            id: randomUUID(),
            playerId: player.id,
            type: input.type,
            valid,
            reason,
            createdAt: new Date().toISOString()
        };
        if (winningPatternIndex !== undefined) {
            claim.winningPatternIndex = winningPatternIndex;
            claim.patternIndex = winningPatternIndex;
        }
        game.claims.push(claim);
        const gameType = "DATABINGO";
        const channel = "INTERNET";
        const houseAccountId = this.makeHouseAccountId(room.hallId, gameType, channel);
        if (valid && input.type === "LINE") {
            game.lineWinnerId = player.id;
            const rtpBudgetBefore = this.roundCurrency(Math.max(0, game.remainingPayoutBudget));
            const requestedPayout = Math.floor(game.prizePool * 0.3);
            const cappedLinePayout = this.applySinglePrizeCap({
                room,
                gameType: "DATABINGO",
                amount: requestedPayout
            });
            const requestedAfterPolicyAndPool = Math.min(cappedLinePayout.cappedAmount, game.remainingPrizePool);
            const payout = Math.min(requestedAfterPolicyAndPool, game.remainingPayoutBudget);
            if (payout > 0) {
                const transfer = await this.walletAdapter.transfer(houseAccountId, player.walletId, payout, `Line prize ${room.code}`);
                player.balance += payout;
                game.remainingPrizePool = this.roundCurrency(Math.max(0, game.remainingPrizePool - payout));
                game.remainingPayoutBudget = this.roundCurrency(Math.max(0, game.remainingPayoutBudget - payout));
                this.recordLossEntry(player.walletId, room.hallId, {
                    type: "PAYOUT",
                    amount: payout,
                    createdAtMs: Date.now()
                });
                this.recordComplianceLedgerEvent({
                    hallId: room.hallId,
                    gameType,
                    channel,
                    eventType: "PRIZE",
                    amount: payout,
                    roomCode: room.code,
                    gameId: game.id,
                    claimId: claim.id,
                    playerId: player.id,
                    walletId: player.walletId,
                    sourceAccountId: transfer.fromTx.accountId,
                    targetAccountId: transfer.toTx.accountId,
                    policyVersion: cappedLinePayout.policy.id
                });
                this.appendPayoutAuditEvent({
                    kind: "CLAIM_PRIZE",
                    claimId: claim.id,
                    gameId: game.id,
                    roomCode: room.code,
                    hallId: room.hallId,
                    policyVersion: cappedLinePayout.policy.id,
                    amount: payout,
                    walletId: player.walletId,
                    playerId: player.id,
                    sourceAccountId: houseAccountId,
                    txIds: [transfer.fromTx.id, transfer.toTx.id]
                });
                // BIN-45: Store transaction IDs for idempotency tracking
                claim.payoutTransactionIds = [transfer.fromTx.id, transfer.toTx.id];
                // BIN-48: Synchronous checkpoint after payout — ensures state is persisted
                if (this.bingoAdapter.onCheckpoint) {
                    try {
                        await this.bingoAdapter.onCheckpoint({
                            roomCode: room.code,
                            gameId: game.id,
                            reason: "PAYOUT",
                            claimId: claim.id,
                            payoutAmount: payout,
                            transactionIds: [transfer.fromTx.id, transfer.toTx.id]
                        });
                    }
                    catch (err) {
                        console.error(`CRITICAL: Checkpoint failed after LINE payout (claim ${claim.id}, game ${game.id}):`, err);
                    }
                }
            }
            const rtpBudgetAfter = this.roundCurrency(Math.max(0, game.remainingPayoutBudget));
            claim.payoutAmount = payout;
            claim.payoutPolicyVersion = cappedLinePayout.policy.id;
            claim.payoutWasCapped = payout < requestedPayout;
            claim.rtpBudgetBefore = rtpBudgetBefore;
            claim.rtpBudgetAfter = rtpBudgetAfter;
            claim.rtpCapped = payout < requestedAfterPolicyAndPool;
            claim.bonusTriggered = winningPatternIndex === DEFAULT_BONUS_TRIGGER_PATTERN_INDEX;
            if (claim.bonusTriggered) {
                claim.bonusAmount = payout;
            }
        }
        if (valid && input.type === "BINGO") {
            const endedAt = new Date();
            game.bingoWinnerId = player.id;
            const rtpBudgetBefore = this.roundCurrency(Math.max(0, game.remainingPayoutBudget));
            const requestedPayout = game.remainingPrizePool;
            const cappedBingoPayout = this.applySinglePrizeCap({
                room,
                gameType: "DATABINGO",
                amount: requestedPayout
            });
            const requestedAfterPolicyAndPool = Math.min(cappedBingoPayout.cappedAmount, game.remainingPrizePool);
            const payout = Math.min(requestedAfterPolicyAndPool, game.remainingPayoutBudget);
            if (payout > 0) {
                const transfer = await this.walletAdapter.transfer(houseAccountId, player.walletId, payout, `Bingo prize ${room.code}`);
                player.balance += payout;
                this.recordLossEntry(player.walletId, room.hallId, {
                    type: "PAYOUT",
                    amount: payout,
                    createdAtMs: Date.now()
                });
                this.recordComplianceLedgerEvent({
                    hallId: room.hallId,
                    gameType,
                    channel,
                    eventType: "PRIZE",
                    amount: payout,
                    roomCode: room.code,
                    gameId: game.id,
                    claimId: claim.id,
                    playerId: player.id,
                    walletId: player.walletId,
                    sourceAccountId: transfer.fromTx.accountId,
                    targetAccountId: transfer.toTx.accountId,
                    policyVersion: cappedBingoPayout.policy.id
                });
                this.appendPayoutAuditEvent({
                    kind: "CLAIM_PRIZE",
                    claimId: claim.id,
                    gameId: game.id,
                    roomCode: room.code,
                    hallId: room.hallId,
                    policyVersion: cappedBingoPayout.policy.id,
                    amount: payout,
                    walletId: player.walletId,
                    playerId: player.id,
                    sourceAccountId: houseAccountId,
                    txIds: [transfer.fromTx.id, transfer.toTx.id]
                });
                // BIN-45: Store transaction IDs for idempotency tracking
                claim.payoutTransactionIds = [transfer.fromTx.id, transfer.toTx.id];
                // BIN-48: Synchronous checkpoint after payout — ensures state is persisted
                if (this.bingoAdapter.onCheckpoint) {
                    try {
                        await this.bingoAdapter.onCheckpoint({
                            roomCode: room.code,
                            gameId: game.id,
                            reason: "PAYOUT",
                            claimId: claim.id,
                            payoutAmount: payout,
                            transactionIds: [transfer.fromTx.id, transfer.toTx.id]
                        });
                    }
                    catch (err) {
                        console.error(`CRITICAL: Checkpoint failed after BINGO payout (claim ${claim.id}, game ${game.id}):`, err);
                    }
                }
            }
            game.remainingPrizePool = this.roundCurrency(Math.max(0, game.remainingPrizePool - payout));
            game.remainingPayoutBudget = this.roundCurrency(Math.max(0, game.remainingPayoutBudget - payout));
            game.status = "ENDED";
            game.endedAt = endedAt.toISOString();
            game.endedReason = "BINGO_CLAIMED";
            this.finishPlaySessionsForGame(room, game, endedAt.getTime());
            const rtpBudgetAfter = this.roundCurrency(Math.max(0, game.remainingPayoutBudget));
            claim.payoutAmount = payout;
            claim.payoutPolicyVersion = cappedBingoPayout.policy.id;
            claim.payoutWasCapped = payout < requestedPayout;
            claim.rtpBudgetBefore = rtpBudgetBefore;
            claim.rtpBudgetAfter = rtpBudgetAfter;
            claim.rtpCapped = payout < requestedAfterPolicyAndPool;
        }
        if (this.bingoAdapter.onClaimLogged) {
            await this.bingoAdapter.onClaimLogged({
                roomCode: room.code,
                gameId: game.id,
                playerId: player.id,
                type: input.type,
                valid: claim.valid,
                reason: claim.reason
            });
        }
        return claim;
    }
    async endGame(input) {
        const room = this.requireRoom(input.roomCode);
        this.assertHost(room, input.actorPlayerId);
        const host = this.requirePlayer(room, input.actorPlayerId);
        this.assertWalletAllowedForGameplay(host.walletId, Date.now());
        const game = this.requireRunningGame(room);
        const endedAt = new Date();
        game.status = "ENDED";
        game.endedAt = endedAt.toISOString();
        game.endedReason = input.reason?.trim() || "MANUAL_END";
        this.finishPlaySessionsForGame(room, game, endedAt.getTime());
        // BIN-48: Synchronous checkpoint after game end
        if (this.bingoAdapter.onCheckpoint) {
            try {
                await this.bingoAdapter.onCheckpoint({
                    roomCode: room.code,
                    gameId: game.id,
                    reason: "GAME_END"
                });
            }
            catch (err) {
                console.error(`CRITICAL: Checkpoint failed after game end (game ${game.id}):`, err);
            }
        }
    }
    getRoomSnapshot(roomCode) {
        const room = this.requireRoom(roomCode.trim().toUpperCase());
        return this.serializeRoom(room);
    }
    getAllRoomCodes() {
        return [...this.rooms.keys()];
    }
    listRoomSummaries() {
        return [...this.rooms.values()]
            .map((room) => {
            const gameStatus = room.currentGame
                ? room.currentGame.status
                : "NONE";
            return {
                code: room.code,
                hallId: room.hallId,
                hostPlayerId: room.hostPlayerId,
                playerCount: room.players.size,
                createdAt: room.createdAt,
                gameStatus
            };
        })
            .sort((a, b) => a.code.localeCompare(b.code));
    }
    getPlayerCompliance(walletId, hallId) {
        const normalizedWalletId = walletId.trim();
        if (!normalizedWalletId) {
            throw new DomainError("INVALID_INPUT", "walletId mangler.");
        }
        const normalizedHallId = hallId?.trim() || undefined;
        const nowMs = Date.now();
        const personalLossLimits = this.getEffectiveLossLimits(normalizedWalletId, normalizedHallId);
        const netLoss = this.calculateNetLoss(normalizedWalletId, nowMs, normalizedHallId);
        const pauseState = this.getPlaySessionState(normalizedWalletId, nowMs);
        const restrictionState = this.getRestrictionState(normalizedWalletId, nowMs);
        const blockState = this.resolveGameplayBlock(normalizedWalletId, nowMs);
        return {
            walletId: normalizedWalletId,
            hallId: normalizedHallId,
            regulatoryLossLimits: { ...this.regulatoryLossLimits },
            personalLossLimits,
            netLoss,
            pause: {
                isOnPause: pauseState.pauseUntilMs !== undefined && pauseState.pauseUntilMs > nowMs,
                pauseUntil: pauseState.pauseUntilMs !== undefined && pauseState.pauseUntilMs > nowMs
                    ? new Date(pauseState.pauseUntilMs).toISOString()
                    : undefined,
                accumulatedPlayMs: pauseState.accumulatedMs,
                playSessionLimitMs: this.playSessionLimitMs,
                pauseDurationMs: this.pauseDurationMs,
                lastMandatoryBreak: pauseState.lastMandatoryBreak
                    ? {
                        triggeredAt: new Date(pauseState.lastMandatoryBreak.triggeredAtMs).toISOString(),
                        pauseUntil: new Date(pauseState.lastMandatoryBreak.pauseUntilMs).toISOString(),
                        totalPlayMs: pauseState.lastMandatoryBreak.totalPlayMs,
                        hallId: pauseState.lastMandatoryBreak.hallId,
                        netLoss: { ...pauseState.lastMandatoryBreak.netLoss }
                    }
                    : undefined
            },
            restrictions: {
                isBlocked: Boolean(blockState),
                blockedBy: blockState?.type,
                blockedUntil: blockState ? new Date(blockState.untilMs).toISOString() : undefined,
                timedPause: {
                    isActive: restrictionState.timedPauseUntilMs !== undefined && restrictionState.timedPauseUntilMs > nowMs,
                    pauseUntil: restrictionState.timedPauseUntilMs !== undefined && restrictionState.timedPauseUntilMs > nowMs
                        ? new Date(restrictionState.timedPauseUntilMs).toISOString()
                        : undefined,
                    setAt: restrictionState.timedPauseSetAtMs !== undefined
                        ? new Date(restrictionState.timedPauseSetAtMs).toISOString()
                        : undefined
                },
                selfExclusion: {
                    isActive: restrictionState.selfExcludedAtMs !== undefined &&
                        restrictionState.selfExclusionMinimumUntilMs !== undefined,
                    setAt: restrictionState.selfExcludedAtMs !== undefined
                        ? new Date(restrictionState.selfExcludedAtMs).toISOString()
                        : undefined,
                    minimumUntil: restrictionState.selfExclusionMinimumUntilMs !== undefined
                        ? new Date(restrictionState.selfExclusionMinimumUntilMs).toISOString()
                        : undefined,
                    canBeRemoved: restrictionState.selfExclusionMinimumUntilMs !== undefined
                        ? nowMs >= restrictionState.selfExclusionMinimumUntilMs
                        : false
                }
            }
        };
    }
    setPlayerLossLimits(input) {
        const walletId = input.walletId.trim();
        if (!walletId) {
            throw new DomainError("INVALID_INPUT", "walletId mangler.");
        }
        const hallId = input.hallId.trim();
        if (!hallId) {
            throw new DomainError("INVALID_INPUT", "hallId mangler.");
        }
        const current = this.getEffectiveLossLimits(walletId, hallId);
        const daily = input.daily ?? current.daily;
        const monthly = input.monthly ?? current.monthly;
        if (!Number.isFinite(daily) || daily < 0) {
            throw new DomainError("INVALID_INPUT", "dailyLossLimit må være 0 eller større.");
        }
        if (!Number.isFinite(monthly) || monthly < 0) {
            throw new DomainError("INVALID_INPUT", "monthlyLossLimit må være 0 eller større.");
        }
        if (daily > this.regulatoryLossLimits.daily) {
            throw new DomainError("INVALID_INPUT", `dailyLossLimit kan ikke være høyere enn regulatorisk grense (${this.regulatoryLossLimits.daily}).`);
        }
        if (monthly > this.regulatoryLossLimits.monthly) {
            throw new DomainError("INVALID_INPUT", `monthlyLossLimit kan ikke være høyere enn regulatorisk grense (${this.regulatoryLossLimits.monthly}).`);
        }
        this.personalLossLimitsByScope.set(this.makeLossScopeKey(walletId, hallId), {
            daily: Math.floor(daily),
            monthly: Math.floor(monthly)
        });
        return this.getPlayerCompliance(walletId, hallId);
    }
    setTimedPause(input) {
        const walletId = input.walletId.trim();
        if (!walletId) {
            throw new DomainError("INVALID_INPUT", "walletId mangler.");
        }
        const nowMs = Date.now();
        const durationFromMinutes = input.durationMinutes !== undefined ? Math.floor(Number(input.durationMinutes) * 60 * 1000) : undefined;
        const rawDurationMs = input.durationMs ?? durationFromMinutes ?? 15 * 60 * 1000;
        if (!Number.isFinite(rawDurationMs) || rawDurationMs <= 0) {
            throw new DomainError("INVALID_INPUT", "duration må være større enn 0.");
        }
        const durationMs = Math.floor(rawDurationMs);
        const untilMs = nowMs + durationMs;
        const state = this.getRestrictionState(walletId, nowMs);
        state.timedPauseSetAtMs = nowMs;
        state.timedPauseUntilMs = Math.max(untilMs, state.timedPauseUntilMs ?? 0);
        this.restrictionsByWallet.set(walletId, state);
        return this.getPlayerCompliance(walletId);
    }
    clearTimedPause(walletIdInput) {
        const walletId = walletIdInput.trim();
        if (!walletId) {
            throw new DomainError("INVALID_INPUT", "walletId mangler.");
        }
        const nowMs = Date.now();
        const state = this.getRestrictionState(walletId, nowMs);
        if (state.timedPauseUntilMs !== undefined && state.timedPauseUntilMs > nowMs) {
            throw new DomainError("TIMED_PAUSE_LOCKED", `Frivillig pause kan ikke oppheves før ${new Date(state.timedPauseUntilMs).toISOString()}.`);
        }
        state.timedPauseUntilMs = undefined;
        state.timedPauseSetAtMs = undefined;
        this.persistRestrictionState(walletId, state);
        return this.getPlayerCompliance(walletId);
    }
    setSelfExclusion(walletIdInput) {
        const walletId = walletIdInput.trim();
        if (!walletId) {
            throw new DomainError("INVALID_INPUT", "walletId mangler.");
        }
        const nowMs = Date.now();
        const state = this.getRestrictionState(walletId, nowMs);
        if (state.selfExcludedAtMs !== undefined && state.selfExclusionMinimumUntilMs !== undefined) {
            return this.getPlayerCompliance(walletId);
        }
        state.selfExcludedAtMs = nowMs;
        state.selfExclusionMinimumUntilMs = nowMs + this.selfExclusionMinMs;
        this.restrictionsByWallet.set(walletId, state);
        return this.getPlayerCompliance(walletId);
    }
    clearSelfExclusion(walletIdInput) {
        const walletId = walletIdInput.trim();
        if (!walletId) {
            throw new DomainError("INVALID_INPUT", "walletId mangler.");
        }
        const nowMs = Date.now();
        const state = this.getRestrictionState(walletId, nowMs);
        if (state.selfExcludedAtMs === undefined || state.selfExclusionMinimumUntilMs === undefined) {
            return this.getPlayerCompliance(walletId);
        }
        if (nowMs < state.selfExclusionMinimumUntilMs) {
            throw new DomainError("SELF_EXCLUSION_LOCKED", `Selvutelukkelse kan ikke oppheves før ${new Date(state.selfExclusionMinimumUntilMs).toISOString()}.`);
        }
        state.selfExcludedAtMs = undefined;
        state.selfExclusionMinimumUntilMs = undefined;
        this.persistRestrictionState(walletId, state);
        return this.getPlayerCompliance(walletId);
    }
    assertWalletAllowedForGameplay(walletIdInput, nowMs = Date.now()) {
        const walletId = walletIdInput.trim();
        if (!walletId) {
            return;
        }
        const blockState = this.resolveGameplayBlock(walletId, nowMs);
        if (!blockState) {
            return;
        }
        if (blockState.type === "TIMED_PAUSE") {
            throw new DomainError("PLAYER_TIMED_PAUSE", `Spiller er på frivillig pause til ${new Date(blockState.untilMs).toISOString()}.`);
        }
        throw new DomainError("PLAYER_SELF_EXCLUDED", `Spiller er selvutestengt minst til ${new Date(blockState.untilMs).toISOString()}.`);
    }
    upsertPrizePolicy(input) {
        const nowMs = Date.now();
        const gameType = input.gameType ?? "DATABINGO";
        const hallId = this.normalizePolicyDimension(input.hallId);
        const linkId = this.normalizePolicyDimension(input.linkId);
        const effectiveFromMs = this.assertIsoTimestampMs(input.effectiveFrom, "effectiveFrom");
        let inheritedSinglePrizeCap;
        let inheritedDailyExtraPrizeCap;
        if (input.singlePrizeCap === undefined || input.dailyExtraPrizeCap === undefined) {
            try {
                const current = this.resolvePrizePolicy({
                    gameType,
                    hallId,
                    linkId,
                    atMs: effectiveFromMs
                });
                inheritedSinglePrizeCap = current.singlePrizeCap;
                inheritedDailyExtraPrizeCap = current.dailyExtraPrizeCap;
            }
            catch (error) {
                if (!(error instanceof DomainError) || error.code !== "PRIZE_POLICY_MISSING") {
                    throw error;
                }
            }
        }
        const singlePrizeCap = this.assertNonNegativeNumber(input.singlePrizeCap ?? inheritedSinglePrizeCap ?? 2500, "singlePrizeCap");
        const dailyExtraPrizeCap = this.assertNonNegativeNumber(input.dailyExtraPrizeCap ?? inheritedDailyExtraPrizeCap ?? 12000, "dailyExtraPrizeCap");
        const policy = {
            id: randomUUID(),
            gameType,
            hallId,
            linkId,
            effectiveFromMs,
            singlePrizeCap: Math.floor(singlePrizeCap),
            dailyExtraPrizeCap: Math.floor(dailyExtraPrizeCap),
            createdAtMs: nowMs
        };
        const scopeKey = this.makePrizePolicyScopeKey(gameType, hallId, linkId);
        const existing = this.prizePoliciesByScope.get(scopeKey) ?? [];
        const withoutSameEffectiveFrom = existing.filter((entry) => entry.effectiveFromMs !== effectiveFromMs);
        withoutSameEffectiveFrom.push(policy);
        withoutSameEffectiveFrom.sort((a, b) => a.effectiveFromMs - b.effectiveFromMs);
        this.prizePoliciesByScope.set(scopeKey, withoutSameEffectiveFrom);
        return this.toPrizePolicySnapshot(policy);
    }
    getActivePrizePolicy(input) {
        const hallId = this.assertHallId(input.hallId);
        const linkId = input.linkId?.trim() || hallId;
        const atMs = input.at ? this.assertIsoTimestampMs(input.at, "at") : Date.now();
        const policy = this.resolvePrizePolicy({
            hallId,
            linkId,
            gameType: input.gameType ?? "DATABINGO",
            atMs
        });
        return this.toPrizePolicySnapshot(policy);
    }
    async awardExtraPrize(input) {
        const walletId = input.walletId.trim();
        const hallId = this.assertHallId(input.hallId);
        const linkId = input.linkId?.trim() || hallId;
        if (!walletId) {
            throw new DomainError("INVALID_INPUT", "walletId mangler.");
        }
        const amount = this.assertNonNegativeNumber(input.amount, "amount");
        if (amount <= 0) {
            throw new DomainError("INVALID_INPUT", "amount må være større enn 0.");
        }
        const nowMs = Date.now();
        const policy = this.resolvePrizePolicy({
            hallId,
            linkId,
            gameType: "DATABINGO",
            atMs: nowMs
        });
        if (amount > policy.singlePrizeCap) {
            throw new DomainError("PRIZE_POLICY_VIOLATION", `Ekstrapremie ${amount} overstiger maks enkeltpremie (${policy.singlePrizeCap}).`);
        }
        const scopeKey = this.makeExtraPrizeScopeKey(hallId, linkId);
        const todayStartMs = this.startOfLocalDayMs(nowMs);
        const existingEntries = (this.extraPrizeEntriesByScope.get(scopeKey) ?? []).filter((entry) => entry.createdAtMs >= todayStartMs);
        const usedToday = existingEntries.reduce((sum, entry) => sum + entry.amount, 0);
        if (usedToday + amount > policy.dailyExtraPrizeCap) {
            throw new DomainError("EXTRA_PRIZE_DAILY_LIMIT_EXCEEDED", `Ekstrapremie overstiger daglig grense (${policy.dailyExtraPrizeCap}) for link ${linkId}.`);
        }
        const gameType = "DATABINGO";
        const channel = "INTERNET";
        const sourceAccountId = this.makeHouseAccountId(hallId, gameType, channel);
        const transfer = await this.walletAdapter.transfer(sourceAccountId, walletId, amount, input.reason?.trim() || `Extra prize ${hallId}/${linkId}`);
        this.recordLossEntry(walletId, hallId, {
            type: "PAYOUT",
            amount,
            createdAtMs: nowMs
        });
        this.recordComplianceLedgerEvent({
            hallId,
            gameType,
            channel,
            eventType: "EXTRA_PRIZE",
            amount,
            walletId,
            sourceAccountId: transfer.fromTx.accountId,
            targetAccountId: transfer.toTx.accountId,
            policyVersion: policy.id,
            metadata: {
                linkId
            }
        });
        this.appendPayoutAuditEvent({
            kind: "EXTRA_PRIZE",
            hallId,
            policyVersion: policy.id,
            amount,
            walletId,
            sourceAccountId,
            txIds: [transfer.fromTx.id, transfer.toTx.id]
        });
        existingEntries.push({
            amount,
            createdAtMs: nowMs,
            policyId: policy.id
        });
        this.extraPrizeEntriesByScope.set(scopeKey, existingEntries);
        return {
            walletId,
            hallId,
            linkId,
            amount,
            policyId: policy.id,
            remainingDailyExtraPrizeLimit: Math.max(0, policy.dailyExtraPrizeCap - (usedToday + amount))
        };
    }
    rejectExtraDrawPurchase(input) {
        const source = input.source ?? "UNKNOWN";
        let hallId;
        let walletId;
        let normalizedRoomCode;
        let playerId;
        if (input.roomCode?.trim()) {
            normalizedRoomCode = input.roomCode.trim().toUpperCase();
            const room = this.requireRoom(normalizedRoomCode);
            hallId = room.hallId;
            if (input.playerId?.trim()) {
                playerId = input.playerId.trim();
                const player = this.requirePlayer(room, playerId);
                walletId = player.walletId;
            }
        }
        if (!walletId && input.walletId?.trim()) {
            walletId = input.walletId.trim();
        }
        const event = {
            id: randomUUID(),
            createdAt: new Date().toISOString(),
            source,
            roomCode: normalizedRoomCode,
            playerId,
            walletId,
            hallId,
            reasonCode: "EXTRA_DRAW_NOT_ALLOWED",
            metadata: input.metadata
        };
        this.extraDrawDenials.unshift(event);
        if (this.extraDrawDenials.length > 1000) {
            this.extraDrawDenials.length = 1000;
        }
        throw new DomainError("EXTRA_DRAW_NOT_ALLOWED", "Ekstratrekk er ikke tillatt for databingo. Forsøket er logget for revisjon.");
    }
    listExtraDrawDenials(limit = 100) {
        const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 100;
        return this.extraDrawDenials.slice(0, normalizedLimit).map((entry) => ({ ...entry }));
    }
    listPayoutAuditTrail(input) {
        const limit = Number.isFinite(input?.limit) ? Math.max(1, Math.min(500, Math.floor(input.limit))) : 100;
        const hallId = input?.hallId?.trim();
        const gameId = input?.gameId?.trim();
        const walletId = input?.walletId?.trim();
        return this.payoutAuditTrail
            .filter((event) => {
            if (hallId && event.hallId !== hallId) {
                return false;
            }
            if (gameId && event.gameId !== gameId) {
                return false;
            }
            if (walletId && event.walletId !== walletId) {
                return false;
            }
            return true;
        })
            .slice(0, limit)
            .map((event) => ({ ...event, txIds: [...event.txIds] }));
    }
    listComplianceLedgerEntries(input) {
        const limit = Number.isFinite(input?.limit) ? Math.max(1, Math.min(2000, Math.floor(input.limit))) : 200;
        const fromMs = input?.dateFrom ? this.assertIsoTimestampMs(input.dateFrom, "dateFrom") : undefined;
        const toMs = input?.dateTo ? this.assertIsoTimestampMs(input.dateTo, "dateTo") : undefined;
        const hallId = input?.hallId?.trim();
        const gameType = input?.gameType ? this.assertLedgerGameType(input.gameType) : undefined;
        const channel = input?.channel ? this.assertLedgerChannel(input.channel) : undefined;
        return this.complianceLedger
            .filter((entry) => {
            if (fromMs !== undefined && entry.createdAtMs < fromMs) {
                return false;
            }
            if (toMs !== undefined && entry.createdAtMs > toMs) {
                return false;
            }
            if (hallId && entry.hallId !== hallId) {
                return false;
            }
            if (gameType && entry.gameType !== gameType) {
                return false;
            }
            if (channel && entry.channel !== channel) {
                return false;
            }
            return true;
        })
            .slice(0, limit)
            .map((entry) => ({ ...entry }));
    }
    recordAccountingEvent(input) {
        this.recordComplianceLedgerEvent({
            hallId: input.hallId,
            gameType: input.gameType,
            channel: input.channel,
            eventType: input.eventType,
            amount: input.amount,
            metadata: input.metadata
        });
        const latest = this.complianceLedger[0];
        return { ...latest };
    }
    generateDailyReport(input) {
        const dateKey = this.assertDateKey(input.date, "date");
        const hallId = input.hallId?.trim();
        const gameType = input.gameType ? this.assertLedgerGameType(input.gameType) : undefined;
        const channel = input.channel ? this.assertLedgerChannel(input.channel) : undefined;
        const dateRange = this.dayRangeMs(dateKey);
        const rowsByKey = new Map();
        for (const entry of this.complianceLedger) {
            if (entry.createdAtMs < dateRange.startMs || entry.createdAtMs > dateRange.endMs) {
                continue;
            }
            if (hallId && entry.hallId !== hallId) {
                continue;
            }
            if (gameType && entry.gameType !== gameType) {
                continue;
            }
            if (channel && entry.channel !== channel) {
                continue;
            }
            const key = `${entry.hallId}::${entry.gameType}::${entry.channel}`;
            const row = rowsByKey.get(key) ?? {
                hallId: entry.hallId,
                gameType: entry.gameType,
                channel: entry.channel,
                grossTurnover: 0,
                prizesPaid: 0,
                net: 0,
                stakeCount: 0,
                prizeCount: 0,
                extraPrizeCount: 0
            };
            if (entry.eventType === "STAKE") {
                row.grossTurnover += entry.amount;
                row.stakeCount += 1;
            }
            if (entry.eventType === "PRIZE") {
                row.prizesPaid += entry.amount;
                row.prizeCount += 1;
            }
            if (entry.eventType === "EXTRA_PRIZE") {
                row.prizesPaid += entry.amount;
                row.extraPrizeCount += 1;
            }
            row.net = row.grossTurnover - row.prizesPaid;
            rowsByKey.set(key, row);
        }
        const rows = [...rowsByKey.values()].sort((a, b) => {
            const byHall = a.hallId.localeCompare(b.hallId);
            if (byHall !== 0) {
                return byHall;
            }
            const byGame = a.gameType.localeCompare(b.gameType);
            if (byGame !== 0) {
                return byGame;
            }
            return a.channel.localeCompare(b.channel);
        });
        const totals = rows.reduce((acc, row) => {
            acc.grossTurnover += row.grossTurnover;
            acc.prizesPaid += row.prizesPaid;
            acc.net += row.net;
            acc.stakeCount += row.stakeCount;
            acc.prizeCount += row.prizeCount;
            acc.extraPrizeCount += row.extraPrizeCount;
            return acc;
        }, {
            grossTurnover: 0,
            prizesPaid: 0,
            net: 0,
            stakeCount: 0,
            prizeCount: 0,
            extraPrizeCount: 0
        });
        return {
            date: dateKey,
            generatedAt: new Date().toISOString(),
            rows,
            totals
        };
    }
    runDailyReportJob(input) {
        const date = input?.date ?? this.dateKeyFromMs(Date.now());
        const report = this.generateDailyReport({
            date,
            hallId: input?.hallId,
            gameType: input?.gameType,
            channel: input?.channel
        });
        this.dailyReportArchive.set(report.date, report);
        return report;
    }
    getArchivedDailyReport(dateInput) {
        const date = this.assertDateKey(dateInput, "date");
        const archived = this.dailyReportArchive.get(date);
        if (!archived) {
            return null;
        }
        return {
            ...archived,
            rows: archived.rows.map((row) => ({ ...row })),
            totals: { ...archived.totals }
        };
    }
    exportDailyReportCsv(input) {
        const report = this.generateDailyReport(input);
        const headers = [
            "date",
            "hall_id",
            "game_type",
            "channel",
            "gross_turnover",
            "prizes_paid",
            "net",
            "stake_count",
            "prize_count",
            "extra_prize_count"
        ];
        const lines = [headers.join(",")];
        for (const row of report.rows) {
            lines.push([
                report.date,
                row.hallId,
                row.gameType,
                row.channel,
                row.grossTurnover,
                row.prizesPaid,
                row.net,
                row.stakeCount,
                row.prizeCount,
                row.extraPrizeCount
            ].join(","));
        }
        lines.push([
            report.date,
            "ALL",
            "ALL",
            "ALL",
            report.totals.grossTurnover,
            report.totals.prizesPaid,
            report.totals.net,
            report.totals.stakeCount,
            report.totals.prizeCount,
            report.totals.extraPrizeCount
        ].join(","));
        return lines.join("\n");
    }
    async createOverskuddDistributionBatch(input) {
        const date = this.assertDateKey(input.date, "date");
        const allocations = this.assertOrganizationAllocations(input.allocations);
        const report = this.generateDailyReport({
            date,
            hallId: input.hallId,
            gameType: input.gameType,
            channel: input.channel
        });
        const rowsWithMinimum = report.rows
            .map((row) => {
            const minimumPercent = row.gameType === "DATABINGO" ? 0.3 : 0.15;
            const net = Math.max(0, row.net);
            const minimumAmount = this.roundCurrency(net * minimumPercent);
            return {
                row,
                minimumPercent,
                minimumAmount
            };
        })
            .filter((entry) => entry.minimumAmount > 0);
        const requiredMinimum = this.roundCurrency(rowsWithMinimum.reduce((sum, entry) => sum + entry.minimumAmount, 0));
        const batchId = randomUUID();
        const createdAt = new Date().toISOString();
        const transfers = [];
        for (const { row, minimumAmount } of rowsWithMinimum) {
            const sourceAccountId = this.makeHouseAccountId(row.hallId, row.gameType, row.channel);
            const parts = this.allocateAmountByShares(minimumAmount, allocations.map((allocation) => allocation.sharePercent));
            for (let i = 0; i < allocations.length; i += 1) {
                const amount = parts[i];
                if (amount <= 0) {
                    continue;
                }
                const allocation = allocations[i];
                const transfer = await this.walletAdapter.transfer(sourceAccountId, allocation.organizationAccountId, amount, `Overskudd ${batchId} ${date}`);
                const record = {
                    id: randomUUID(),
                    batchId,
                    createdAt: new Date().toISOString(),
                    date,
                    hallId: row.hallId,
                    gameType: row.gameType,
                    channel: row.channel,
                    sourceAccountId,
                    organizationId: allocation.organizationId,
                    organizationAccountId: allocation.organizationAccountId,
                    amount,
                    txIds: [transfer.fromTx.id, transfer.toTx.id]
                };
                transfers.push(record);
                this.recordComplianceLedgerEvent({
                    hallId: row.hallId,
                    gameType: row.gameType,
                    channel: row.channel,
                    eventType: "ORG_DISTRIBUTION",
                    amount,
                    sourceAccountId,
                    targetAccountId: allocation.organizationAccountId,
                    batchId,
                    metadata: {
                        organizationId: allocation.organizationId,
                        date
                    }
                });
            }
        }
        const distributedAmount = this.roundCurrency(transfers.reduce((sum, transfer) => sum + transfer.amount, 0));
        const batch = {
            id: batchId,
            createdAt,
            date,
            hallId: input.hallId?.trim() || undefined,
            gameType: input.gameType ? this.assertLedgerGameType(input.gameType) : undefined,
            channel: input.channel ? this.assertLedgerChannel(input.channel) : undefined,
            requiredMinimum,
            distributedAmount,
            transfers: transfers.map((transfer) => ({ ...transfer, txIds: [...transfer.txIds] })),
            allocations: allocations.map((allocation) => ({ ...allocation }))
        };
        this.overskuddBatches.set(batchId, batch);
        return batch;
    }
    getOverskuddDistributionBatch(batchIdInput) {
        const batchId = batchIdInput.trim();
        if (!batchId) {
            throw new DomainError("INVALID_INPUT", "batchId mangler.");
        }
        const batch = this.overskuddBatches.get(batchId);
        if (!batch) {
            throw new DomainError("BATCH_NOT_FOUND", "Fordelingsbatch finnes ikke.");
        }
        return {
            ...batch,
            transfers: batch.transfers.map((transfer) => ({ ...transfer, txIds: [...transfer.txIds] })),
            allocations: batch.allocations.map((allocation) => ({ ...allocation }))
        };
    }
    async refreshPlayerBalancesForWallet(walletId) {
        const normalizedWalletId = walletId.trim();
        if (!normalizedWalletId) {
            return [];
        }
        const balance = await this.walletAdapter.getBalance(normalizedWalletId);
        const affected = new Set();
        for (const room of this.rooms.values()) {
            let roomChanged = false;
            for (const player of room.players.values()) {
                if (player.walletId === normalizedWalletId) {
                    player.balance = balance;
                    roomChanged = true;
                }
            }
            if (roomChanged) {
                affected.add(room.code);
            }
        }
        return [...affected];
    }
    attachPlayerSocket(roomCode, playerId, socketId) {
        const room = this.requireRoom(roomCode.trim().toUpperCase());
        const player = this.requirePlayer(room, playerId);
        this.assertWalletAllowedForGameplay(player.walletId, Date.now());
        player.socketId = socketId;
    }
    detachSocket(socketId) {
        for (const room of this.rooms.values()) {
            for (const player of room.players.values()) {
                if (player.socketId === socketId) {
                    player.socketId = undefined;
                    return { roomCode: room.code, playerId: player.id };
                }
            }
        }
        return null;
    }
    archiveIfEnded(room) {
        if (room.currentGame?.status === "ENDED") {
            room.gameHistory.push(this.serializeGame(room.currentGame));
            room.currentGame = undefined;
        }
    }
    async refreshPlayerObjectsFromWallet(players) {
        await Promise.all(players.map(async (player) => {
            player.balance = await this.walletAdapter.getBalance(player.walletId);
        }));
    }
    async ensureSufficientBalance(players, entryFee) {
        const balances = await Promise.all(players.map(async (player) => ({
            player,
            balance: await this.walletAdapter.getBalance(player.walletId)
        })));
        const missing = balances.find(({ balance }) => balance < entryFee);
        if (missing) {
            throw new DomainError("INSUFFICIENT_FUNDS", `Spiller ${missing.player.name} har ikke nok saldo til buy-in.`);
        }
    }
    assertPlayersNotInAnotherRunningGame(roomCode, players) {
        const walletIds = new Set(players.map((player) => player.walletId));
        if (walletIds.size === 0) {
            return;
        }
        for (const otherRoom of this.rooms.values()) {
            if (otherRoom.code === roomCode) {
                continue;
            }
            if (otherRoom.currentGame?.status !== "RUNNING") {
                continue;
            }
            for (const otherPlayer of otherRoom.players.values()) {
                if (!walletIds.has(otherPlayer.walletId)) {
                    continue;
                }
                throw new DomainError("PLAYER_ALREADY_IN_RUNNING_GAME", `Spiller ${otherPlayer.name} deltar allerede i et annet aktivt spill (rom ${otherRoom.code}).`);
            }
        }
    }
    assertPlayersNotBlockedByRestriction(players, nowMs) {
        for (const player of players) {
            this.assertWalletAllowedForGameplay(player.walletId, nowMs);
        }
    }
    assertWalletNotInRunningGame(walletId, exceptRoomCode) {
        const normalizedWalletId = walletId.trim();
        if (!normalizedWalletId) {
            return;
        }
        for (const room of this.rooms.values()) {
            if (exceptRoomCode && room.code === exceptRoomCode) {
                continue;
            }
            if (room.currentGame?.status !== "RUNNING") {
                continue;
            }
            for (const player of room.players.values()) {
                if (player.walletId !== normalizedWalletId) {
                    continue;
                }
                throw new DomainError("PLAYER_ALREADY_IN_RUNNING_GAME", `Spiller ${player.name} deltar allerede i et annet aktivt spill (rom ${room.code}).`);
            }
        }
    }
    assertWalletNotAlreadyInRoom(room, walletId) {
        const normalizedWalletId = walletId.trim();
        if (!normalizedWalletId) {
            return;
        }
        const existing = [...room.players.values()].find((player) => player.walletId === normalizedWalletId);
        if (existing) {
            throw new DomainError("PLAYER_ALREADY_IN_ROOM", `Spiller ${existing.name} finnes allerede i rommet. Bruk room:resume for reconnect.`);
        }
    }
    assertRoundStartInterval(room, nowMs) {
        const lastRoundStartMs = this.resolveLastRoundStartMs(room);
        if (lastRoundStartMs === undefined) {
            return;
        }
        const elapsedMs = nowMs - lastRoundStartMs;
        if (elapsedMs >= this.minRoundIntervalMs) {
            return;
        }
        const remainingSeconds = Math.ceil((this.minRoundIntervalMs - elapsedMs) / 1000);
        throw new DomainError("ROUND_START_TOO_SOON", `Det må gå minst ${Math.ceil(this.minRoundIntervalMs / 1000)} sekunder mellom spillstarter. Vent ${remainingSeconds} sekunder.`);
    }
    resolveLastRoundStartMs(room) {
        const cached = this.roomLastRoundStartMs.get(room.code);
        if (cached !== undefined) {
            return cached;
        }
        const candidates = [];
        const currentGameStartMs = room.currentGame ? Date.parse(room.currentGame.startedAt) : Number.NaN;
        if (Number.isFinite(currentGameStartMs)) {
            candidates.push(currentGameStartMs);
        }
        if (room.gameHistory.length > 0) {
            const latestHistoricGame = room.gameHistory[room.gameHistory.length - 1];
            const historicStartMs = Date.parse(latestHistoricGame.startedAt);
            if (Number.isFinite(historicStartMs)) {
                candidates.push(historicStartMs);
            }
        }
        if (candidates.length === 0) {
            return undefined;
        }
        const latest = Math.max(...candidates);
        this.roomLastRoundStartMs.set(room.code, latest);
        return latest;
    }
    assertPlayersNotOnRequiredPause(players, nowMs) {
        for (const player of players) {
            const state = this.playStateByWallet.get(player.walletId);
            if (!state?.pauseUntilMs) {
                continue;
            }
            if (state.pauseUntilMs > nowMs) {
                const summary = state.lastMandatoryBreak;
                const summaryText = summary
                    ? ` Påkrevd pause trigget etter ${Math.ceil(summary.totalPlayMs / 60000)} min spill. Netto tap i hall ${summary.hallId}: dag ${summary.netLoss.daily}, måned ${summary.netLoss.monthly}.`
                    : "";
                throw new DomainError("PLAYER_ON_REQUIRED_PAUSE", `Spiller ${player.name} må ha pause til ${new Date(state.pauseUntilMs).toISOString()}.${summaryText}`);
            }
            state.pauseUntilMs = undefined;
            state.accumulatedMs = 0;
            this.playStateByWallet.set(player.walletId, state);
        }
    }
    async assertLossLimitsBeforeBuyIn(players, entryFee, nowMs, hallId) {
        if (entryFee <= 0) {
            return;
        }
        for (const player of players) {
            const limits = this.getEffectiveLossLimits(player.walletId, hallId);
            const netLoss = this.calculateNetLoss(player.walletId, nowMs, hallId);
            if (netLoss.daily + entryFee > limits.daily) {
                throw new DomainError("DAILY_LOSS_LIMIT_EXCEEDED", `Spiller ${player.name} overstiger daglig tapsgrense (${limits.daily}).`);
            }
            if (netLoss.monthly + entryFee > limits.monthly) {
                throw new DomainError("MONTHLY_LOSS_LIMIT_EXCEEDED", `Spiller ${player.name} overstiger månedlig tapsgrense (${limits.monthly}).`);
            }
        }
    }
    getEffectiveLossLimits(walletId, hallId) {
        if (!hallId) {
            return { ...this.regulatoryLossLimits };
        }
        const customLimits = this.personalLossLimitsByScope.get(this.makeLossScopeKey(walletId, hallId));
        if (!customLimits) {
            return { ...this.regulatoryLossLimits };
        }
        return {
            daily: Math.min(customLimits.daily, this.regulatoryLossLimits.daily),
            monthly: Math.min(customLimits.monthly, this.regulatoryLossLimits.monthly)
        };
    }
    calculateNetLoss(walletId, nowMs, hallId) {
        const dayStartMs = this.startOfLocalDayMs(nowMs);
        const monthStartMs = this.startOfLocalMonthMs(nowMs);
        const retentionCutoffMs = monthStartMs - 35 * 24 * 60 * 60 * 1000;
        const entries = hallId
            ? this.getLossEntriesForScope(walletId, hallId, retentionCutoffMs)
            : this.getLossEntriesForAllScopes(walletId, retentionCutoffMs);
        let daily = 0;
        let monthly = 0;
        for (const entry of entries) {
            const signed = entry.type === "BUYIN" ? entry.amount : -entry.amount;
            if (entry.createdAtMs >= monthStartMs) {
                monthly += signed;
                if (entry.createdAtMs >= dayStartMs) {
                    daily += signed;
                }
            }
        }
        return {
            daily: Math.max(0, daily),
            monthly: Math.max(0, monthly)
        };
    }
    getLossEntriesForScope(walletId, hallId, retentionCutoffMs) {
        const scopeKey = this.makeLossScopeKey(walletId, hallId);
        const existing = this.lossEntriesByScope.get(scopeKey) ?? [];
        const pruned = existing.filter((entry) => entry.createdAtMs >= retentionCutoffMs);
        if (pruned.length !== existing.length) {
            this.lossEntriesByScope.set(scopeKey, pruned);
        }
        return pruned;
    }
    getLossEntriesForAllScopes(walletId, retentionCutoffMs) {
        const normalizedWalletId = walletId.trim();
        if (!normalizedWalletId) {
            return [];
        }
        const prefix = `${normalizedWalletId}::`;
        const all = [];
        for (const [scopeKey, entries] of this.lossEntriesByScope.entries()) {
            if (!scopeKey.startsWith(prefix)) {
                continue;
            }
            const pruned = entries.filter((entry) => entry.createdAtMs >= retentionCutoffMs);
            if (pruned.length !== entries.length) {
                this.lossEntriesByScope.set(scopeKey, pruned);
            }
            all.push(...pruned);
        }
        return all;
    }
    makeLossScopeKey(walletId, hallId) {
        return `${walletId.trim()}::${hallId.trim()}`;
    }
    recordLossEntry(walletId, hallId, entry) {
        const normalizedWalletId = walletId.trim();
        const normalizedHallId = hallId.trim();
        if (!normalizedWalletId) {
            return;
        }
        if (!normalizedHallId) {
            return;
        }
        const scopeKey = this.makeLossScopeKey(normalizedWalletId, normalizedHallId);
        const existing = this.lossEntriesByScope.get(scopeKey) ?? [];
        existing.push(entry);
        this.lossEntriesByScope.set(scopeKey, existing);
    }
    startPlaySession(walletId, nowMs) {
        const state = this.playStateByWallet.get(walletId) ?? { accumulatedMs: 0 };
        if (state.pauseUntilMs !== undefined && state.pauseUntilMs <= nowMs) {
            state.pauseUntilMs = undefined;
            state.accumulatedMs = 0;
        }
        if (state.activeFromMs === undefined) {
            state.activeFromMs = nowMs;
        }
        this.playStateByWallet.set(walletId, state);
    }
    finishPlaySessionsForGame(room, game, endedAtMs) {
        const walletToHall = new Map();
        for (const playerId of game.tickets.keys()) {
            const player = room.players.get(playerId);
            if (player) {
                walletToHall.set(player.walletId, room.hallId);
            }
        }
        for (const [walletId, hallId] of walletToHall.entries()) {
            this.finishPlaySession(walletId, hallId, endedAtMs);
        }
        // Fire onGameEnded callback (non-blocking).
        if (this.bingoAdapter.onGameEnded) {
            this.bingoAdapter.onGameEnded({
                roomCode: room.code,
                hallId: room.hallId,
                gameId: game.id,
                entryFee: game.entryFee,
                endedReason: game.endedReason ?? "UNKNOWN",
                drawnNumbers: [...game.drawnNumbers],
                claims: [...game.claims],
                playerIds: [...game.tickets.keys()]
            }).catch((err) => {
                console.error("[BingoEngine] onGameEnded callback failed:", err);
            });
        }
    }
    finishPlaySession(walletId, hallId, endedAtMs) {
        const state = this.playStateByWallet.get(walletId);
        if (!state || state.activeFromMs === undefined) {
            return;
        }
        const elapsedMs = Math.max(0, endedAtMs - state.activeFromMs);
        state.activeFromMs = undefined;
        state.accumulatedMs += elapsedMs;
        if (state.accumulatedMs >= this.playSessionLimitMs) {
            const pauseUntilMs = endedAtMs + this.pauseDurationMs;
            state.pauseUntilMs = pauseUntilMs;
            state.lastMandatoryBreak = {
                triggeredAtMs: endedAtMs,
                pauseUntilMs,
                totalPlayMs: state.accumulatedMs,
                hallId,
                netLoss: this.calculateNetLoss(walletId, endedAtMs, hallId)
            };
            state.accumulatedMs = 0;
        }
        this.playStateByWallet.set(walletId, state);
    }
    getPlaySessionState(walletId, nowMs) {
        const state = this.playStateByWallet.get(walletId) ?? { accumulatedMs: 0 };
        if (state.pauseUntilMs !== undefined && state.pauseUntilMs <= nowMs) {
            state.pauseUntilMs = undefined;
            state.accumulatedMs = 0;
        }
        const activeMs = state.activeFromMs !== undefined ? Math.max(0, nowMs - state.activeFromMs) : 0;
        return {
            ...state,
            accumulatedMs: state.accumulatedMs + activeMs
        };
    }
    makeHouseAccountId(hallId, gameType, channel) {
        return `house-${hallId.trim()}-${gameType.toLowerCase()}-${channel.toLowerCase()}`;
    }
    recordComplianceLedgerEvent(input) {
        const nowMs = Date.now();
        const entry = {
            id: randomUUID(),
            createdAt: new Date(nowMs).toISOString(),
            createdAtMs: nowMs,
            hallId: this.assertHallId(input.hallId),
            gameType: this.assertLedgerGameType(input.gameType),
            channel: this.assertLedgerChannel(input.channel),
            eventType: input.eventType,
            amount: this.roundCurrency(this.assertNonNegativeNumber(input.amount, "amount")),
            currency: "NOK",
            roomCode: input.roomCode?.trim() || undefined,
            gameId: input.gameId?.trim() || undefined,
            claimId: input.claimId?.trim() || undefined,
            playerId: input.playerId?.trim() || undefined,
            walletId: input.walletId?.trim() || undefined,
            sourceAccountId: input.sourceAccountId?.trim() || undefined,
            targetAccountId: input.targetAccountId?.trim() || undefined,
            policyVersion: input.policyVersion?.trim() || undefined,
            batchId: input.batchId?.trim() || undefined,
            metadata: input.metadata
        };
        this.complianceLedger.unshift(entry);
        if (this.complianceLedger.length > 50_000) {
            this.complianceLedger.length = 50_000;
        }
    }
    appendPayoutAuditEvent(input) {
        const now = new Date().toISOString();
        const normalizedTxIds = input.txIds.map((txId) => txId.trim()).filter(Boolean);
        const chainIndex = this.payoutAuditTrail.length + 1;
        const hashPayload = JSON.stringify({
            kind: input.kind,
            claimId: input.claimId,
            gameId: input.gameId,
            roomCode: input.roomCode,
            hallId: input.hallId,
            policyVersion: input.policyVersion,
            amount: input.amount,
            walletId: input.walletId,
            playerId: input.playerId,
            sourceAccountId: input.sourceAccountId,
            txIds: normalizedTxIds,
            createdAt: now,
            previousHash: this.lastPayoutAuditHash,
            chainIndex
        });
        const eventHash = createHash("sha256").update(hashPayload).digest("hex");
        const event = {
            id: randomUUID(),
            createdAt: now,
            claimId: input.claimId?.trim() || undefined,
            gameId: input.gameId?.trim() || undefined,
            roomCode: input.roomCode?.trim() || undefined,
            hallId: this.assertHallId(input.hallId),
            policyVersion: input.policyVersion?.trim() || undefined,
            amount: this.roundCurrency(this.assertNonNegativeNumber(input.amount, "amount")),
            currency: "NOK",
            walletId: input.walletId.trim(),
            playerId: input.playerId?.trim() || undefined,
            sourceAccountId: input.sourceAccountId?.trim() || undefined,
            txIds: normalizedTxIds,
            kind: input.kind,
            chainIndex,
            previousHash: this.lastPayoutAuditHash,
            eventHash
        };
        this.payoutAuditTrail.unshift(event);
        this.lastPayoutAuditHash = eventHash;
        if (this.payoutAuditTrail.length > 10_000) {
            this.payoutAuditTrail.length = 10_000;
        }
    }
    getRestrictionState(walletId, nowMs) {
        const existing = this.restrictionsByWallet.get(walletId) ?? {};
        const next = { ...existing };
        if (next.timedPauseUntilMs !== undefined && next.timedPauseUntilMs <= nowMs) {
            next.timedPauseUntilMs = undefined;
            next.timedPauseSetAtMs = undefined;
        }
        this.persistRestrictionState(walletId, next);
        return next;
    }
    persistRestrictionState(walletId, state) {
        const hasAnyRestriction = state.timedPauseUntilMs !== undefined ||
            state.timedPauseSetAtMs !== undefined ||
            state.selfExcludedAtMs !== undefined ||
            state.selfExclusionMinimumUntilMs !== undefined;
        if (!hasAnyRestriction) {
            this.restrictionsByWallet.delete(walletId);
            return;
        }
        this.restrictionsByWallet.set(walletId, state);
    }
    resolveGameplayBlock(walletId, nowMs) {
        const state = this.getRestrictionState(walletId, nowMs);
        if (state.selfExcludedAtMs !== undefined && state.selfExclusionMinimumUntilMs !== undefined) {
            return {
                type: "SELF_EXCLUDED",
                untilMs: state.selfExclusionMinimumUntilMs
            };
        }
        if (state.timedPauseUntilMs !== undefined && state.timedPauseUntilMs > nowMs) {
            return {
                type: "TIMED_PAUSE",
                untilMs: state.timedPauseUntilMs
            };
        }
        return undefined;
    }
    applySinglePrizeCap(input) {
        const amount = this.assertNonNegativeNumber(input.amount, "amount");
        const atMs = input.atMs ?? Date.now();
        const policy = this.resolvePrizePolicy({
            hallId: input.room.hallId,
            linkId: input.room.hallId,
            gameType: input.gameType,
            atMs
        });
        const cappedAmount = Math.min(amount, policy.singlePrizeCap);
        return {
            cappedAmount,
            wasCapped: cappedAmount < amount,
            policy
        };
    }
    resolvePrizePolicy(input) {
        const hallId = this.normalizePolicyDimension(input.hallId);
        const linkId = this.normalizePolicyDimension(input.linkId);
        const gameType = input.gameType;
        const atMs = input.atMs;
        const candidateScopeKeys = [
            this.makePrizePolicyScopeKey(gameType, hallId, linkId),
            this.makePrizePolicyScopeKey(gameType, hallId, POLICY_WILDCARD),
            this.makePrizePolicyScopeKey(gameType, POLICY_WILDCARD, linkId),
            this.makePrizePolicyScopeKey(gameType, POLICY_WILDCARD, POLICY_WILDCARD)
        ];
        for (const scopeKey of candidateScopeKeys) {
            const versions = this.prizePoliciesByScope.get(scopeKey) ?? [];
            for (let i = versions.length - 1; i >= 0; i -= 1) {
                if (versions[i].effectiveFromMs <= atMs) {
                    return versions[i];
                }
            }
        }
        throw new DomainError("PRIZE_POLICY_MISSING", "Fant ingen aktiv premiepolicy for spill/hall/link.");
    }
    makePrizePolicyScopeKey(gameType, hallId, linkId) {
        return `${gameType}::${hallId}::${linkId}`;
    }
    makeExtraPrizeScopeKey(hallId, linkId) {
        return `${hallId.trim()}::${linkId.trim()}`;
    }
    normalizePolicyDimension(value) {
        if (value === undefined || value === null) {
            return POLICY_WILDCARD;
        }
        const normalized = value.trim();
        if (!normalized) {
            return POLICY_WILDCARD;
        }
        if (normalized.length > 120) {
            throw new DomainError("INVALID_INPUT", "Policy-dimensjon er for lang.");
        }
        return normalized;
    }
    assertIsoTimestampMs(value, fieldName) {
        const normalized = value.trim();
        if (!normalized) {
            throw new DomainError("INVALID_INPUT", `${fieldName} mangler.`);
        }
        const parsed = Date.parse(normalized);
        if (!Number.isFinite(parsed)) {
            throw new DomainError("INVALID_INPUT", `${fieldName} må være ISO-8601 dato/tid.`);
        }
        return parsed;
    }
    assertNonNegativeNumber(value, fieldName) {
        if (!Number.isFinite(value) || value < 0) {
            throw new DomainError("INVALID_INPUT", `${fieldName} må være 0 eller større.`);
        }
        return value;
    }
    toPrizePolicySnapshot(policy) {
        return {
            id: policy.id,
            gameType: policy.gameType,
            hallId: policy.hallId,
            linkId: policy.linkId,
            effectiveFrom: new Date(policy.effectiveFromMs).toISOString(),
            singlePrizeCap: policy.singlePrizeCap,
            dailyExtraPrizeCap: policy.dailyExtraPrizeCap,
            createdAt: new Date(policy.createdAtMs).toISOString()
        };
    }
    assertLedgerGameType(value) {
        const normalized = value.trim().toUpperCase();
        if (normalized === "MAIN_GAME" || normalized === "DATABINGO") {
            return normalized;
        }
        throw new DomainError("INVALID_INPUT", "gameType må være MAIN_GAME eller DATABINGO.");
    }
    assertLedgerChannel(value) {
        const normalized = value.trim().toUpperCase();
        if (normalized === "HALL" || normalized === "INTERNET") {
            return normalized;
        }
        throw new DomainError("INVALID_INPUT", "channel må være HALL eller INTERNET.");
    }
    assertDateKey(value, fieldName) {
        const normalized = value.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
            throw new DomainError("INVALID_INPUT", `${fieldName} må være i format YYYY-MM-DD.`);
        }
        const [yearText, monthText, dayText] = normalized.split("-");
        const year = Number(yearText);
        const month = Number(monthText);
        const day = Number(dayText);
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day) {
            throw new DomainError("INVALID_INPUT", `${fieldName} er ikke en gyldig dato.`);
        }
        return normalized;
    }
    dayRangeMs(dateKey) {
        const normalized = this.assertDateKey(dateKey, "date");
        const [yearText, monthText, dayText] = normalized.split("-");
        const startMs = new Date(Number(yearText), Number(monthText) - 1, Number(dayText)).getTime();
        const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
        return { startMs, endMs };
    }
    dateKeyFromMs(referenceMs) {
        const date = new Date(referenceMs);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }
    assertOrganizationAllocations(allocations) {
        if (!Array.isArray(allocations) || allocations.length === 0) {
            throw new DomainError("INVALID_INPUT", "allocations må inneholde minst én organisasjon.");
        }
        const normalized = allocations.map((allocation) => {
            const organizationId = allocation.organizationId?.trim();
            const organizationAccountId = allocation.organizationAccountId?.trim();
            const sharePercent = Number(allocation.sharePercent);
            if (!organizationId) {
                throw new DomainError("INVALID_INPUT", "organizationId mangler.");
            }
            if (!organizationAccountId) {
                throw new DomainError("INVALID_INPUT", "organizationAccountId mangler.");
            }
            if (!Number.isFinite(sharePercent) || sharePercent <= 0) {
                throw new DomainError("INVALID_INPUT", "sharePercent må være større enn 0.");
            }
            return {
                organizationId,
                organizationAccountId,
                sharePercent
            };
        });
        const totalShare = normalized.reduce((sum, allocation) => sum + allocation.sharePercent, 0);
        if (Math.abs(totalShare - 100) > 0.0001) {
            throw new DomainError("INVALID_INPUT", "Summen av sharePercent må være 100.");
        }
        return normalized;
    }
    roundCurrency(value) {
        return Math.round(value * 100) / 100;
    }
    allocateAmountByShares(totalAmount, shares) {
        const total = this.roundCurrency(totalAmount);
        if (shares.length === 0) {
            return [];
        }
        const sumShares = shares.reduce((sum, share) => sum + share, 0);
        if (!Number.isFinite(sumShares) || sumShares <= 0) {
            throw new DomainError("INVALID_INPUT", "Ugyldige andeler for fordeling.");
        }
        const amounts = shares.map((share) => this.roundCurrency((total * share) / sumShares));
        const allocated = this.roundCurrency(amounts.reduce((sum, amount) => sum + amount, 0));
        const remainder = this.roundCurrency(total - allocated);
        amounts[0] = this.roundCurrency(amounts[0] + remainder);
        return amounts;
    }
    startOfLocalDayMs(referenceMs) {
        const reference = new Date(referenceMs);
        return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate()).getTime();
    }
    startOfLocalMonthMs(referenceMs) {
        const reference = new Date(referenceMs);
        return new Date(reference.getFullYear(), reference.getMonth(), 1).getTime();
    }
    requireRoom(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room) {
            throw new DomainError("ROOM_NOT_FOUND", "Rommet finnes ikke.");
        }
        return room;
    }
    requirePlayer(room, playerId) {
        const player = room.players.get(playerId);
        if (!player) {
            throw new DomainError("PLAYER_NOT_FOUND", "Spiller finnes ikke i rommet.");
        }
        return player;
    }
    requireRunningGame(room) {
        if (!room.currentGame || room.currentGame.status !== "RUNNING") {
            throw new DomainError("GAME_NOT_RUNNING", "Ingen aktiv runde i rommet.");
        }
        return room.currentGame;
    }
    assertHost(room, actorPlayerId) {
        if (room.hostPlayerId !== actorPlayerId) {
            throw new DomainError("NOT_HOST", "Kun host kan utføre denne handlingen.");
        }
    }
    assertNotRunning(room) {
        if (room.currentGame?.status === "RUNNING") {
            throw new DomainError("GAME_ALREADY_RUNNING", "Spillet er allerede i gang.");
        }
    }
    assertPlayerName(playerName) {
        const name = playerName.trim();
        if (!name) {
            throw new DomainError("INVALID_NAME", "Spillernavn kan ikke være tomt.");
        }
        if (name.length > 24) {
            throw new DomainError("INVALID_NAME", "Spillernavn kan maks være 24 tegn.");
        }
        return name;
    }
    assertHallId(hallId) {
        const normalized = hallId.trim();
        if (!normalized || normalized.length > 120) {
            throw new DomainError("INVALID_HALL_ID", "hallId er ugyldig.");
        }
        return normalized;
    }
    serializeRoom(room) {
        return {
            code: room.code,
            hallId: room.hallId,
            hostPlayerId: room.hostPlayerId,
            createdAt: room.createdAt,
            players: [...room.players.values()],
            currentGame: room.currentGame ? this.serializeGame(room.currentGame) : undefined,
            gameHistory: room.gameHistory.map((game) => ({ ...game }))
        };
    }
    serializeGame(game) {
        const ticketByPlayerId = Object.fromEntries([...game.tickets.entries()].map(([playerId, tickets]) => [playerId, tickets.map((ticket) => ({ ...ticket }))]));
        const marksByPlayerId = Object.fromEntries([...game.marks.entries()].map(([playerId, marksByTicket]) => {
            const mergedMarks = new Set();
            for (const marks of marksByTicket) {
                for (const number of marks.values()) {
                    mergedMarks.add(number);
                }
            }
            return [playerId, [...mergedMarks.values()].sort((a, b) => a - b)];
        }));
        return {
            id: game.id,
            status: game.status,
            entryFee: game.entryFee,
            ticketsPerPlayer: game.ticketsPerPlayer,
            prizePool: game.prizePool,
            remainingPrizePool: game.remainingPrizePool,
            payoutPercent: game.payoutPercent,
            maxPayoutBudget: game.maxPayoutBudget,
            remainingPayoutBudget: game.remainingPayoutBudget,
            drawnNumbers: [...game.drawnNumbers],
            remainingNumbers: game.drawBag.length,
            lineWinnerId: game.lineWinnerId,
            bingoWinnerId: game.bingoWinnerId,
            claims: [...game.claims],
            tickets: ticketByPlayerId,
            marks: marksByPlayerId,
            startedAt: game.startedAt,
            endedAt: game.endedAt,
            endedReason: game.endedReason
        };
    }
}
export function toPublicError(error) {
    if (error instanceof DomainError) {
        return { code: error.code, message: error.message };
    }
    if (error instanceof WalletError) {
        return { code: error.code, message: error.message };
    }
    return {
        code: "INTERNAL_ERROR",
        message: "Uventet feil i server."
    };
}
