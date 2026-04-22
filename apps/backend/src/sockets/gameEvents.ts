/**
 * PR-R4: fasade for socket-event-handlerne.
 *
 * Denne filen er igang med å splittes per event-cluster under
 * `sockets/gameEvents/`. Offentlige eksporter (`createGameEventHandlers`,
 * `GameEventsDeps`, `BingoSchedulerSettings`, `emitG3DrawEvents`) bevares
 * for bakoverkompatibilitet — eksisterende importer i
 * `apps/backend/src/index.ts` og `__tests__/` påvirkes ikke.
 */
import { randomUUID } from "node:crypto";
import type { Socket } from "socket.io";
import { ClaimSubmitPayloadSchema } from "@spillorama/shared-types/socket-events";
import { DomainError, toPublicError } from "./../game/BingoEngine.js";
import { addBreadcrumb } from "./../observability/sentry.js";
import { metrics as promMetrics } from "./../util/metrics.js";
import type { RoomSnapshot } from "./../game/types.js";
import { buildRegistryContext, buildSocketContext } from "./gameEvents/context.js";
import { registerRoomEvents } from "./gameEvents/roomEvents.js";
import { registerGameLifecycleEvents } from "./gameEvents/gameLifecycleEvents.js";
import { registerDrawEvents } from "./gameEvents/drawEvents.js";
import { registerTicketEvents } from "./gameEvents/ticketEvents.js";
import type {
  AckResponse,
  ChatMessage,
  ChatSendPayload,
  ClaimPayload,
  LeaderboardEntry,
  LeaderboardPayload,
  RoomActionPayload,
} from "./gameEvents/types.js";
import type { BingoSchedulerSettings, GameEventsDeps } from "./gameEvents/deps.js";

export { emitG3DrawEvents } from "./gameEvents/drawEmits.js";
export type { BingoSchedulerSettings, GameEventsDeps } from "./gameEvents/deps.js";

// ── Factory ───────────────────────────────────────────────────────────────────

export function createGameEventHandlers(deps: GameEventsDeps) {
  const ctx = buildRegistryContext(deps);
  const {
    engine,
    io,
    ackSuccess,
    ackFailure,
    appendChatMessage,
  } = ctx;
  const {
    socketRateLimiter: _socketRateLimiter,
    emitRoomUpdate,
    runtimeBingoSettings,
    chatHistoryByRoom,
    getRoomConfiguredEntryFee,
    getArmedPlayerIds,
    disarmAllPlayers,
    clearDisplayTicketCache,
    resolveBingoHallGameConfigForRoom,
    buildLeaderboard,
  } = deps;

  return function registerGameEvents(socket: Socket): void {
    const sctx = buildSocketContext(socket, ctx);
    const { rateLimited, requireAuthenticatedPlayerAction } = sctx;

    registerRoomEvents(sctx);
    registerGameLifecycleEvents(sctx);
    registerDrawEvents(sctx);
    registerTicketEvents(sctx);

    socket.on("claim:submit", rateLimited("claim:submit", async (payload: ClaimPayload, callback: (response: AckResponse<{ snapshot: RoomSnapshot }>) => void) => {
      try {
        // BIN-545: runtime-validate the incoming claim:submit payload against the
        // shared-types Zod schema. `roomCode` and `type` must be present and
        // well-typed before we let the engine act.
        const parsed = ClaimSubmitPayloadSchema.safeParse(payload);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          const field = first?.path.join(".") || "payload";
          throw new DomainError("INVALID_INPUT", `claim:submit payload invalid (${field}: ${first?.message ?? "unknown"}).`);
        }
        const { roomCode, playerId } = await requireAuthenticatedPlayerAction(parsed.data);
        const claim = await engine.submitClaim({
          roomCode,
          playerId,
          type: parsed.data.type
        });
        const snapshot = await emitRoomUpdate(roomCode);
        // BIN-539: Record the claim + payout so operator dashboards can
        // correlate wallet movement with in-game state. `hallId` is taken
        // from the room snapshot because `snapshot.hallId` is the canonical
        // source of truth (client-claimed hall is untrusted).
        const gameLabel = snapshot.gameSlug ?? "unknown";
        const hallLabel = snapshot.hallId ?? "unknown";
        promMetrics.claimSubmitted.inc({ game: gameLabel, hall: hallLabel, type: parsed.data.type });
        if (claim.valid && typeof claim.payoutAmount === "number" && claim.payoutAmount > 0) {
          promMetrics.payoutAmount.observe(
            { game: gameLabel, hall: hallLabel, type: parsed.data.type },
            claim.payoutAmount,
          );
        }
        addBreadcrumb("claim:submit", {
          game: gameLabel,
          hall: hallLabel,
          type: parsed.data.type,
          valid: claim.valid,
          payoutAmount: claim.payoutAmount ?? 0,
        });
        // Emit pattern:won if a pattern was completed by this claim
        if (claim.valid) {
          const wonPattern = snapshot.currentGame?.patternResults?.find(
            (r) => r.claimId === claim.id && r.isWon
          );
          if (wonPattern) {
            io.to(roomCode).emit("pattern:won", {
              patternId: wonPattern.patternId,
              patternName: wonPattern.patternName,
              winnerId: wonPattern.winnerId,
              wonAtDraw: wonPattern.wonAtDraw,
              payoutAmount: wonPattern.payoutAmount,
              claimType: wonPattern.claimType,
              gameId: snapshot.currentGame?.id
            });
          }
          // Game 1 (Classic Bingo): activate mini-game after BINGO win
          if (payload.type === "BINGO" && snapshot.gameSlug === "bingo") {
            const miniGame = engine.activateMiniGame(roomCode, playerId);
            if (miniGame) {
              socket.emit("minigame:activated", {
                gameId: snapshot.currentGame?.id,
                playerId,
                type: miniGame.type,
                prizeList: miniGame.prizeList,
              });
            }
          }
          // Game 5 (Spillorama): activate jackpot after BINGO win
          if (payload.type === "BINGO" && snapshot.gameSlug === "spillorama") {
            const jackpot = engine.activateJackpot(roomCode, playerId);
            if (jackpot) {
              // Send jackpot activation to the winning player only
              socket.emit("jackpot:activated", {
                gameId: snapshot.currentGame?.id,
                playerId,
                prizeList: jackpot.prizeList,
                totalSpins: jackpot.totalSpins,
                playedSpins: jackpot.playedSpins,
                spinHistory: jackpot.spinHistory,
              });
            }
          }
        }
        ackSuccess(callback, { snapshot });
      } catch (error) {
        ackFailure(callback, error);
      }
    }));


    // ── Jackpot (Game 5 Free Spin) ─────────────────────────────────────────
    socket.on("jackpot:spin", rateLimited("jackpot:spin", async (payload: RoomActionPayload, callback: (response: AckResponse<unknown>) => void) => {
      try {
        const { roomCode, playerId } = await requireAuthenticatedPlayerAction(payload);
        const result = await engine.spinJackpot(roomCode, playerId);
        ackSuccess(callback, result);
      } catch (error) {
        ackFailure(callback, error);
      }
    }));

    // ── Mini-game (Game 1 — Wheel of Fortune / Treasure Chest) ─────────────
    socket.on("minigame:play", rateLimited("minigame:play", async (payload: RoomActionPayload & { selectedIndex?: number }, callback: (response: AckResponse<unknown>) => void) => {
      try {
        const { roomCode, playerId } = await requireAuthenticatedPlayerAction(payload);
        const selectedIndex = typeof payload?.selectedIndex === "number" ? payload.selectedIndex : undefined;
        const result = await engine.playMiniGame(roomCode, playerId, selectedIndex);
        ackSuccess(callback, result);
      } catch (error) {
        ackFailure(callback, error);
      }
    }));

    // ── Chat ─────────────────────────────────────────────────────────────────
    socket.on("chat:send", rateLimited("chat:send", async (payload: ChatSendPayload, callback: (response: AckResponse<{ message: ChatMessage }>) => void) => {
      try {
        const { roomCode, playerId } = await requireAuthenticatedPlayerAction(payload);
        const message = (payload?.message ?? "").trim();
        if (!message && (payload?.emojiId ?? 0) === 0) {
          throw new DomainError("INVALID_INPUT", "Meldingen kan ikke være tom.");
        }
        const snapshot = engine.getRoomSnapshot(roomCode);
        const player = snapshot.players.find((p) => p.id === playerId);
        // BIN-516 hall-scoping: a player must belong to the room's hall to chat
        // in it. Cross-hall chat is a spillevett audit hazard.
        if (player?.hallId && snapshot.hallId && player.hallId !== snapshot.hallId) {
          throw new DomainError("FORBIDDEN", "Spilleren tilhører en annen hall enn rommet.");
        }
        const chatMsg: ChatMessage = {
          id: randomUUID(),
          playerId,
          playerName: player?.name ?? "Ukjent",
          message: message.slice(0, 500),
          emojiId: payload?.emojiId ?? 0,
          createdAt: new Date().toISOString()
        };
        appendChatMessage(roomCode, chatMsg);
        // BIN-516: fire-and-forget persistence. The store implementations log
        // and swallow errors — chat must keep flowing even if the DB is sick.
        if (deps.chatMessageStore) {
          void deps.chatMessageStore.insert({
            hallId: snapshot.hallId,
            roomCode,
            playerId,
            playerName: chatMsg.playerName,
            message: chatMsg.message,
            emojiId: chatMsg.emojiId,
          });
        }
        io.to(roomCode).emit("chat:message", chatMsg);
        ackSuccess(callback, { message: chatMsg });
      } catch (error) {
        ackFailure(callback, error);
      }
    }));

    socket.on("chat:history", rateLimited("chat:history", async (payload: RoomActionPayload, callback: (response: AckResponse<{ messages: ChatMessage[] }>) => void) => {
      try {
        const { roomCode } = await requireAuthenticatedPlayerAction(payload);
        // BIN-516: prefer the persistent store when available so a fresh
        // browser session sees pre-load chat history. Fall back to the
        // in-memory window for the dev-without-DB case.
        if (deps.chatMessageStore) {
          const persisted = await deps.chatMessageStore.listRecent(roomCode);
          ackSuccess(callback, { messages: persisted as ChatMessage[] });
          return;
        }
        const messages = chatHistoryByRoom.get(roomCode) ?? [];
        ackSuccess(callback, { messages });
      } catch (error) {
        ackFailure(callback, error);
      }
    }));

    // ── Leaderboard ──────────────────────────────────────────────────────────
    socket.on("leaderboard:get", rateLimited("leaderboard:get", async (payload: LeaderboardPayload, callback: (response: AckResponse<{ leaderboard: LeaderboardEntry[] }>) => void) => {
      try {
        const leaderboard = buildLeaderboard(payload?.roomCode);
        ackSuccess(callback, { leaderboard });
      } catch (error) {
        ackFailure(callback, error);
      }
    }));

    socket.on("disconnect", (reason: string) => {
      engine.detachSocket(socket.id);
      _socketRateLimiter.cleanup(socket.id);
      // BIN-539: Every disconnect rolls into reconnect/retry dashboards. The
      // `reason` label is bounded (Socket.IO enumerates it), so cardinality
      // stays safe for Prometheus.
      promMetrics.reconnectTotal.inc({ reason: reason || "unknown" });
      addBreadcrumb("socket.disconnected", { socketId: socket.id, reason }, "warning");
    });
  };
}
