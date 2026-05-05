/**
 * Activation gate for the debug suite.
 *
 * Why a gate at all? Per Tobias-spec 2026-05-05, the suite is opt-in for
 * production: 36 000 concurrent pilot players cannot afford the overhead
 * of an event-buffer + DOM-walking HUD per session, and we can't risk
 * leaking PII through console-logged payloads to ordinary users. Three
 * activation paths cover the different operator workflows:
 *
 *   1. URL-flag `?debug=1` — easiest for one-off troubleshooting.
 *      Persists for the duration of the page-load only.
 *   2. localStorage `spillorama.debug=1` — sticky across reloads. Set it
 *      once via DevTools, debug all you want, remove it when done.
 *   3. Cookie `spillorama.debug=1` — mirrors localStorage but works when
 *      the player is logged in via a hall-terminal kiosk where local
 *      storage may be wiped between shifts.
 *
 * The gate is intentionally generous (any of the three flips it on) — we
 * don't want a developer to wonder "is debug actually on?" mid-incident.
 *
 * Production-safety: when none of the flags are set, this module returns
 * `false` and the suite installer does NOTHING (no namespace, no HUD, no
 * monkey-patching). Even reading this module costs only one URLSearchParams
 * + one localStorage + one document.cookie lookup at app-init time.
 */

const QUERY_KEY = "debug";
const STORAGE_KEY = "spillorama.debug";
const COOKIE_KEY = "spillorama.debug";
const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

/**
 * Read all three activation sources and return true if ANY indicates
 * "enabled". Errors swallowed defensively — a broken cookie should never
 * crash app init.
 */
export function isDebugEnabled(
  win: Pick<Window, "location"> & {
    localStorage?: Storage;
  } & { document?: Document } = window,
): boolean {
  // 1. URL-param.
  try {
    const search = win.location?.search ?? "";
    if (search) {
      const value = new URLSearchParams(search).get(QUERY_KEY);
      if (value !== null && ENABLED_VALUES.has(value.toLowerCase())) {
        return true;
      }
    }
  } catch {
    /* ignore — malformed URL shouldn't disable the gate */
  }

  // 2. localStorage.
  try {
    const value = win.localStorage?.getItem(STORAGE_KEY);
    if (value && ENABLED_VALUES.has(value.toLowerCase())) {
      return true;
    }
  } catch {
    /* ignore — storage can throw in private-browsing or restricted modes */
  }

  // 3. Cookie.
  try {
    const cookieStr = win.document?.cookie ?? "";
    if (cookieStr) {
      const parts = cookieStr.split(";");
      for (const part of parts) {
        const [k, v] = part.trim().split("=");
        if (k === COOKIE_KEY && v && ENABLED_VALUES.has(v.toLowerCase())) {
          return true;
        }
      }
    }
  } catch {
    /* ignore */
  }

  return false;
}

/**
 * Operator helper exposed via the public API to flip the localStorage flag
 * without touching DevTools. Used by the HUD toggle button.
 */
export function persistDebugEnabled(
  enabled: boolean,
  storage: Storage | undefined = typeof window !== "undefined" ? window.localStorage : undefined,
): void {
  if (!storage) return;
  try {
    if (enabled) {
      storage.setItem(STORAGE_KEY, "1");
    } else {
      storage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}
