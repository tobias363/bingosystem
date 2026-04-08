/**
 * BIN-168: Centralized structured JSON logger using pino.
 *
 * Usage:
 *   import { logger } from "../util/logger.js";
 *   logger.info({ roomCode, playerId }, "Player joined room");
 *   logger.error({ err, gameId }, "Game start failed");
 *
 * Per-module child loggers:
 *   const log = logger.child({ module: "scheduler" });
 *   log.info("Tick completed");
 *
 * Configuration via environment:
 *   LOG_LEVEL: trace | debug | info | warn | error | fatal (default: info)
 *   NODE_ENV: production → JSON output; otherwise → structured but readable
 */

import pino from "pino";

const level = process.env.LOG_LEVEL?.trim().toLowerCase() || "info";
const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level,
  // In production: pure JSON for log aggregation
  // In dev: still JSON (pino-pretty can be piped externally if desired)
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isProduction ? {} : { transport: undefined })
});

export type Logger = pino.Logger;
