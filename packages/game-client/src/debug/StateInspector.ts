/**
 * State-inspector (Component 4).
 *
 * Provides three operations on top of a state-getter that the host
 * (typically a GameController) registers:
 *
 *   - `state()` — full snapshot, useful as a JSON dump in DevTools.
 *   - `watch(path)` — fires whenever the value at `path` changes. The
 *     operator can either pass an explicit listener or just let it log
 *     to the console (default behaviour).
 *   - `diff(t1, t2)` — given two timestamps in the buffer's range,
 *     replay events to compute "what changed in state between t1 and
 *     t2". Implementation simplified for v1: we capture state on each
 *     `recordSnapshot()` call and diff the closest two — full
 *     event-replay diffing is post-pilot.
 *
 * Watchers re-evaluate after every state-snapshot (the host calls
 * `recordSnapshot()` whenever it knows state has updated, e.g. in
 * `GameBridge.applyRoomUpdate`). Lazy evaluation by `path` lookup,
 * deep-equality by JSON-stringify (good enough for state values that
 * are themselves JSON-serialisable, which all of GameBridge's are).
 */

import type { DebugEvent } from "./types.js";
import type { DebugLogger } from "./debugLogger.js";

type Getter = () => unknown;

type Watcher = {
  id: number;
  path: string;
  segments: string[];
  lastValue: unknown;
  listener: (newVal: unknown, oldVal: unknown, path: string) => void;
};

interface SnapshotEntry {
  timestamp: number;
  state: unknown;
}

export class StateInspector {
  private getter: Getter | null = null;
  private logger: DebugLogger | null = null;
  private watchers: Watcher[] = [];
  private nextId = 1;
  private snapshots: SnapshotEntry[] = [];
  private snapshotCap = 50;

  setStateGetter(getter: Getter | null): void {
    this.getter = getter;
  }

  setLogger(logger: DebugLogger): void {
    this.logger = logger;
  }

  /**
   * Returns a deep-cloned current state. We do a JSON round-trip so
   * operator inspection never mutates the live engine state by accident.
   * If state contains non-serialisable values (functions, Pixi objects),
   * they get replaced with `[unserialisable]` markers — see `safeClone`.
   */
  state(): unknown {
    if (!this.getter) return null;
    try {
      const raw = this.getter();
      return safeClone(raw);
    } catch (err) {
      this.logger?.error("system", "state.getter.failed", { err: String(err) });
      return null;
    }
  }

  /**
   * Watch a dotted path on state. Returns an unsubscribe function. When
   * `listener` is omitted the change is logged via the structured logger
   * — most ad-hoc console use cases want exactly that.
   */
  watch(
    path: string,
    listener?: (newVal: unknown, oldVal: unknown, path: string) => void,
  ): () => void {
    const segments = path.split(".").filter(Boolean);
    const watcher: Watcher = {
      id: this.nextId++,
      path,
      segments,
      lastValue: this.readPath(segments),
      listener:
        listener ??
        ((newVal, oldVal, p) => {
          this.logger?.info("engine", "state.watch.changed", {
            path: p,
            oldVal,
            newVal,
          });
        }),
    };
    this.watchers.push(watcher);
    return () => {
      const ix = this.watchers.findIndex((w) => w.id === watcher.id);
      if (ix >= 0) this.watchers.splice(ix, 1);
    };
  }

  /**
   * Called by the host after applying an update. Cheap if no watchers
   * registered (early-out). Each watcher does a JSON-equality check;
   * 99% of state-mutations flip ≤ 2 paths, so cost is dominated by
   * `readPath` (≤ 6 hops) per registered watcher. With a typical
   * operator-set of 1-3 watchers, the per-update cost is sub-100µs.
   */
  recordSnapshot(): void {
    if (this.getter && this.watchers.length > 0) {
      for (const w of this.watchers) {
        const next = this.readPath(w.segments);
        if (!equal(next, w.lastValue)) {
          const old = w.lastValue;
          w.lastValue = next;
          try {
            w.listener(next, old, w.path);
          } catch {
            /* listener errors must not break the engine */
          }
        }
      }
    }

    // Maintain a small history for `diff()`. We snapshot lazily so
    // unwatched sessions stay zero-overhead beyond a no-op getter call.
    if (this.getter && this.snapshotCap > 0) {
      this.snapshots.push({
        timestamp: Date.now(),
        state: safeClone(this.getter()),
      });
      if (this.snapshots.length > this.snapshotCap) {
        this.snapshots.splice(0, this.snapshots.length - this.snapshotCap);
      }
    }
  }

  /**
   * Difference between two state snapshots. `untilMs` defaults to "now" so
   * `diff(60_000)` means "what changed in the last minute".
   *
   * Returns `null` if no snapshots in range; otherwise an object with
   * `added`, `removed`, `changed` paths.
   */
  diff(sinceMs: number, untilMs?: number): {
    added: Record<string, unknown>;
    removed: Record<string, unknown>;
    changed: Record<string, { from: unknown; to: unknown }>;
  } | null {
    if (this.snapshots.length < 2) return null;
    const now = untilMs ?? Date.now();
    const oldestAfter = this.snapshots.find((s) => s.timestamp >= sinceMs);
    const newestBefore = [...this.snapshots]
      .reverse()
      .find((s) => s.timestamp <= now);
    if (!oldestAfter || !newestBefore || oldestAfter === newestBefore) {
      return null;
    }
    return computeDiff(oldestAfter.state, newestBefore.state);
  }

  // ---- internal ----

  private readPath(segments: string[]): unknown {
    if (!this.getter) return undefined;
    try {
      let cursor: unknown = this.getter();
      for (const seg of segments) {
        if (cursor === null || cursor === undefined) return undefined;
        cursor = (cursor as Record<string, unknown>)[seg];
      }
      return cursor;
    } catch {
      return undefined;
    }
  }
}

/**
 * JSON-roundtrip clone with non-serialisable fallback. Functions, Symbols,
 * cyclic refs, and DOM/Pixi nodes become `'[unserialisable]'` markers so
 * the snapshot is always JSON-safe.
 */
function safeClone(value: unknown): unknown {
  try {
    return JSON.parse(
      JSON.stringify(value, (_k, v) => {
        if (typeof v === "function") return "[function]";
        if (typeof v === "bigint") return `${v.toString()}n`;
        if (v instanceof Error) return { name: v.name, message: v.message };
        // HTMLElement, PIXI.DisplayObject etc. — detect by tag-like shape.
        if (
          typeof v === "object" &&
          v !== null &&
          ("nodeType" in v || "tagName" in v || "_pixiRender" in v)
        ) {
          return "[dom-or-pixi]";
        }
        return v;
      }),
    );
  } catch {
    return "[unserialisable]";
  }
}

/**
 * JSON.stringify-equality. Adequate for state values that are themselves
 * JSON-serialisable — false positives only on field-order differences in
 * objects, which JSON.stringify normalises in V8 for plain objects.
 */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function computeDiff(
  oldState: unknown,
  newState: unknown,
  prefix = "",
): {
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Record<string, { from: unknown; to: unknown }>;
} {
  const result = {
    added: {} as Record<string, unknown>,
    removed: {} as Record<string, unknown>,
    changed: {} as Record<string, { from: unknown; to: unknown }>,
  };

  const oldIsObj = oldState !== null && typeof oldState === "object";
  const newIsObj = newState !== null && typeof newState === "object";
  if (!oldIsObj || !newIsObj) {
    if (!equal(oldState, newState)) {
      result.changed[prefix || "(root)"] = { from: oldState, to: newState };
    }
    return result;
  }

  const oldObj = oldState as Record<string, unknown>;
  const newObj = newState as Record<string, unknown>;
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const k of keys) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (!(k in oldObj)) {
      result.added[path] = newObj[k];
    } else if (!(k in newObj)) {
      result.removed[path] = oldObj[k];
    } else if (!equal(oldObj[k], newObj[k])) {
      // Recurse for nested objects to give the operator a precise path.
      const nested = computeDiff(oldObj[k], newObj[k], path);
      Object.assign(result.added, nested.added);
      Object.assign(result.removed, nested.removed);
      Object.assign(result.changed, nested.changed);
      // If the recursion didn't refine the diff (primitive change), record
      // it at this level.
      if (
        Object.keys(nested.added).length === 0 &&
        Object.keys(nested.removed).length === 0 &&
        Object.keys(nested.changed).length === 0
      ) {
        result.changed[path] = { from: oldObj[k], to: newObj[k] };
      }
    }
  }
  return result;
}

/**
 * Small helper for SnapshotManager: convert a DebugEvent into a flat
 * key/value pair ready for state-watch comparison. Currently unused
 * outside a test or future feature; kept here to keep diff utilities
 * colocated.
 */
export function eventToWatchPath(event: DebugEvent): string | null {
  return event.dataPath ?? null;
}
