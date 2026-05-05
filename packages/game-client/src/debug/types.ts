/**
 * Shared type definitions for the client-side debug suite (Fase 2B,
 * 2026-05-05).
 *
 * The suite is opt-in production tooling — see CLIENT_DEBUG_SUITE.md for
 * activation, recipes, and the rationale for each component. This file
 * only declares the cross-module contracts (event-shape, log-level,
 * snapshot-schema) so individual modules stay focused on behaviour.
 *
 * All public surfaces are namespaced under `window.spillorama.debug.*`
 * and ONLY become available when the suite is activated (see
 * `isDebugEnabled` in `activation.ts`). When disabled, the namespace is
 * never installed and per-module overhead is zero.
 *
 * Trace-id format mirrors the backend ErrorCode registry being added in
 * Fase 2A. We don't import from backend (to keep client bundle clean);
 * we just share the shape: `${prefix}-${kebab-cased-domain}-${seq}` —
 * e.g. `BIN-RKT-DRAW-001`. Client-side traces use the prefix
 * `CLI-${moduleId}` so they cannot collide with server traces.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "success";

/**
 * Source of a debug-event. `socket-out` is what the client sends, `socket-in`
 * is what the client receives. `engine` covers GameBridge mutations.
 * `ui` covers user-driven actions (click, scene-change). `system` covers
 * internal lifecycle (mount, unmount, resync).
 */
export type DebugEventSource =
  | "socket-out"
  | "socket-in"
  | "engine"
  | "ui"
  | "system"
  | "error"
  | "performance";

/**
 * One entry in the circular buffer. Kept small so 500 entries fit
 * comfortably in memory (~250-500KB depending on payloads).
 *
 * `payload` is shallow-cloned at insertion to avoid keeping references
 * to large game-state objects that the engine continues to mutate.
 */
export interface DebugEvent {
  /** Monotonic sequence — lets you sort even when timestamps tie. */
  seq: number;
  /** Wall-clock millis (Date.now()). */
  timestamp: number;
  /** High-resolution timestamp for latency math. */
  performanceTime: number;
  /** Logical category (`socket-in`, `engine`, …). */
  source: DebugEventSource;
  /** Free-form event-name within the source (`draw:new`, `state.mutated`, …). */
  type: string;
  /** Trace-id matching backend conventions (see file header). */
  traceId: string;
  /** Optional: correlation-id linking related events across sources. */
  correlationId?: string;
  /** Shallow-cloned payload — never the live engine reference. */
  payload?: unknown;
  /** Where in the state tree this event mutates (e.g. `room.drawnNumbers`). */
  dataPath?: string;
  /** Latency in ms (e.g. ack RTT, render duration) — populated when known. */
  durationMs?: number;
}

/** Options accepted by `installDebugSuite()`. */
export interface InstallOptions {
  /**
   * Anchor the HUD into a specific element. Defaults to `document.body`.
   * Useful for tests and visual-harness, where the body has dev-chrome.
   */
  hudParent?: HTMLElement;
  /**
   * Game slug — used to scope log namespacing and snapshots. The game
   * controller passes `bingo`, `rocket`, `monsterbingo`, etc.
   */
  gameSlug?: string;
  /** Hall id for the active session (first 8 chars only in HUD). */
  hallId?: string;
  /** Player id (first 8 chars only — never log full PII). */
  playerId?: string;
  /** Wallet id (first 8 chars only). */
  walletId?: string;
}

/**
 * Snapshot of the client's `GameState` plus surrounding context. Saved to
 * IndexedDB on every captured error and exportable from the console.
 *
 * NB: only safe-to-serialise fields are kept. We strip Pixi DisplayObjects,
 * sockets, and any value with circular refs.
 */
export interface DebugSnapshot {
  id: string;
  createdAt: number;
  reason: string;
  /** Last 100 events leading up to the snapshot. */
  events: DebugEvent[];
  /** Sanitised game-state, if a getter was registered. */
  state: unknown;
  /** Process info: URL, user-agent (truncated), perf.memory. */
  env: {
    href: string;
    userAgent: string;
    memory?: { jsHeapSizeLimit?: number; totalJSHeapSize?: number; usedJSHeapSize?: number };
    connection?: { effectiveType?: string; rtt?: number; downlink?: number };
  };
}

/**
 * Public window-namespace API. Listed here as a single source of truth so
 * `installDebugSuite` and the README can both refer to it.
 */
export interface DebugSuiteAPI {
  events: import("./EventBuffer.js").EventBufferAPI;
  state: () => unknown;
  diff: (sinceMs: number, untilMs?: number) => unknown;
  watch: (path: string, listener?: (newVal: unknown, oldVal: unknown) => void) => () => void;
  emit: (name: string, payload: unknown) => Promise<unknown>;
  simulateRecv: (name: string, payload: unknown) => void;
  simulateOffline: (durationMs: number) => Promise<void>;
  simulateLatency: (ms: number) => void;
  simulatePacketLoss: (percent: number) => void;
  simulateRaceCondition: (
    config: import("./EdgeCaseSimulator.js").RaceCondition,
  ) => Promise<void>;
  profile: import("./PerformanceProfiler.js").ProfilerAPI;
  stress: (config: import("./StressTester.js").StressConfig) => Promise<unknown>;
  network: import("./NetworkTap.js").NetworkAPI;
  snapshots: () => DebugSnapshot[];
  snapshot: (id: string) => DebugSnapshot | null;
  takeSnapshot: (reason: string) => Promise<DebugSnapshot>;
  setLogLevel: (level: LogLevel) => void;
  toggleHud: () => void;
  installed: true;
  version: string;
}

declare global {
  interface Window {
    spillorama?: {
      debug?: DebugSuiteAPI;
    };
  }
}
