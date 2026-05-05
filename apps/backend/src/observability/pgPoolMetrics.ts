/**
 * §6.4 (Wave 3b — 2026-05-06): Postgres pool-stats-reporter.
 *
 * Audit-context: under mass-payout (1500 brett × ~5% vinnerate = 75 vinnere
 * per draw, hver med 4-5 wallet-queries) kan pool-en bli tom. Render
 * `basic_256mb`-plan har ~30 connections totalt. Med shared platform-pool
 * + wallet-pool (begge max 20 default) er vi allerede på cap.
 *
 * Mål: gjøre pool-state observerbar slik at vi kan:
 *   1. Alerte på pool-waiting > 0 (= queryer som venter på client)
 *   2. Måle baseline pool-utilization og se om vi nærmer oss cap
 *   3. Diagnostisere et "alle requests timer ut samtidig"-incident raskt
 *
 * Implementasjon: en setInterval-tick som leser `pool.totalCount`,
 * `pool.idleCount`, `pool.waitingCount` fra hver registrerte pool og
 * publiserer Prometheus-gauges. Tick interval er konfigurerbart (default
 * 5s — billig, enough oppløsning for å se rampe-opp i sanntid).
 *
 * Multi-pool-design: vi støtter å registrere flere pools (shared platform-
 * pool + wallet-pool) med distinct labels. Det gjør at samme dashboard kan
 * vise begge poolers helse uten å miste skille mellom dem.
 *
 * Cleanup: returnerer en stop()-funksjon som lar tester / shutdown-handler
 * stoppe loop-en. I prod kjører den frem til process.exit.
 */

import type { Pool } from "pg";
import { metrics } from "../util/metrics.js";
import { logger as rootLogger } from "../util/logger.js";

const log = rootLogger.child({ module: "pg-pool-metrics" });

// ── Pool-spec for registrering ──────────────────────────────────────────────

export interface PoolSpec {
  /** Stable label (e.g. "shared" / "wallet"). Brukes i metrics-etiketter. */
  readonly name: string;
  /** Pool-instansen som skal samples. */
  readonly pool: Pool;
  /** Konfigurert max-størrelse — eksponeres som `pgPoolMax`-gauge. */
  readonly max: number;
}

// ── Reporter ────────────────────────────────────────────────────────────────

export interface PoolMetricsReporter {
  /** Stopp tick-loop-en. Idempotent. */
  stop(): void;
  /** Sample alle registered pools nå (synchront). Brukes av tester. */
  sampleNow(): void;
}

export interface CreatePoolMetricsReporterOptions {
  pools: PoolSpec[];
  /** Tick-interval i ms (default 5000). Eksponert for tester. */
  intervalMs?: number;
}

/**
 * Lager en reporter som tar pool-stats-snapshot hvert intervall og oppdaterer
 * Prometheus-gauges. Reporter-en starter ikke loop automatisk i tester —
 * den kalles fra `index.ts` boot-flyten.
 *
 * Hvis pool-listen er tom returneres en no-op-reporter (ingen tick).
 */
export function createPoolMetricsReporter(
  options: CreatePoolMetricsReporterOptions,
): PoolMetricsReporter {
  const intervalMs = options.intervalMs ?? 5_000;
  const pools = [...options.pools];

  // Push initiale max-verdier (gauges-set er idempotent — trygt å kalle
  // selv om vi reset-er på tick under).
  for (const spec of pools) {
    metrics.pgPoolMax.set({ pool: spec.name }, spec.max);
  }

  function sampleOnce(): void {
    for (const spec of pools) {
      try {
        // node-pg eksponerer disse 3 felt-ene direkte på Pool-instansen.
        // `totalCount` = active + idle (clients i pool totalt).
        // `idleCount` = clients som er ledige (pool-resident, ikke leased).
        // `waitingCount` = queryer som venter på en client (pool tom).
        const total = spec.pool.totalCount;
        const idle = spec.pool.idleCount;
        const waiting = spec.pool.waitingCount;
        const active = Math.max(0, total - idle);

        metrics.pgPoolActive.set({ pool: spec.name }, active);
        metrics.pgPoolIdle.set({ pool: spec.name }, idle);
        metrics.pgPoolWaiting.set({ pool: spec.name }, waiting);
        metrics.pgPoolTotal.set({ pool: spec.name }, total);
      } catch (err) {
        // Best-effort: hvis pool-en er stengt eller throw-ing, log warn
        // men ikke krasj reporter-en.
        log.warn({ err, pool: spec.name }, "pgPoolMetrics: sample failed");
      }
    }
  }

  if (pools.length === 0) {
    log.debug("pgPoolMetrics: no pools registered, reporter is no-op");
    return {
      stop: () => {},
      sampleNow: () => {},
    };
  }

  const handle = setInterval(sampleOnce, intervalMs);
  // Sample én gang umiddelbart så gauges har verdier før første tick.
  sampleOnce();

  // unref() så tick-loop ikke holder Node-process levende — viktig for tester
  // og for graceful shutdown.
  if (typeof handle.unref === "function") handle.unref();

  return {
    stop: () => {
      clearInterval(handle);
    },
    sampleNow: () => sampleOnce(),
  };
}
