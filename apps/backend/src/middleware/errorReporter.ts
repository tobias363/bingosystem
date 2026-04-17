/**
 * BIN-539: Express error-reporter middleware.
 *
 * Catches unhandled errors escaping route handlers, logs them, and forwards
 * them to Sentry (when enabled). Response shape is consistent with the
 * `apiFailure` helper so clients see the same envelope regardless of whether
 * the error was thrown by a route or an unrelated layer.
 *
 * Also installs process-level listeners for `unhandledRejection` and
 * `uncaughtException` so async bugs outside Express (scheduler ticks, socket
 * handlers, shutdown hooks) don't vanish.
 */

import type { NextFunction, Request, Response } from "express";
import { captureError } from "../observability/sentry.js";
import { toPublicError } from "../game/BingoEngine.js";

export function errorReporter() {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const publicErr = toPublicError(err);
    captureError(err, {
      path: req.path,
      method: req.method,
      errCode: publicErr.code,
    });
    // Use sensible default statuses based on known codes; otherwise 500.
    const status =
      publicErr.code === "FORBIDDEN" ? 403 :
      publicErr.code === "NOT_FOUND" ? 404 :
      publicErr.code.startsWith("INVALID_") || publicErr.code === "VALIDATION_ERROR" ? 400 :
      500;
    if (!res.headersSent) {
      res.status(status).json({ ok: false, error: publicErr });
    }
  };
}

let processListenersInstalled = false;

/**
 * Install process-level error listeners. Idempotent — re-calling is a no-op.
 * Separate from the Express middleware so tests can opt out.
 */
export function installProcessErrorReporters(): void {
  if (processListenersInstalled) return;
  processListenersInstalled = true;

  process.on("unhandledRejection", (reason) => {
    captureError(reason, { source: "unhandledRejection" });
    console.error("[unhandledRejection]", reason);
  });

  process.on("uncaughtException", (err) => {
    captureError(err, { source: "uncaughtException" });
    console.error("[uncaughtException]", err);
    // Don't call process.exit here — the main shutdown handler in index.ts
    // already listens for uncaughtException and drives a graceful shutdown.
  });
}

/** Test-only: reset the "installed" guard so tests can re-install listeners. */
export function __resetProcessErrorReporters(): void {
  processListenersInstalled = false;
}
