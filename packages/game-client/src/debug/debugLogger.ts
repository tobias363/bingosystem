/**
 * Structured console-logger with trace-id parity (Component 1).
 *
 * Mirrors the shape we expect from Fase 2A backend ErrorCode registry —
 * stable trace-ids like `BIN-RKT-DRAW-001`. Client-side prefix is
 * `CLI-${moduleId}-${seq}` so client traces never collide with server.
 *
 * Color-coded console output (rød/gul/blå/grønn) lets the operator scan
 * the console at a glance during an incident. Each event opens a
 * `console.group` so the operator can collapse repetitive ticks (e.g.
 * draw:new every 4s) and expand only when something is interesting.
 *
 * The logger NEVER throws — a broken log call must not break the game.
 */

import type { DebugEvent, DebugEventSource, LogLevel } from "./types.js";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  success: 25,
  warn: 30,
  error: 40,
};

/**
 * Color palette tuned for both light and dark DevTools themes. Hex values
 * have ≥4.5:1 contrast against #1a1a1a (Chrome dark) and against #f5f5f5
 * (Chrome light). When in doubt, prefer warmer hues for warn/error so they
 * pop in a long log scroll.
 */
const COLORS: Record<LogLevel, string> = {
  debug: "#7c8a99",
  info: "#4ea1ff",
  success: "#3ddc84",
  warn: "#ffbb33",
  error: "#ff5c5c",
};

const SOURCE_TAG: Record<DebugEventSource, string> = {
  "socket-out": "→",
  "socket-in": "←",
  engine: "⚙",
  ui: "👆",
  system: "⚡",
  error: "🛑",
  performance: "⏱",
};

export class DebugLogger {
  private currentLevel: LogLevel = "debug";
  private moduleId: string;
  private seq = 0;
  private listeners: Array<(entry: DebugEvent) => void> = [];

  constructor(moduleId = "client") {
    this.moduleId = moduleId.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 8) || "CLI";
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  getLevel(): LogLevel {
    return this.currentLevel;
  }

  /**
   * Subscribe to log entries — used by the EventBuffer so every log
   * automatically becomes an event. Returns an unsubscribe function.
   */
  subscribe(listener: (entry: DebugEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const ix = this.listeners.indexOf(listener);
      if (ix >= 0) this.listeners.splice(ix, 1);
    };
  }

  /**
   * Generate a fresh trace-id matching backend conventions. Format:
   *   CLI-{module}-{NNN}
   * NNN is zero-padded so traces sort lexicographically.
   */
  newTraceId(): string {
    this.seq++;
    return `CLI-${this.moduleId}-${this.seq.toString().padStart(4, "0")}`;
  }

  /**
   * Emit a structured log line. `payload` is shallow-cloned so the buffer
   * doesn't keep references to live engine state.
   *
   * Returns the constructed DebugEvent so callers (e.g. profilers) can
   * decorate it with timing info before storing.
   */
  log(
    level: LogLevel,
    source: DebugEventSource,
    type: string,
    payload?: unknown,
    options: {
      traceId?: string;
      correlationId?: string;
      dataPath?: string;
      durationMs?: number;
    } = {},
  ): DebugEvent {
    const event: DebugEvent = {
      seq: this.seq + 1,
      timestamp: Date.now(),
      performanceTime:
        typeof performance !== "undefined" ? performance.now() : Date.now(),
      source,
      type,
      traceId: options.traceId ?? this.newTraceId(),
      correlationId: options.correlationId,
      payload: shallowClone(payload),
      dataPath: options.dataPath,
      durationMs: options.durationMs,
    };

    // Notify subscribers FIRST so EventBuffer captures even if console
    // output is suppressed by the level-gate.
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch {
        /* listener errors must never break logging */
      }
    }

    if (LEVELS[level] < LEVELS[this.currentLevel]) {
      return event;
    }

    this.printToConsole(level, source, type, event);
    return event;
  }

  // Convenience helpers — the explicit name surfaces in the console group.
  debug(source: DebugEventSource, type: string, payload?: unknown, opts?: Parameters<typeof this.log>[4]): DebugEvent {
    return this.log("debug", source, type, payload, opts);
  }
  info(source: DebugEventSource, type: string, payload?: unknown, opts?: Parameters<typeof this.log>[4]): DebugEvent {
    return this.log("info", source, type, payload, opts);
  }
  success(source: DebugEventSource, type: string, payload?: unknown, opts?: Parameters<typeof this.log>[4]): DebugEvent {
    return this.log("success", source, type, payload, opts);
  }
  warn(source: DebugEventSource, type: string, payload?: unknown, opts?: Parameters<typeof this.log>[4]): DebugEvent {
    return this.log("warn", source, type, payload, opts);
  }
  error(source: DebugEventSource, type: string, payload?: unknown, opts?: Parameters<typeof this.log>[4]): DebugEvent {
    return this.log("error", source, type, payload, opts);
  }

  // ---- internal ----

  private printToConsole(
    level: LogLevel,
    source: DebugEventSource,
    type: string,
    event: DebugEvent,
  ): void {
    const colour = COLORS[level];
    const tag = SOURCE_TAG[source] ?? "?";
    const label = `%c${tag} [${event.traceId}] ${type}`;
    const css = `color:${colour};font-weight:600`;

    try {
      const fn =
        level === "error" ? console.error :
        level === "warn"  ? console.warn  :
        console.log;
      // group is collapsed by default so a long buffer of debug lines
      // doesn't drown the operator. Operators expand a single group when
      // they need detail.
      const group = (console as unknown as Record<string, unknown>).groupCollapsed as
        | ((label: string, css: string) => void)
        | undefined;
      if (typeof group === "function") {
        group.call(console, label, css);
        if (event.payload !== undefined) {
          fn.call(console, "payload:", event.payload);
        }
        if (event.dataPath) {
          fn.call(console, "path:", event.dataPath);
        }
        if (typeof event.durationMs === "number") {
          fn.call(console, `duration: ${event.durationMs.toFixed(2)} ms`);
        }
        if (event.correlationId) {
          fn.call(console, "correlation:", event.correlationId);
        }
        const groupEnd = (console as unknown as Record<string, unknown>).groupEnd as
          | (() => void)
          | undefined;
        groupEnd?.call(console);
      } else {
        fn.call(console, label, css, event.payload ?? "");
      }
    } catch {
      /* console can throw in restricted iframes */
    }
  }
}

/**
 * Shallow clone of objects/arrays so the buffer doesn't pin live state.
 * Primitives, null, undefined, and unknown types pass through untouched.
 *
 * Deep cloning would be safer but blows up CPU/memory at 500-event buffer
 * scale. Engine state changes that mutate sub-objects in place (e.g.
 * pushing into `drawnNumbers`) are still captured because the array
 * reference is replaced by the engine on every snapshot.
 */
function shallowClone<T>(value: T): T {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t !== "object") return value;
  try {
    if (Array.isArray(value)) {
      return value.slice() as unknown as T;
    }
    return { ...(value as Record<string, unknown>) } as unknown as T;
  } catch {
    return value;
  }
}
