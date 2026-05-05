/**
 * Public entry-point for the client-side debug suite (Fase 2B).
 *
 * Hosts (Game Controllers, visual-harness, dev pages) import:
 *
 *   import { installDebugSuite, setDebugStateGetter, isDebugEnabled }
 *     from "@spillorama/game-client/debug";
 *
 * Production-safety: all imports tree-shake away from the prod bundle
 * unless something actually invokes `installDebugSuite`. The activation
 * gate then short-circuits and zero work is done at runtime.
 */

export {
  installDebugSuite,
  installDebugSuiteVisualOnly,
  setDebugStateGetter,
  DEBUG_SUITE_VERSION,
} from "./installDebugSuite.js";
export { isDebugEnabled, persistDebugEnabled } from "./activation.js";
export type {
  DebugEvent,
  DebugEventSource,
  DebugSnapshot,
  DebugSuiteAPI,
  InstallOptions,
  LogLevel,
} from "./types.js";
