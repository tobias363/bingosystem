/**
 * Performance profiler (Component 7).
 *
 * Two surfaces:
 *
 *   - Manual: `profile.start('label')` / `profile.end('label')` for
 *     ad-hoc measurement of any code path. Uses `performance.now()` for
 *     sub-millisecond resolution.
 *
 *   - Automatic: `recordEventLatency(eventType, durationMs)` is called by
 *     the suite installer for every socket-event the bridge handles. This
 *     gives us a per-event-type histogram without any operator action.
 *
 * `report()` produces a small p50/p95/p99 table per label. We use a
 * naïve sort-and-pick for percentiles — at 500-event scale it's <1ms.
 *
 * The profiler does NOT call `performance.mark`/`measure`; those land in
 * the browser's own DevTools timeline which can be confusing when you
 * also have our own logger printing. Stick to in-memory math.
 */

const PERCENTILES = [50, 95, 99] as const;
type Percentile = (typeof PERCENTILES)[number];

interface MeasureBag {
  /** All recorded durations (ms). Capped to MAX_SAMPLES per label. */
  samples: number[];
  /** Currently-open `start()` calls that haven't been `end()`-ed. */
  open: Map<string, number>;
}

const MAX_SAMPLES_PER_LABEL = 1000;

export interface ProfilerReport {
  label: string;
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface ProfilerAPI {
  start: (label: string, key?: string) => void;
  end: (label: string, key?: string) => number | null;
  recordEventLatency: (eventType: string, durationMs: number) => void;
  report: () => ProfilerReport[];
  reset: () => void;
}

export class PerformanceProfiler {
  private bags = new Map<string, MeasureBag>();

  start(label: string, key = ""): void {
    const bag = this.getBag(label);
    const fullKey = key || `_default_${bag.open.size}`;
    bag.open.set(fullKey, performance.now());
  }

  end(label: string, key = ""): number | null {
    const bag = this.bags.get(label);
    if (!bag) return null;
    const fullKey = key || (() => {
      // Pick the most recently-opened key when none specified — works for
      // the common single-stream case.
      const keys = Array.from(bag.open.keys());
      return keys.length > 0 ? keys[keys.length - 1] : "";
    })();
    const startedAt = bag.open.get(fullKey);
    if (startedAt === undefined) return null;
    const duration = performance.now() - startedAt;
    bag.open.delete(fullKey);
    this.recordSample(bag, duration);
    return duration;
  }

  /** Auto-tracking hook for socket-events / engine ticks. */
  recordEventLatency(eventType: string, durationMs: number): void {
    if (durationMs < 0 || !Number.isFinite(durationMs)) return;
    const bag = this.getBag(`event:${eventType}`);
    this.recordSample(bag, durationMs);
  }

  report(): ProfilerReport[] {
    const out: ProfilerReport[] = [];
    for (const [label, bag] of this.bags) {
      if (bag.samples.length === 0) continue;
      // Sort once per label per report — p50/p95/p99 share the result.
      const sorted = bag.samples.slice().sort((a, b) => a - b);
      const total = sorted.reduce((sum, v) => sum + v, 0);
      out.push({
        label,
        count: sorted.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean: total / sorted.length,
        p50: pickPercentile(sorted, 50),
        p95: pickPercentile(sorted, 95),
        p99: pickPercentile(sorted, 99),
      });
    }
    // Sort by p95 descending so the slowest paths float to the top — what
    // the operator usually wants to see during an incident.
    out.sort((a, b) => b.p95 - a.p95);
    return out;
  }

  reset(): void {
    this.bags.clear();
  }

  // ---- internal ----

  private getBag(label: string): MeasureBag {
    let bag = this.bags.get(label);
    if (!bag) {
      bag = { samples: [], open: new Map() };
      this.bags.set(label, bag);
    }
    return bag;
  }

  private recordSample(bag: MeasureBag, duration: number): void {
    bag.samples.push(duration);
    if (bag.samples.length > MAX_SAMPLES_PER_LABEL) {
      bag.samples.splice(0, bag.samples.length - MAX_SAMPLES_PER_LABEL);
    }
  }
}

/**
 * Pick the value at the given percentile from a sorted (asc) array. Linear
 * interpolation between adjacent ranks.
 */
function pickPercentile(sorted: number[], percentile: Percentile | number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
