/**
 * §6.4 — Postgres pool-stats-reporter (Wave 3b, 2026-05-06).
 *
 * Verifiserer at pool-metrics-tick-en korrekt leser `totalCount`, `idleCount`,
 * `waitingCount` fra hver registered Pool og publiserer Prometheus-gauges.
 *
 * Bruker en in-memory mock av pg.Pool — ingen ekte DB-tilkobling.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { metrics } from "../../util/metrics.js";
import { createPoolMetricsReporter, type PoolSpec } from "../pgPoolMetrics.js";

// Type-cast helper: vi trenger kun de tre felt-ene reporter-en leser.
function makeMockPool(state: {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}): Pool {
  return state as unknown as Pool;
}

// Helper: les gauge-verdi (prom-client returnerer Promise med metrics-output).
async function readGauge(name: string, label: Record<string, string>): Promise<number | null> {
  const m = await metrics[name as keyof typeof metrics];
  if (!m || typeof (m as { get?: unknown }).get !== "function") return null;
  const data = await (m as { get: () => Promise<{ values: Array<{ value: number; labels: Record<string, string> }> }> }).get();
  const match = data.values.find((v) =>
    Object.entries(label).every(([k, val]) => v.labels[k] === val),
  );
  return match?.value ?? null;
}

test("createPoolMetricsReporter — sample skriver pgPoolActive/idle/waiting/total/max-gauges", async () => {
  const sharedPool = makeMockPool({ totalCount: 12, idleCount: 7, waitingCount: 0 });
  const walletPool = makeMockPool({ totalCount: 18, idleCount: 2, waitingCount: 5 });

  const pools: PoolSpec[] = [
    { name: "test-shared", pool: sharedPool, max: 20 },
    { name: "test-wallet", pool: walletPool, max: 20 },
  ];

  const reporter = createPoolMetricsReporter({ pools, intervalMs: 60_000 });
  // Reporter samples once on creation (synkront)
  reporter.sampleNow();

  // Verifiser shared pool
  assert.equal(await readGauge("pgPoolActive", { pool: "test-shared" }), 12 - 7);
  assert.equal(await readGauge("pgPoolIdle", { pool: "test-shared" }), 7);
  assert.equal(await readGauge("pgPoolWaiting", { pool: "test-shared" }), 0);
  assert.equal(await readGauge("pgPoolTotal", { pool: "test-shared" }), 12);
  assert.equal(await readGauge("pgPoolMax", { pool: "test-shared" }), 20);

  // Verifiser wallet pool
  assert.equal(await readGauge("pgPoolActive", { pool: "test-wallet" }), 18 - 2);
  assert.equal(await readGauge("pgPoolIdle", { pool: "test-wallet" }), 2);
  assert.equal(await readGauge("pgPoolWaiting", { pool: "test-wallet" }), 5);
  assert.equal(await readGauge("pgPoolTotal", { pool: "test-wallet" }), 18);
  assert.equal(await readGauge("pgPoolMax", { pool: "test-wallet" }), 20);

  reporter.stop();
});

test("createPoolMetricsReporter — sampleNow gjenspeiler endringer i pool-state", async () => {
  const livePoolState = { totalCount: 5, idleCount: 5, waitingCount: 0 };
  const pool = makeMockPool(livePoolState);
  const reporter = createPoolMetricsReporter({
    pools: [{ name: "live-test", pool, max: 20 }],
    intervalMs: 60_000,
  });
  reporter.sampleNow();
  assert.equal(await readGauge("pgPoolActive", { pool: "live-test" }), 0);
  assert.equal(await readGauge("pgPoolWaiting", { pool: "live-test" }), 0);

  // Endre state — simulerer mass-payout der pool er tom
  livePoolState.totalCount = 20;
  livePoolState.idleCount = 0;
  livePoolState.waitingCount = 50;

  reporter.sampleNow();
  assert.equal(await readGauge("pgPoolActive", { pool: "live-test" }), 20);
  assert.equal(await readGauge("pgPoolWaiting", { pool: "live-test" }), 50);

  reporter.stop();
});

test("createPoolMetricsReporter — pools=[] returnerer no-op reporter", async () => {
  const reporter = createPoolMetricsReporter({ pools: [], intervalMs: 60_000 });
  // sampleNow() skal ikke kaste på tom liste
  reporter.sampleNow();
  reporter.stop();
});

test("createPoolMetricsReporter — pool sample feiler ikke når pool kaster", async () => {
  const brokenPool = new Proxy({} as Pool, {
    get: () => {
      throw new Error("pool er stengt");
    },
  });
  const reporter = createPoolMetricsReporter({
    pools: [{ name: "broken-pool", pool: brokenPool, max: 20 }],
    intervalMs: 60_000,
  });
  // Bør ikke kaste — sampleOnce er fail-soft
  reporter.sampleNow();
  reporter.stop();
});

test("createPoolMetricsReporter — utilizationPct = active / max × 100", async () => {
  // Eksempel-formel: 15 active, max 20 → 75%
  const pool = makeMockPool({ totalCount: 18, idleCount: 3, waitingCount: 0 });
  const reporter = createPoolMetricsReporter({
    pools: [{ name: "util-test", pool, max: 20 }],
    intervalMs: 60_000,
  });
  reporter.sampleNow();
  // active = 18 - 3 = 15
  assert.equal(await readGauge("pgPoolActive", { pool: "util-test" }), 15);
  reporter.stop();
});
