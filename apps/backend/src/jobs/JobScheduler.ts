/**
 * BIN-582: Generic job scheduler for periodic background tasks.
 *
 * Wraps the `setInterval`-pattern already used by `createDailyReportScheduler`
 * and adds:
 *   - Optional Redis-backed lock for multi-instance deploys (one instance
 *     runs the tick, others skip it).
 *   - Per-job feature-flag support.
 *   - Structured logs for start/end/duration with items processed.
 *
 * This is intentionally a small wrapper, not a full cron engine. `node-cron`
 * was considered but rejected — the existing codebase (DrawScheduler,
 * DailyReport, RateLimiters) uses `setInterval`, and none of the three new
 * jobs needs precise wall-clock firing. "Daily at 00:00" is implemented by
 * polling at a short interval and letting the job compare a date-key against
 * its own `lastRunKey`, the same pattern as `createDailyReportScheduler`.
 */
import type { RedisSchedulerLock } from "../store/RedisSchedulerLock.js";
import { logger as rootLogger, type Logger } from "../util/logger.js";

const log = rootLogger.child({ module: "job-scheduler" });

export interface JobResult {
  /** Items processed in this tick (for logging/metrics). */
  itemsProcessed: number;
  /** Optional status note (e.g. "stubbed — table missing"). */
  note?: string;
}

export interface JobDefinition {
  /** Unique identifier, used for logs, locks, and feature flags. */
  name: string;
  /** Human-readable description of what the job does. */
  description: string;
  /** Tick interval in ms. Job decides internally when to actually run work. */
  intervalMs: number;
  /** Whether the job is enabled. When false, the tick loop is never started. */
  enabled: boolean;
  /**
   * The work function. Called on every tick. It MUST itself guard against
   * running work too often (e.g. daily jobs should check a date-key and
   * return 0 items when already done for today).
   */
  run(nowMs: number): Promise<JobResult>;
}

export interface JobSchedulerOptions {
  /** Master kill-switch; when false, no jobs run regardless of per-job flag. */
  enabled: boolean;
  /** Redis lock (optional). When present, each tick is guarded by a lock. */
  lock?: RedisSchedulerLock | null;
  /**
   * Lock TTL per tick in ms. Must be longer than a realistic tick duration
   * (default: 60s — long enough for Swedbank reconcile loops, short enough
   * that a crashed instance releases within a minute).
   */
  lockTtlMs?: number;
  /** Override for testing. */
  logger?: Logger;
}

interface RunningJob {
  definition: JobDefinition;
  handle: NodeJS.Timeout;
}

export interface JobScheduler {
  /** Register a job. Must be called before `start()`. */
  register(job: JobDefinition): void;
  /** Start all enabled jobs. */
  start(): void;
  /** Stop all running jobs. */
  stop(): void;
  /** Snapshot of registered/running state (for /health etc.). */
  status(): Array<{ name: string; enabled: boolean; running: boolean }>;
  /** For tests: force a tick of a specific job synchronously. */
  runOnce(jobName: string, nowMs?: number): Promise<JobResult | null>;
}

export function createJobScheduler(options: JobSchedulerOptions): JobScheduler {
  const logger = options.logger ?? log;
  const lockTtlMs = options.lockTtlMs ?? 60_000;
  const jobs = new Map<string, JobDefinition>();
  const running = new Map<string, RunningJob>();
  let started = false;

  async function tick(job: JobDefinition): Promise<void> {
    const nowMs = Date.now();
    const start = process.hrtime.bigint();

    async function body(): Promise<JobResult> {
      logger.debug({ job: job.name }, "tick:start");
      const result = await job.run(nowMs);
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      logger.info(
        { job: job.name, itemsProcessed: result.itemsProcessed, durationMs: Math.round(durationMs), note: result.note },
        "tick:done"
      );
      return result;
    }

    try {
      if (options.lock) {
        const acquired = await options.lock.withLock(`job:${job.name}`, body, lockTtlMs);
        if (acquired === null) {
          logger.debug({ job: job.name }, "tick:skipped (lock held by peer)");
        }
      } else {
        await body();
      }
    } catch (err) {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      logger.error(
        { err, job: job.name, durationMs: Math.round(durationMs) },
        "tick:error"
      );
    }
  }

  return {
    register(job: JobDefinition): void {
      if (jobs.has(job.name)) {
        throw new Error(`Job already registered: ${job.name}`);
      }
      if (started) {
        throw new Error("Cannot register job after start()");
      }
      jobs.set(job.name, job);
    },

    start(): void {
      if (started) return;
      started = true;
      if (!options.enabled) {
        logger.warn("JobScheduler disabled via master flag — no jobs will run");
        return;
      }
      for (const job of jobs.values()) {
        if (!job.enabled) {
          logger.info({ job: job.name }, "job disabled via per-job flag");
          continue;
        }
        // Run immediately once (matches createDailyReportScheduler pattern),
        // then on the configured interval.
        void tick(job);
        const handle = setInterval(() => { void tick(job); }, job.intervalMs);
        handle.unref();
        running.set(job.name, { definition: job, handle });
        logger.info({ job: job.name, intervalMs: job.intervalMs }, "job started");
      }
    },

    stop(): void {
      for (const { handle } of running.values()) {
        clearInterval(handle);
      }
      running.clear();
      started = false;
    },

    status(): Array<{ name: string; enabled: boolean; running: boolean }> {
      return Array.from(jobs.values()).map((j) => ({
        name: j.name,
        enabled: j.enabled,
        running: running.has(j.name),
      }));
    },

    async runOnce(jobName: string, nowMs: number = Date.now()): Promise<JobResult | null> {
      const job = jobs.get(jobName);
      if (!job) return null;
      return job.run(nowMs);
    },
  };
}
