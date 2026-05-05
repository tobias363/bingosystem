/**
 * Stress-tester (Component 8).
 *
 * Exposes recipes for hammering the client + server with deterministic
 * volumes, then reports observed metrics so the operator can compare a
 * "good day" run with a "bad day" run.
 *
 * Three recipes for now (more added as scenarios surface):
 *
 *   - `rapidPurchase: N` — fire `N` `bet:arm` emits back-to-back, each
 *     buying 1 ticket. Stresses the server's idempotency-key path and
 *     wallet-debit serialization.
 *
 *   - `rapidJoin: N` — fire `N` `room:join` emits with the same room
 *     code. Tests how the server handles a thundering-herd join (e.g.
 *     when 100 spectators tap "Spill nå" simultaneously).
 *
 *   - `longSession: durationSec` — sit idle for `durationSec` seconds
 *     while the operator does whatever they normally would. Used to
 *     surface memory leaks and accumulating timer growth — paired with
 *     `performance.memory` snapshots.
 *
 * Reports come back as a structured object for further inspection and
 * are also dumped to the console.
 */

import type { SpilloramaSocket } from "../net/SpilloramaSocket.js";
import type { DebugLogger } from "./debugLogger.js";
import type { PerformanceProfiler } from "./PerformanceProfiler.js";

export interface RapidPurchaseConfig {
  rapidPurchase: number;
  roomCode?: string;
  ticketsPerCall?: number;
  intervalMs?: number;
}

export interface RapidJoinConfig {
  rapidJoin: number;
  roomCode?: string;
  hallId?: string;
  intervalMs?: number;
}

export interface LongSessionConfig {
  longSession: number;
  /** Sample interval in ms. Default 5000. */
  sampleIntervalMs?: number;
}

export type StressConfig =
  | RapidPurchaseConfig
  | RapidJoinConfig
  | LongSessionConfig;

export interface StressReport {
  config: StressConfig;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  ok: number;
  failed: number;
  /** Per-call latencies (ms). May be empty for longSession. */
  latencies: number[];
  /** Summary lines shown in the console. */
  summary: string[];
}

interface SocketLike {
  __emitForDebug?: (event: string, payload: unknown) => Promise<{ ok: boolean }>;
  isConnected: () => boolean;
}

export class StressTester {
  private socket: SpilloramaSocket | null = null;
  private logger: DebugLogger | null = null;
  private profiler: PerformanceProfiler | null = null;

  setSocket(socket: SpilloramaSocket | null): void {
    this.socket = socket;
  }

  setLogger(logger: DebugLogger): void {
    this.logger = logger;
  }

  setProfiler(profiler: PerformanceProfiler): void {
    this.profiler = profiler;
  }

  async run(config: StressConfig): Promise<StressReport> {
    if ("rapidPurchase" in config) {
      return this.runRapidPurchase(config);
    }
    if ("rapidJoin" in config) {
      return this.runRapidJoin(config);
    }
    if ("longSession" in config) {
      return this.runLongSession(config);
    }
    const exhaustive: never = config;
    void exhaustive;
    throw new Error("unknown stress config");
  }

  // ---- recipes ----

  private async runRapidPurchase(cfg: RapidPurchaseConfig): Promise<StressReport> {
    const sock = this.socket as unknown as SocketLike | null;
    const startedAt = Date.now();
    const start = performance.now();
    const latencies: number[] = [];
    let ok = 0;
    let failed = 0;

    if (!sock?.__emitForDebug) {
      return this.failingReport(cfg, "no-socket");
    }

    this.logger?.info("system", "stress.rapidPurchase.start", { count: cfg.rapidPurchase });
    for (let i = 0; i < cfg.rapidPurchase; i++) {
      const t0 = performance.now();
      try {
        const res = await sock.__emitForDebug("bet:arm", {
          roomCode: cfg.roomCode ?? "STRESS",
          ticketCount: cfg.ticketsPerCall ?? 1,
          armed: true,
        });
        if (res?.ok) ok++; else failed++;
      } catch {
        failed++;
      }
      const dur = performance.now() - t0;
      latencies.push(dur);
      this.profiler?.recordEventLatency("stress.rapidPurchase", dur);
      if (cfg.intervalMs) {
        await new Promise((r) => setTimeout(r, cfg.intervalMs));
      }
    }

    const report = this.makeReport(cfg, startedAt, start, ok, failed, latencies);
    this.logger?.success("system", "stress.rapidPurchase.end", report);
    return report;
  }

  private async runRapidJoin(cfg: RapidJoinConfig): Promise<StressReport> {
    const sock = this.socket as unknown as SocketLike | null;
    const startedAt = Date.now();
    const start = performance.now();
    const latencies: number[] = [];
    let ok = 0;
    let failed = 0;

    if (!sock?.__emitForDebug) {
      return this.failingReport(cfg, "no-socket");
    }

    this.logger?.info("system", "stress.rapidJoin.start", { count: cfg.rapidJoin });
    // Fire all in parallel — the point of the recipe is "thundering herd".
    const tasks: Array<Promise<void>> = [];
    for (let i = 0; i < cfg.rapidJoin; i++) {
      const t0 = performance.now();
      tasks.push(
        sock
          .__emitForDebug("room:join", {
            roomCode: cfg.roomCode ?? "STRESS",
            hallId: cfg.hallId ?? "stress-hall",
          })
          .then((res) => {
            if (res?.ok) ok++; else failed++;
          })
          .catch(() => {
            failed++;
          })
          .finally(() => {
            const dur = performance.now() - t0;
            latencies.push(dur);
            this.profiler?.recordEventLatency("stress.rapidJoin", dur);
          }),
      );
    }
    await Promise.all(tasks);

    const report = this.makeReport(cfg, startedAt, start, ok, failed, latencies);
    this.logger?.success("system", "stress.rapidJoin.end", report);
    return report;
  }

  private async runLongSession(cfg: LongSessionConfig): Promise<StressReport> {
    const startedAt = Date.now();
    const start = performance.now();
    const sampleInterval = cfg.sampleIntervalMs ?? 5000;
    const samples: Array<{ t: number; mem?: number }> = [];

    this.logger?.info("system", "stress.longSession.start", {
      durationSec: cfg.longSession,
    });
    const deadline = start + cfg.longSession * 1000;

    while (performance.now() < deadline) {
      const mem =
        (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory
          ?.usedJSHeapSize;
      samples.push({ t: performance.now() - start, mem });
      this.logger?.debug("performance", "stress.longSession.sample", { mem });
      await new Promise((r) => setTimeout(r, sampleInterval));
    }

    const report = this.makeReport(cfg, startedAt, start, samples.length, 0, []);
    report.summary.push(`samples: ${samples.length}`);
    if (samples.length >= 2) {
      const first = samples[0].mem ?? 0;
      const last = samples[samples.length - 1].mem ?? 0;
      const drift = last - first;
      report.summary.push(
        `memory drift: ${(drift / 1024 / 1024).toFixed(2)} MB over ${cfg.longSession}s`,
      );
    }
    this.logger?.success("system", "stress.longSession.end", report);
    return report;
  }

  // ---- helpers ----

  private makeReport(
    cfg: StressConfig,
    startedAt: number,
    perfStart: number,
    ok: number,
    failed: number,
    latencies: number[],
  ): StressReport {
    const endedAt = Date.now();
    const durationMs = performance.now() - perfStart;
    const summary: string[] = [];
    summary.push(`ok: ${ok}, failed: ${failed}`);
    if (latencies.length > 0) {
      const sorted = latencies.slice().sort((a, b) => a - b);
      summary.push(
        `latency p50=${sorted[Math.floor(sorted.length * 0.5)].toFixed(2)}ms ` +
          `p95=${sorted[Math.floor(sorted.length * 0.95)].toFixed(2)}ms ` +
          `max=${sorted[sorted.length - 1].toFixed(2)}ms`,
      );
    }
    return { config: cfg, startedAt, endedAt, durationMs, ok, failed, latencies, summary };
  }

  private failingReport(cfg: StressConfig, reason: string): StressReport {
    this.logger?.error("system", "stress.failed", { reason });
    return {
      config: cfg,
      startedAt: Date.now(),
      endedAt: Date.now(),
      durationMs: 0,
      ok: 0,
      failed: 0,
      latencies: [],
      summary: [`failed: ${reason}`],
    };
  }
}
