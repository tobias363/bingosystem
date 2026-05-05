/**
 * Event-history with replay (Component 3).
 *
 * Holds the last N events (default 500) in a circular FIFO. The buffer
 * is the system-of-record the operator queries from console — every
 * other component (StateInspector, NetworkTap, SnapshotManager) feeds
 * into it via `record()`.
 *
 * Why circular? At pilot scale a single Spill 1 round emits ~75 draws +
 * marks + jackpot ticks + room:update broadcasts ≈ 200-300 events. A
 * 500-event window covers the last 1-2 rounds, which is the natural
 * forensic window when an operator goes "what just happened?". Larger
 * windows blow up serialise time on snapshot export.
 *
 * Replay: a synthetic event-stream that the operator can pipe back
 * through their UI (or a test harness) to reproduce a bug locally.
 * `replay()` walks the buffer in chronological order with throttled
 * setTimeouts so the stream isn't a CPU storm.
 */

import type { DebugEvent } from "./types.js";

export interface ReplayOptions {
  /** Lower bound (timestamp ms inclusive). Default 0 — start of buffer. */
  from?: number;
  /** Upper bound (timestamp ms inclusive). Default Infinity — end of buffer. */
  to?: number;
  /**
   * Time-multiplier. 1.0 means "in real time"; 2.0 means "twice as fast";
   * 0 means "as fast as possible" (one event per microtask).
   */
  speed?: number;
  /** Filter applied per event before re-emission. */
  filter?: (e: DebugEvent) => boolean;
  /** Sink — what to do with each replayed event. */
  onEvent: (e: DebugEvent) => void;
}

export interface EventBufferAPI {
  /** Snapshot of the entire buffer (oldest first). */
  all(): DebugEvent[];
  /** Last N events. */
  last(n: number): DebugEvent[];
  /** Filter by predicate. */
  filter(predicate: (e: DebugEvent) => boolean): DebugEvent[];
  /** Match by `type`/`source` — common queries get shorthand. */
  byType(type: string): DebugEvent[];
  bySource(source: string): DebugEvent[];
  /** Drop everything. */
  clear(): void;
  /** Current size (≤ capacity). */
  size(): number;
  /** Configured capacity. */
  capacity(): number;
  /**
   * Replay events to a sink. Returns a Promise that resolves when the
   * stream completes; reject to cancel.
   */
  replay(opts: ReplayOptions): Promise<void>;
  /** Direct insert — used by other components to record their events. */
  record(event: DebugEvent): void;
}

export class EventBuffer implements EventBufferAPI {
  private items: DebugEvent[] = [];
  private cap: number;
  private writeListeners: Array<(event: DebugEvent) => void> = [];

  constructor(capacity = 500) {
    this.cap = Math.max(1, capacity);
  }

  record(event: DebugEvent): void {
    this.items.push(event);
    if (this.items.length > this.cap) {
      // FIFO eviction — splice from head. `items` stays oldest-first which
      // makes `last(n)` cheap and replay natural.
      this.items.splice(0, this.items.length - this.cap);
    }
    for (const fn of this.writeListeners) {
      try {
        fn(event);
      } catch {
        /* listener errors must not abort the write path */
      }
    }
  }

  /**
   * Subscribe to writes — used by SnapshotManager to react to new errors
   * without polling.
   */
  onWrite(listener: (event: DebugEvent) => void): () => void {
    this.writeListeners.push(listener);
    return () => {
      const ix = this.writeListeners.indexOf(listener);
      if (ix >= 0) this.writeListeners.splice(ix, 1);
    };
  }

  all(): DebugEvent[] {
    // Return a copy — operators tend to mutate things they fetch from
    // a debug console (sort, splice, etc.). Insulate the buffer.
    return this.items.slice();
  }

  last(n: number): DebugEvent[] {
    if (n <= 0) return [];
    return this.items.slice(Math.max(0, this.items.length - n));
  }

  filter(predicate: (e: DebugEvent) => boolean): DebugEvent[] {
    return this.items.filter(predicate);
  }

  byType(type: string): DebugEvent[] {
    return this.items.filter((e) => e.type === type);
  }

  bySource(source: string): DebugEvent[] {
    return this.items.filter((e) => e.source === source);
  }

  clear(): void {
    this.items.length = 0;
  }

  size(): number {
    return this.items.length;
  }

  capacity(): number {
    return this.cap;
  }

  async replay(opts: ReplayOptions): Promise<void> {
    const from = opts.from ?? 0;
    const to = opts.to ?? Number.POSITIVE_INFINITY;
    const speed = opts.speed === undefined ? 1 : Math.max(0, opts.speed);
    const filter = opts.filter ?? (() => true);
    const events = this.items.filter(
      (e) => e.timestamp >= from && e.timestamp <= to && filter(e),
    );

    if (events.length === 0) return;
    const baseTs = events[0].timestamp;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const realDelay = i === 0 ? 0 : ev.timestamp - events[i - 1].timestamp;
      const wait = speed === 0 ? 0 : realDelay / speed;
      if (wait > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, wait));
      }
      try {
        opts.onEvent(ev);
      } catch {
        /* sink errors must not abort the stream */
      }
      // Mark progress on long replays so an operator can tail it.
      void baseTs; // currently unused but kept for future "% complete" display
    }
  }
}

/**
 * Public façade exposed on `window.spillorama.debug.events`. The factory
 * binds methods so destructured calls (`const { last } = window.spillorama.debug.events; last(10)`)
 * still work — operators try this kind of thing all the time.
 */
export function makeEventBufferAPI(buffer: EventBuffer): EventBufferAPI {
  return {
    all: buffer.all.bind(buffer),
    last: buffer.last.bind(buffer),
    filter: buffer.filter.bind(buffer),
    byType: buffer.byType.bind(buffer),
    bySource: buffer.bySource.bind(buffer),
    clear: buffer.clear.bind(buffer),
    size: buffer.size.bind(buffer),
    capacity: buffer.capacity.bind(buffer),
    replay: buffer.replay.bind(buffer),
    record: buffer.record.bind(buffer),
  };
}
