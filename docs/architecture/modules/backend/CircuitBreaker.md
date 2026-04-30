# CircuitBreaker

**File:** `apps/backend/src/util/CircuitBreaker.ts` (266 LOC)
**Owner-area:** infrastructure
**Last reviewed:** 2026-04-30

## Purpose

Reusable circuit breaker for external API + DB resilience: fail fast when a dependency is repeatedly broken, probe once to test recovery, and emit transitions to Prometheus so dashboards never lag the actual breaker state.

Wraps the classic three-state pattern (CLOSED → OPEN → HALF_OPEN → CLOSED|OPEN) with two entry points: a strict `execute()` that serializes HALF_OPEN to a single in-flight probe (HIGH-8), and the older `assertClosed/onSuccess/onFailure` triple kept for callers that want manual control. The `onStateChange` observer fires on every meaningful transition and is wired in production to `metrics.walletCircuitState` per-state gauge for time-spent-in-state alerting.

## Public API

```typescript
export interface CircuitBreakerConfig {
  threshold?: number          // Default: 5 — consecutive failures before opening
  resetMs?: number            // Default: 30_000 — time in OPEN before allowing a probe
  name?: string               // Default: "circuit-breaker" — for logging/metrics labels
  onStateChange?: (state: CircuitState, name: string) => void
}

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN"

export class CircuitBreaker {
  constructor(config?: CircuitBreakerConfig)

  // Strict HALF_OPEN semantics — one probe, no concurrency
  async execute<T>(fn: () => Promise<T>): Promise<T>

  // Manual trio (legacy)
  assertClosed(): void
  onSuccess(): void
  onFailure(): void

  // Read state + counters
  get state(): CircuitState
  metrics(): CircuitBreakerMetrics    // { name, state, consecutiveFailures, threshold, resetMs, totalSuccesses, totalFailures, totalRejections, lastStateChangeMs }

  readonly name: string
}

export class CircuitBreakerOpenError extends Error {
  readonly code: "CIRCUIT_BREAKER_OPEN"
  readonly remainingMs: number
}
```

## Dependencies

**Calls (downstream):**
- None — pure logic, no I/O. The `onStateChange` callback (when supplied) calls into `prom-client` Gauge through `metrics.walletCircuitState.labels(...).set(...)`, but the breaker doesn't import metrics directly — it stays decoupled and observer-driven.

**Called by (upstream):**
- `apps/backend/src/wallet/walletCircuitBreaker.ts` (or equivalent wallet adapter wrapper) — primary production user; the `walletCircuitState` Prometheus gauge in `util/metrics.ts:78` is dedicated to this breaker.
- Any external-API client (BankID, Swedbank, Sveve SMS, Metronia, OK Bingo) that needs fail-fast on repeated outages — instantiate with a unique `name` and wire `onStateChange` to a per-name gauge if dashboard visibility matters.
- `index.ts` health endpoint can include `breaker.metrics()` snapshots for `/health` consumers.

## Invariants

- **Initial CLOSED notification.** Constructor calls `notifyStateChange()` once so observers (Prometheus) start from a known baseline rather than an unknown gauge value.
- **State derivation is pure.** `state` getter computes from `openUntilMs` vs `Date.now()` — never mutated directly. CLOSED when `openUntilMs <= 0`; OPEN when `now < openUntilMs`; HALF_OPEN when `now >= openUntilMs` and `openUntilMs > 0`.
- **Single in-flight probe in `execute()`.** When the breaker enters HALF_OPEN, the first caller's `probeInFlight = true` flag rejects all concurrent callers as if OPEN (with `remainingMs: 1` so they retry shortly). The probe outcome decides the transition.
- **HALF_OPEN failure re-opens immediately in `execute()`.** A failed probe sets `consecutiveFailures = threshold` and `openUntilMs = now + resetMs` — no waiting for `threshold` more failures. The legacy `assertClosed/onFailure` path retains the older behavior where HALF_OPEN auto-resets to CLOSED on `assertClosed` and only re-opens after `threshold` more failures.
- **Observer never breaks the breaker.** `notifyStateChange` wraps `onStateChange` in try/catch — observer exceptions are swallowed.
- **Deduped emits.** `lastReportedState` tracks the last value emitted to the observer; duplicate transitions (e.g. multiple successes in CLOSED) don't re-emit.
- **`probeInFlight` is cleared in `finally`.** Even if the probe throws, the in-flight flag releases so the next request after the cool-down can retry.
- **Threshold guard.** `consecutiveFailures` only triggers a transition once per cool-down cycle (`openUntilMs === 0` check before opening) — repeated failures past the threshold inside one cycle don't re-set the timer.

## Test coverage

- `apps/backend/src/util/CircuitBreaker.test.ts` — covers:
  - CLOSED → OPEN at threshold; reset window.
  - OPEN → HALF_OPEN auto on time elapse.
  - HALF_OPEN single-probe semantics: concurrent caller rejected, probe success → CLOSED, probe failure → OPEN immediately.
  - Legacy `assertClosed/onSuccess/onFailure` trio preserves backward compat.
  - `onStateChange` deduping + initial CLOSED emit.
  - `CircuitBreakerOpenError.remainingMs` precision.

## Operational notes

- **Sustained OPEN signal:** `wallet_circuit_state{state="OPEN"} > 0` for several minutes — the wallet adapter's underlying dependency is down. PromQL: `max(wallet_circuit_state{state="OPEN"}) > 0`. Inspect `metrics().totalRejections` to count user-visible failures during the OPEN window.
- **Flapping (rapid OPEN/HALF_OPEN/OPEN):** probe keeps failing right after cool-down. Either the dependency hasn't recovered yet (raise `resetMs`) or the probe path itself is wrong (e.g. probing a different endpoint than the failing one). Search WARN logs for repeated `notifyStateChange → OPEN` entries from the same breaker name.
- **`assertClosed` vs `execute` decision rule:** prefer `execute` for new code — strict HALF_OPEN protects the dependency from herd-retry. `assertClosed` is acceptable only when the caller has its own queue/serializer and just wants the fail-fast behavior, not the probe-coordination.
- **Metrics-only consumers:** `metrics()` returns a snapshot, not a reference. Safe to JSON-serialize in `/health`.

## Recent significant changes

- HIGH-8 (BIN-165) — strict HALF_OPEN semantics added via `execute()`; `walletCircuitState` per-state gauge in `metrics.ts:78` dedicated to dashboarding time-spent-in-state, not just open/closed-edge.

## Refactor status

Not in scope for K1–K5. The breaker is considered stable infrastructure — additions of new dependencies create new instances rather than modifying this module.
