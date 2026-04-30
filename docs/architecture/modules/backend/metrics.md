# metrics

**File:** `apps/backend/src/util/metrics.ts` (171 LOC)
**Owner-area:** observability
**Last reviewed:** 2026-04-30

## Purpose

Single-source-of-truth Prometheus metric catalog for the backend. Every counter / gauge / histogram lives here so `GET /metrics` produces a coherent text-format export with stable names and labels — and so dashboard authors only have to read one file to know what's recordable.

Default Node.js metrics (CPU, memory, event loop lag, GC) are auto-collected with the `bingo_` prefix on import. App-specific metrics are exported as a single `metrics` object so call sites stay one-line: `metrics.activeRooms.set(count)`, `metrics.drawErrors.inc({ category: "TRANSIENT" })`.

## Public API

```typescript
import { metrics, register } from "./util/metrics.js";

// Game state
metrics.activeRooms.set(count)
metrics.activePlayers.set(count)
metrics.gameRoundsTotal.inc()

// Draw scheduler
metrics.schedulerTickDuration.observe(durationMs)
metrics.drawErrors.inc({ category: "TRANSIENT" | "PERMANENT" | "FATAL" })
metrics.stuckRooms.set(count)
metrics.lockTimeouts.inc()

// Wallet
metrics.walletOperationDuration.observe({ operation: "debit"|"credit"|"reserve"|… }, durationMs)
metrics.walletCircuitState.set({ state: "OPEN"|"HALF_OPEN"|"CLOSED" }, 1 | 0)
metrics.walletIdempotencyKeysPrunedTotal.inc(n)
metrics.walletReconciliationDivergence.inc({ account_id, side })
metrics.walletReconciliationClean.inc()
metrics.walletReconciliationDuration.observe(durationMs)
metrics.walletReconciliationAccountsScanned.inc(n)

// Casino-grade integrity (HIGH-4 / HIGH-5)
metrics.walletRoomDriftTotal.inc({ room, field })
metrics.drawLockRejections.inc()

// Circuit breaker (legacy generic gauge — also still emitted)
metrics.circuitBreakerState.set({ name }, 1 | 0)

// Socket.IO
metrics.socketConnections.set(count)
metrics.rateLimitRejections.inc({ event })

// Webhooks
metrics.webhookDeliveries.inc({ status })

// Pilot health (BIN-539)
metrics.claimSubmitted.inc({ game, hall, type })
metrics.payoutAmount.observe({ game, hall, type }, kroner)
metrics.reconnectTotal.inc({ reason })

// Prometheus registry — exposed for /metrics endpoint
export const register: client.Registry
```

`/metrics` endpoint serializes via `await register.metrics()` and returns `Content-Type: text/plain` with the Prometheus text-format exposition.

## Dependencies

**Calls (downstream):**
- `prom-client` — official Node.js Prometheus client. `Counter`, `Gauge`, and `Histogram` types come from here. `client.collectDefaultMetrics({ prefix: "bingo_" })` is called once at module load.

**Called by (upstream):**
- `apps/backend/src/index.ts:2936` — `/metrics` endpoint serializes `register.metrics()`; also polls `drawScheduler.healthSummary().drawWatchdog.stuckRooms` every 30s to keep `stuckRooms` gauge fresh.
- `apps/backend/src/draw-engine/DrawScheduler.ts` — indirectly via `index.ts` polling; tick duration is recorded by the scheduler-setup wrapper.
- Wallet adapters — `walletOperationDuration` measured around every `debit/credit/reserve` call; `walletCircuitState` updated by the `CircuitBreaker.onStateChange` observer wired to the wallet breaker.
- BingoEngine recovery integrity check — `walletRoomDriftTotal` incremented when in-memory state diverges from the last PG checkpoint.
- Game1DrawEngineService draw-lock — `drawLockRejections` incremented when a concurrent `draw:next` is rejected.
- Cron jobs — `walletReconciliation*` counters from the nightly reconciliation tick (BIN-763); `walletIdempotencyKeysPrunedTotal` from the 90-day TTL cleanup (BIN-767).
- Socket layer — `socketConnections` gauge maintained on connect/disconnect; `rateLimitRejections` incremented per dropped event.

## Invariants

- **Singleton registry.** This module imports `prom-client` once and registers everything against the default registry. Multiple imports across the codebase hit the same instance — re-registering a metric name throws.
- **Default `bingo_` prefix on Node metrics, but app metrics use explicit names.** The catalog mixes prefixes deliberately: `bingo_*` for game state, `wallet_*` for wallet integrity, `spillorama_*` for cross-game pilot health. Stable names — renaming breaks every dashboard.
- **Histogram bucket choices are calibrated to expected ranges.** `schedulerTickDuration` 1ms–1000ms; `walletOperationDuration` 5ms–5000ms; `payoutAmount` 1kr–10000kr; `walletReconciliationDuration` 100ms–120000ms. Out-of-range values land in the `+Inf` bucket — visible but not actionable for percentiles.
- **Label cardinality is bounded.** Every label set is from a known small enum (game slug, hall id, claim type, error category, breaker name) — no user-id or trace-id in labels. Unbounded cardinality would explode TSDB storage.
- **Counters are monotone.** `inc()` only — never `dec()`. Gauges (`activeRooms`, `socketConnections`, `walletCircuitState`) own bidirectional state.
- **Per-state gauge for circuit breakers.** `walletCircuitState` uses a `state` label so exactly one of `{state="CLOSED"}`, `{state="OPEN"}`, `{state="HALF_OPEN"}` is `1` at any moment — lets dashboards alert on time-spent in OPEN, not just open/closed-edge.

## Test coverage

No unit tests for the catalog itself — `prom-client` types and behavior are covered upstream. Coverage is instead at the call-site:
- Wallet operation tests assert `metrics.walletOperationDuration.observe` was invoked.
- Reconciliation tests assert `metrics.walletReconciliationClean` increments on a clean run and `metrics.walletReconciliationDivergence` increments per detected drift.
- Circuit breaker tests assert `onStateChange` observer was fired (which is what updates `walletCircuitState`).

## Operational notes

- **Prometheus-side scrape:** Render runs a Prometheus-compatible scraper against `/metrics` on the backend pod. Default scrape interval 30s; high-frequency dashboards (e.g. tick duration percentiles) need pre-aggregation in the recording rule rather than tighter scraping.
- **Adding a new metric:** declare here (single file), import the `metrics` object at the call site, increment/observe. Do NOT instantiate `new client.Counter(...)` ad hoc elsewhere — registry collisions throw at boot.
- **Cardinality alarm:** if a new label introduces unbounded values (player id, room code), refactor to either a counter without that label or a separate metric with explicit bucketed labels (e.g. "small/medium/large hall" instead of hall id).
- **Wallet circuit dashboard alert:** `max(wallet_circuit_state{state="OPEN"}) > 0` for 5m → page on-call. The breaker's `resetMs` is 30s, so 5m in OPEN means flapping or sustained outage.
- **Draw lock rejections:** `spillorama_draw_lock_rejections_total > 0` is a smell — typically client retry-loop or dual-host. Investigate the room code + WARN logs.

## Recent significant changes

- BIN-172 — initial Prometheus catalog.
- BIN-539 — `claimSubmitted`, `payoutAmount`, `reconnectTotal` for pilot health signals.
- BIN-763 — wallet nightly-reconciliation counters (`walletReconciliation*`).
- BIN-767 — `walletIdempotencyKeysPrunedTotal` for the 90-day TTL cleanup cron.
- HIGH-4 — `walletRoomDriftTotal` from BingoEngine recovery integrity check.
- HIGH-5 — `drawLockRejections` from per-room draw-lock conflicts.
- HIGH-8 — per-state `walletCircuitState` gauge replaces the single-bit `circuitBreakerState` for time-spent-in-state alerting.

## Refactor status

Not in scope for K1–K5. Stable observability infrastructure. New metrics are added additively — renaming would break every existing dashboard and recording rule.
