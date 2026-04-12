/**
 * BIN-164: Per-socket, per-event sliding-window rate limiter for Socket.IO.
 *
 * Prevents abuse by throttling events per socket. Each event type can have
 * its own limit. Disconnected sockets are cleaned up to prevent memory leaks.
 */

export interface RateLimitConfig {
  /** Window duration in milliseconds */
  windowMs: number;
  /** Maximum events allowed within the window */
  maxEvents: number;
}

/** Default per-event rate limits */
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  "room:create":         { windowMs: 60_000, maxEvents: 3 },
  "room:join":           { windowMs: 30_000, maxEvents: 5 },
  "room:resume":         { windowMs: 10_000, maxEvents: 10 },
  "room:configure":      { windowMs: 10_000, maxEvents: 5 },
  "game:start":          { windowMs: 30_000, maxEvents: 3 },
  "game:end":            { windowMs: 30_000, maxEvents: 3 },
  "draw:next":           { windowMs: 2_000,  maxEvents: 5 },
  "draw:extra:purchase": { windowMs: 5_000,  maxEvents: 3 },
  "ticket:mark":         { windowMs: 1_000,  maxEvents: 10 },
  "claim:submit":        { windowMs: 5_000,  maxEvents: 5 },
  "room:state":          { windowMs: 5_000,  maxEvents: 10 },
  "bet:arm":             { windowMs: 5_000,  maxEvents: 10 },
};

const DEFAULT_FALLBACK: RateLimitConfig = { windowMs: 10_000, maxEvents: 20 };
const GC_INTERVAL_MS = 60_000;

export class SocketRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly limits: Record<string, RateLimitConfig>;
  private readonly fallback: RateLimitConfig;
  private gcTimer: ReturnType<typeof setInterval> | null = null;
  private readonly activeSockets = new Set<string>();

  constructor(limits?: Record<string, RateLimitConfig>, fallback?: RateLimitConfig) {
    this.limits = limits ?? DEFAULT_RATE_LIMITS;
    this.fallback = fallback ?? DEFAULT_FALLBACK;
  }

  /** Start periodic garbage collection of stale entries */
  start(): void {
    if (this.gcTimer) return;
    this.gcTimer = setInterval(() => this.gc(), GC_INTERVAL_MS);
    if (this.gcTimer.unref) this.gcTimer.unref();
  }

  /** Stop periodic GC */
  stop(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }

  /**
   * Check whether an event from a socket is allowed.
   * Returns true if allowed, false if rate-limited.
   */
  check(socketId: string, eventName: string, nowMs: number = Date.now()): boolean {
    return this.checkByKey(socketId, eventName, nowMs);
  }

  /**
   * BIN-247: Check rate limit by an arbitrary key (e.g., walletId).
   * Used in addition to socket-based checks so reconnects don't reset counters.
   */
  checkByKey(key: string, eventName: string, nowMs: number = Date.now()): boolean {
    this.activeSockets.add(key);
    const bucketKey = `${key}:${eventName}`;
    const config = this.limits[eventName] ?? this.fallback;

    let timestamps = this.buckets.get(bucketKey);
    if (!timestamps) {
      timestamps = [];
      this.buckets.set(bucketKey, timestamps);
    }

    // Prune timestamps outside window
    const cutoff = nowMs - config.windowMs;
    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= config.maxEvents) {
      return false;
    }

    timestamps.push(nowMs);
    return true;
  }

  /** Remove all tracking data for a disconnected socket */
  cleanup(socketId: string): void {
    this.activeSockets.delete(socketId);
    const prefix = `${socketId}:`;
    for (const key of this.buckets.keys()) {
      if (key.startsWith(prefix)) {
        this.buckets.delete(key);
      }
    }
  }

  /** Periodic GC: remove entries for sockets that are no longer active */
  private gc(): void {
    for (const key of this.buckets.keys()) {
      const socketId = key.split(":")[0];
      if (!this.activeSockets.has(socketId)) {
        this.buckets.delete(key);
      }
    }
  }

  /** Visible for testing */
  get bucketCount(): number {
    return this.buckets.size;
  }

  get activeSocketCount(): number {
    return this.activeSockets.size;
  }
}
