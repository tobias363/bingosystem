// Tiny HTML-escape helper used by all /pages/games/** render-functions.
// Kept here instead of duplicated per-file (matches the Placeholder.ts pattern).

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c] ?? c);
}
