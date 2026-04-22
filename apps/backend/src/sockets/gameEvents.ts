/**
 * PR-R4: fasade for socket-event-handlerne.
 *
 * Denne filen er igang med å splittes per event-cluster under
 * `sockets/gameEvents/`. Offentlige eksporter (`createGameEventHandlers`,
 * `GameEventsDeps`, `BingoSchedulerSettings`, `emitG3DrawEvents`) bevares
 * for bakoverkompatibilitet — eksisterende importer i
 * `apps/backend/src/index.ts` og `__tests__/` påvirkes ikke.
 */
import type { Socket } from "socket.io";
import { addBreadcrumb } from "./../observability/sentry.js";
import { metrics as promMetrics } from "./../util/metrics.js";
import type { RoomSnapshot } from "./../game/types.js";
import { buildRegistryContext, buildSocketContext } from "./gameEvents/context.js";
import { registerRoomEvents } from "./gameEvents/roomEvents.js";
import { registerGameLifecycleEvents } from "./gameEvents/gameLifecycleEvents.js";
import { registerDrawEvents } from "./gameEvents/drawEvents.js";
import { registerTicketEvents } from "./gameEvents/ticketEvents.js";
import { registerClaimEvents } from "./gameEvents/claimEvents.js";
import { registerMiniGameEvents } from "./gameEvents/miniGameEvents.js";
import { registerChatEvents } from "./gameEvents/chatEvents.js";
import type {
  AckResponse,
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
    ackSuccess,
    ackFailure,
  } = ctx;
  const {
    socketRateLimiter: _socketRateLimiter,
    buildLeaderboard,
  } = deps;

  return function registerGameEvents(socket: Socket): void {
    const sctx = buildSocketContext(socket, ctx);
    const { rateLimited, requireAuthenticatedPlayerAction } = sctx;

    registerRoomEvents(sctx);
    registerGameLifecycleEvents(sctx);
    registerDrawEvents(sctx);
    registerTicketEvents(sctx);
    registerClaimEvents(sctx);
    registerMiniGameEvents(sctx);
    registerChatEvents(sctx);

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
