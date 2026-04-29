# traceContext

**File:** `apps/backend/src/util/traceContext.ts` (129 LOC)
**Owner-area:** observability
**Last reviewed:** 2026-04-30

## Purpose

Per-request / per-socket-connection trace-id context that automatically propagates across `await`, Promise chains, `setTimeout`, and other async boundaries via Node's native `AsyncLocalStorage` — without forcing every call-site to thread the trace-id through function arguments.

A request enters with `runWithTraceContext({ traceId, requestId }, () => next())` from middleware, and any `logger.*` call anywhere in the descended async tree picks up the context automatically. Downstream layers enrich with `setTraceField('userId', user.id)` / `roomCode` / `gameId` once they're known. Cross-module correlation (HTTP → Socket.IO → DB → SMS) just works because all log lines share the same `traceId`.

## Public API

```typescript
export interface TraceContext {
  traceId: string                    // UUID v4 — stable for the entire request/socket-event lifecycle
  requestId?: string                 // Alias of traceId for HTTP — separate field so log-aggregators can index either name
  userId?: string                    // Wallet-id or user-id once auth resolves
  roomCode?: string                  // Room being acted on (e.g. "BINGO-42")
  gameId?: string                    // Engine's gameId (not slug)
  hallId?: string                    // For hall-scoped requests
  socketId?: string                  // For socket-originated traces
}

// Run `fn` inside a fresh trace-context. Logs in `fn` and all descended async work see this context.
export function runWithTraceContext<T>(ctx: TraceContext, fn: () => T): T

// Read the current context, or undefined outside any runWithTraceContext.
export function getTraceContext(): Readonly<TraceContext> | undefined

// Enrich the live context with a new field. No-op when no context is active.
export function setTraceField<K extends keyof TraceContext>(key: K, value: TraceContext[K]): void

// Generate a fresh UUID v4 trace-id. Uses globalThis.crypto.randomUUID with fallback.
export function newTraceId(): string

// Internal helper used by the logger module to merge active fields into log objects.
export function getTraceMergeFields(): TraceContext | undefined
```

## Dependencies

**Calls (downstream):**
- `node:async_hooks` `AsyncLocalStorage` — Node-native primitive (since Node 14, stable since 16) with zero overhead when no context is active.
- `globalThis.crypto.randomUUID` — preferred path via Web Crypto. Falls back to a hand-rolled RFC-4122 v4 generator (`fallbackUuid`) for old runtimes.

**Called by (upstream):**
- `apps/backend/src/util/logger.js` — pino logger merges `getTraceMergeFields()` into every log object so `traceId` / `roomCode` / `userId` always appear without per-call boilerplate.
- HTTP middleware (Express) — wraps each request handler in `runWithTraceContext({ traceId: newTraceId(), requestId: <header-or-newTraceId> }, () => next())`.
- Socket.IO middleware — wraps connection-level dispatches in `runWithTraceContext({ traceId: newTraceId(), socketId: socket.id })`.
- Auth resolvers — call `setTraceField('userId', user.id)` once auth completes.
- Room handlers — call `setTraceField('roomCode', code)` and `setTraceField('hallId', hallId)` once the room is resolved.

## Invariants

- **Per-async-tree isolation.** ALS scopes the context object per asynchronous tree — concurrent requests have their own. Mutating the live store via `setTraceField` is safe because each tree has its own object.
- **Frozen reads.** `getTraceContext` returns the live store typed as `Readonly<TraceContext>` — direct mutation is a TS error. Use `setTraceField` to enrich, or accept that reads are advisory.
- **Zero-allocation when inactive.** Outside any `runWithTraceContext`, `getTraceContext` and `getTraceMergeFields` return `undefined` — the logger short-circuits the merge entirely.
- **Trace-id stability.** `traceId` MUST stay constant across the entire async tree. Helpers don't mutate it; new requests start their own trace via a fresh `runWithTraceContext`.
- **Idempotent enrichment.** `setTraceField` overwrites the value silently — no warning if the same key is set twice. Callers in nested middlewares routinely re-set `userId` without harm.
- **Fallback UUID is RFC-4122 v4.** `fallbackUuid` sets bit-pattern `4` for the version nibble and `8|9|a|b` for the variant nibble — generates a syntactically correct v4 UUID even on runtimes without `crypto.randomUUID`. `Math.random` is not cryptographically strong but trace-ids are observability tokens, not security tokens.

## Test coverage

- `apps/backend/src/util/traceContext.test.ts` — unit tests covering:
  - `runWithTraceContext` propagation across await, setTimeout, and microtask boundaries.
  - Concurrent requests get isolated contexts.
  - `setTraceField` no-ops outside any active context.
  - `newTraceId` returns valid UUID v4 syntax.
  - Logger integration via `getTraceMergeFields` (live integration test against pino's child-logger merge object).

## Operational notes

- **Missing `traceId` in logs:** the call site is outside `runWithTraceContext`. Common causes: `setInterval` callbacks scheduled at module-load time before any request, raw socket lifecycle events that bypass the middleware. Wrap the entry point.
- **Stale `userId` after re-auth:** if a long-lived socket connection re-authenticates, the original ALS scope still has the old `userId`. The remedy is to start a fresh `runWithTraceContext` at the re-auth boundary, not to mutate a stale one.
- **Cross-module correlation tip:** outbound HTTP requests can forward `getTraceContext()?.traceId` as the `X-Request-Id` header; downstream services log it back, giving end-to-end visibility.
- **Why ALS, not cls-hooked:** `cls-hooked` relies on the older `async_hooks` instrumentation that pre-dates ALS and is measurably slower. ALS is the supported Node primitive going forward.

## Recent significant changes

- MED-1 — initial introduction. Wired into pino logger so all backend log lines auto-merge `traceId` / `userId` / `roomCode` / `gameId`.

## Refactor status

Not in scope for K1–K5. Considered stable observability infrastructure. Future enrichments (e.g. `parentSpanId` for distributed tracing if/when OpenTelemetry lands) extend the `TraceContext` interface additively without breaking call sites.
