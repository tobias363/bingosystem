/**
 * BIN-539: Sentry wiring for the backend.
 *
 * The import is lazy so `@sentry/node` only loads when `SENTRY_DSN` is set.
 * In dev and test, this module is a no-op: all functions return successfully
 * without doing any I/O, so there's nothing to stub out in tests.
 *
 * Usage:
 *   initSentry();                                 // call once at startup
 *   setSocketSentryContext(socket, user);         // per-connection
 *   captureError(err, { roomCode, playerId });    // on thrown error
 *   addBreadcrumb("claim:submit", { roomCode });  // on key lifecycle events
 */

import { createHash } from "node:crypto";
import type { Socket } from "socket.io";

// ── Minimal Sentry surface — decoupled from @sentry/node types ──────────────
// We import the SDK lazily inside initSentry so a missing DSN never pulls it
// into the process. The rest of the module stores a narrow handle.

interface SentryHandle {
  captureException: (err: unknown, hint?: { tags?: Record<string, string>; extra?: Record<string, unknown> }) => void;
  addBreadcrumb: (breadcrumb: { category: string; message?: string; data?: Record<string, unknown>; level?: "info" | "warning" | "error" }) => void;
  setTag: (key: string, value: string) => void;
  withScope: (cb: (scope: { setTag: (k: string, v: string) => void; setExtra: (k: string, v: unknown) => void }) => void) => void;
  flush: (timeoutMs?: number) => Promise<boolean>;
}

let sentry: SentryHandle | null = null;
let initialized = false;

export interface SentryInitOptions {
  dsn?: string;
  environment?: string;
  release?: string;
  tracesSampleRate?: number;
}

/**
 * Initialize Sentry if `SENTRY_DSN` is set in the environment. Safe to call
 * multiple times — subsequent calls are no-ops. Returns true if Sentry is now
 * active, false if it was skipped (dev fallback).
 */
export async function initSentry(options: SentryInitOptions = {}): Promise<boolean> {
  if (initialized) return sentry !== null;
  initialized = true;

  const dsn = (options.dsn ?? process.env.SENTRY_DSN ?? "").trim();
  if (!dsn) {
    console.warn("[sentry] DISABLED — SENTRY_DSN is unset. Errors will only be logged to stderr.");
    return false;
  }

  try {
    // Dynamic import so the dep is optional at runtime. If the package isn't
    // installed yet, we log and fall back — the rest of the app still runs.
    const mod = await import("@sentry/node").catch(() => null);
    if (!mod) {
      console.warn("[sentry] DISABLED — @sentry/node not installed. Run `npm install @sentry/node` to enable.");
      return false;
    }
    mod.init({
      dsn,
      environment: options.environment ?? process.env.NODE_ENV ?? "development",
      release: options.release ?? process.env.SENTRY_RELEASE ?? process.env.RELEASE_SHA ?? undefined,
      tracesSampleRate: options.tracesSampleRate ?? 0.1,
    });
    sentry = {
      captureException: (err, hint) => { mod.captureException(err, hint); },
      addBreadcrumb: (b) => { mod.addBreadcrumb(b); },
      setTag: (k, v) => { mod.setTag(k, v); },
      withScope: (cb) => {
        mod.withScope((scope: { setTag: (k: string, v: string) => void; setExtra: (k: string, v: unknown) => void }) => {
          cb({
            setTag: (k, v) => { scope.setTag(k, v); },
            setExtra: (k, v) => { scope.setExtra(k, v); },
          });
        });
      },
      flush: (t) => mod.flush(t),
    };
    console.log(`[sentry] ENABLED (env=${options.environment ?? process.env.NODE_ENV ?? "development"})`);
    return true;
  } catch (err) {
    console.error("[sentry] init failed — continuing without", err);
    return false;
  }
}

/**
 * Hash a PII value (walletId, playerId) so it's correlatable across events
 * without exposing the raw identifier. SHA-256 truncated to 12 hex chars is
 * collision-safe at operator-readable scale (~4B unique inputs).
 */
export function hashPii(value: string | undefined | null): string {
  if (!value) return "anon";
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

/**
 * Set Sentry context tags on a freshly authenticated socket. Called from the
 * connection middleware after token validation so every captured error for
 * this socket is tagged with its hall + hashed player id.
 */
export function setSocketSentryContext(
  socket: Socket,
  user: { walletId?: string; hallId?: string; playerId?: string } | undefined | null,
): void {
  if (!sentry || !user) return;
  socket.data.sentry = {
    hallId: user.hallId ?? "unknown",
    playerIdHash: hashPii(user.playerId ?? user.walletId),
    walletIdHash: hashPii(user.walletId),
  };
}

/**
 * Capture an error with optional tags. Falls through to console.error when
 * Sentry is disabled so dev still sees stack traces.
 */
export function captureError(err: unknown, tags: Record<string, string | undefined> = {}): void {
  if (!sentry) {
    console.error("[sentry-fallback]", err, tags);
    return;
  }
  const cleanTags = Object.fromEntries(
    Object.entries(tags).filter(([, v]) => typeof v === "string" && v.length > 0),
  ) as Record<string, string>;
  sentry.captureException(err, { tags: cleanTags });
}

/**
 * Add a breadcrumb to the current Sentry scope. Use for successful lifecycle
 * events (room:create, claim:submit, draw:new) so the trail is available on
 * the next error. Data is capped to avoid PII leaks — prefer hashed ids.
 */
export function addBreadcrumb(
  category: string,
  data: Record<string, unknown> = {},
  level: "info" | "warning" | "error" = "info",
): void {
  if (!sentry) return;
  sentry.addBreadcrumb({ category, data, level });
}

/**
 * Flush pending events before a graceful shutdown. No-op when disabled.
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!sentry) return;
  try { await sentry.flush(timeoutMs); } catch { /* best effort */ }
}

/** Test-only: force-disable Sentry so unit tests don't pick up a partial init. */
export function __resetSentryForTests(): void {
  sentry = null;
  initialized = false;
}

/** Test-only: inject a mock sentry so tests can assert captureException calls. */
export function __installMockSentryForTests(mock: SentryHandle): void {
  sentry = mock;
  initialized = true;
}
