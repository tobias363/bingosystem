#!/usr/bin/env node
/**
 * Custom XSS-prevention lint for apps/admin-web/src/.
 *
 * **Background (Bølge 2B, FE-P0-002 + FIN-P1-01):**
 * Spillorama admin-web previously had 48 duplicate `escapeHtml` impls and
 * 27 reflected-XSS sinks where attacker-controlled `${path}` was injected
 * into innerHTML without escaping. This lint catches NEW occurrences of
 * those patterns before they land.
 *
 * **What it bans (FAIL — exit 1):**
 *
 * 1. **Duplicate escapeHtml/escapeAttr impls** (`no-duplicate-escapeHtml`)
 *    — every `function escapeHtml`, `const escapeHtml`, `function escapeAttr`,
 *    or `const escapeAttr` outside the canonical
 *    `apps/admin-web/src/utils/escapeHtml.ts` (and the legacy re-export
 *    shim `apps/admin-web/src/pages/games/common/escape.ts`) is a
 *    violation.
 *
 * 2. **Unknown-route innerHTML pattern** (`no-unsafe-unknown-route`)
 *    — any `innerHTML = \`...Unknown ... route: ${path}...\`` outside the
 *    test files. The 27 dispatchers must use `renderUnknownRoute(...)`
 *    from `utils/escapeHtml.ts` so the path is always escaped.
 *
 * **What it warns about (WARN — non-blocking, prints count):**
 *
 * 3. **Other unsafe innerHTML interpolation** (`no-unsafe-innerHTML`)
 *    — `innerHTML = \`...${expr}...\`` where `expr` is not a known-safe
 *    function call or identifier. ~70 such sites exist as of Bølge 2B
 *    (mostly low-risk: pre-built HTML strings, function-call results) and
 *    will be cleaned up in Bølge 3. NEW unsafe interpolations should use
 *    `// lint-no-unsafe-html: <reason>` to grandfather, or fix to use
 *    `escapeHtml(...)`.
 *
 * **Per-line escape:**
 * `// lint-no-unsafe-html: <begrunnelse>` on the same line OR the line above
 * silences the violation. Use sparingly; the begrunnelse is required so a
 * reviewer can audit the decision.
 *
 * Usage:
 *   node scripts/stylelint-rules/lint-no-unsafe-html.mjs
 *   node scripts/stylelint-rules/lint-no-unsafe-html.mjs --strict   # WARN→FAIL
 *
 * Exits 0 on success, 1 on any FAIL violation.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(__filename, "../../../");
const STRICT = process.argv.includes("--strict");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SCAN_DIRS = ["apps/admin-web/src"];

const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

const SKIP_PATTERNS = [
  /__tests__\//,
  /\/tests\//,
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /node_modules/,
];

/**
 * The canonical file. Defining `escapeHtml` here is allowed; everywhere
 * else is a violation.
 *
 * `pages/games/common/escape.ts` is also allowlisted because it is a
 * thin re-export (22 game-pages still import from that path), kept for
 * import-stability after the consolidation.
 */
const CANONICAL_ESCAPE_HTML_FILES = new Set([
  "apps/admin-web/src/utils/escapeHtml.ts",
  "apps/admin-web/src/pages/games/common/escape.ts",
]);

/**
 * Functions whose return value is HTML-safe to interpolate into innerHTML.
 * Any other identifier in `${...}` triggers a (warn) violation.
 */
const SAFE_FNS = new Set([
  "escapeHtml", "escape",
  "formatNOK", "formatCents", "formatNok", "formatAmount", "formatCurrency",
  "formatDate", "formatDateTime", "formatTime", "formatKr", "formatMoney",
  "formatPlayerName", "formatTicketSource", "formatLabelWithCount",
  "kycBadgeHtml", "statusBadge", "playerLabel",
  "maskPhoneForGrid", "maskEmailForGrid",
  "contentHeader", "boxOpen", "boxClose",
  "renderUnknownRoute",
  "encodeURIComponent",
  "t",
  "isPointsSource",
  "boolean", "Boolean", "Number", "String",
  "today",
]);

const SAFE_ID = /^(cls|className|classes|btnClass|badgeClass|variant|color|size|width|height|count|i|j|k|idx|n|num|index|len|length|level|kind|type|status|state|phase|mode|step|currency|currencyCode|amount|total|sum|page|pageCount|currentPage|totalPages|qty|quantity)$/i;
const SAFE_ID_SUFFIX = /(Html|Markup|Banner|Btn|Body|Header|Headers|Rows|Items|Options|Children|Markup|Content|Section|Tooltip|Notice|Element|Block|Snippet|Element|Cells|List|Group|Container|Wrapper|Footer|Form|Field|Card|Section)$/;
const SAFE_NUMERIC_PROP = /\.(length|count|size|width|height|index|idx|page|pageCount|total|sum)$|\.toFixed\(\d*\)$|\.toLocaleString\(/;
const STRING_LITERAL = /^["'`][^"'`]*["'`]$/;
const NUMBER_LITERAL = /^[\d.]+$/;
const SAFE_ATTR_TERNARY = /^.+\?\s*["']\s*(selected|checked|disabled|active)\s*["']\s*:\s*["']\s*["']$/;

const ESCAPE_COMMENT = /\/\/\s*lint-no-unsafe-html:\s*\S/;

const UNKNOWN_ROUTE_PATTERN = /Unknown\s+\S+\s+route:\s*\$\{[^}]+\}/;

// ---------------------------------------------------------------------------
// Logic
// ---------------------------------------------------------------------------

function isSkipped(relPath) {
  return SKIP_PATTERNS.some((r) => r.test(relPath));
}

function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === "build") {
      continue;
    }
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      walk(full, out);
    } else if (EXTENSIONS.some((e) => full.endsWith(e))) {
      out.push(full);
    }
  }
}

function classifyExpr(expr) {
  let e = expr.trim();

  // Function call to a safe function.
  const callMatch = e.match(/^(?:[\w$.]+\.)?(\w+)\s*\(/);
  if (callMatch && SAFE_FNS.has(callMatch[1])) return "SAFE";

  if (SAFE_ID.test(e)) return "SAFE";
  if (NUMBER_LITERAL.test(e) || STRING_LITERAL.test(e)) return "SAFE";

  // Bare identifier ending in -Html / -Markup / -Body / -Rows etc.
  if (/^[\w$.]+$/.test(e) && SAFE_ID_SUFFIX.test(e)) return "SAFE";

  // Numeric property at end (.length, .count, .toFixed(...), .toLocaleString(...)).
  if (SAFE_NUMERIC_PROP.test(e)) return "SAFE";

  // Boolean ternary returning safe-attr (` selected` / ``).
  if (SAFE_ATTR_TERNARY.test(e)) return "SAFE";

  // Ternary where both branches are safe.
  const tern = e.match(/^([^?]+)\?\s*(.+?)\s*:\s*(.+)$/);
  if (tern) {
    const a = classifyExpr(tern[2]);
    const b = classifyExpr(tern[3]);
    if (a === "SAFE" && b === "SAFE") return "SAFE";
  }

  // .map(...).join("") — analyse inner template literals.
  if (/\.map\b/.test(e) && /\.join\(/.test(e)) {
    const innerExprs = extractInnerExprs(e);
    if (innerExprs.length === 0) return "SAFE";
    if (innerExprs.every(x => classifyExpr(x) === "SAFE")) return "SAFE";
  }

  // (x || y) where both are safe.
  const orMatch = e.match(/^\(?\s*(.+?)\s*\|\|\s*(.+?)\s*\)?$/);
  if (orMatch) {
    if (classifyExpr(orMatch[1]) === "SAFE" && classifyExpr(orMatch[2]) === "SAFE") return "SAFE";
  }

  return "UNSAFE";
}

function extractInnerExprs(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf("${", i);
    if (idx < 0) break;
    let l = idx + 2;
    let bal = 1;
    while (l < text.length && bal > 0) {
      const c = text[l];
      if (c === "{") bal++;
      else if (c === "}") bal--;
      if (bal > 0) l++;
    }
    out.push(text.slice(idx + 2, l).trim());
    i = l + 1;
  }
  return out;
}

function findInnerHtmlSinks(content) {
  const sites = [];
  let i = 0;
  while (i < content.length) {
    const idx = content.indexOf("innerHTML", i);
    if (idx < 0) break;
    let j = idx + "innerHTML".length;
    while (j < content.length && /\s/.test(content[j])) j++;
    if (content[j] !== "=") { i = idx + 1; continue; }
    j++;
    while (j < content.length && /\s/.test(content[j])) j++;
    if (content[j] !== "`") { i = idx + 1; continue; }

    j++;
    const start = j;
    let depth = 0;
    while (j < content.length) {
      const c = content[j];
      if (c === "\\") { j += 2; continue; }
      if (c === "`" && depth === 0) break;
      if (c === "$" && content[j + 1] === "{") { depth++; j += 2; continue; }
      if (c === "}" && depth > 0) { depth--; j++; continue; }
      j++;
    }
    const literalText = content.slice(start, j);
    const exprs = extractInnerExprs(literalText);
    const line = content.slice(0, idx).split("\n").length;
    sites.push({ line, exprs, raw: literalText });
    i = j + 1;
  }
  return sites;
}

function scanFile(absPath, relPath) {
  const content = readFileSync(absPath, "utf-8");
  const lines = content.split(/\r?\n/);
  const fail = [];
  const warn = [];

  // ------------------------------------------------------------------------
  // FAIL CHECK 1: Duplicate escapeHtml/escapeAttr definitions.
  // ------------------------------------------------------------------------
  if (!CANONICAL_ESCAPE_HTML_FILES.has(relPath.split(sep).join("/"))) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        /^\s*(export\s+)?function\s+(escapeHtml|escapeAttr)\b/.test(line) ||
        /^\s*(export\s+)?const\s+(escapeHtml|escapeAttr)\s*=/.test(line)
      ) {
        const prev = i > 0 ? lines[i - 1] : "";
        if (ESCAPE_COMMENT.test(line) || ESCAPE_COMMENT.test(prev)) continue;
        fail.push({
          line: i + 1,
          text: line.trim(),
          rule: "no-duplicate-escapeHtml",
          message: 'Use `import { escapeHtml } from "<rel>/utils/escapeHtml.js"` instead of redefining the helper.',
        });
      }
    }
  }

  // ------------------------------------------------------------------------
  // FAIL CHECK 2: Unknown-route attacker-controlled `${path}` pattern.
  // ------------------------------------------------------------------------
  const sites = findInnerHtmlSinks(content);
  for (const site of sites) {
    if (UNKNOWN_ROUTE_PATTERN.test(site.raw)) {
      const lineText = lines[site.line - 1] ?? "";
      const prevLine = site.line >= 2 ? lines[site.line - 2] : "";
      if (ESCAPE_COMMENT.test(lineText) || ESCAPE_COMMENT.test(prevLine)) continue;
      // Allow if the literal already wraps in escapeHtml(...) or renderUnknownRoute(...).
      if (site.raw.includes("escapeHtml(") || site.raw.includes("renderUnknownRoute(")) continue;
      // Otherwise we have an unescaped `${path}` in an Unknown-route fallback.
      fail.push({
        line: site.line,
        text: lineText.trim().slice(0, 120),
        rule: "no-unsafe-unknown-route",
        message: 'Use `renderUnknownRoute("module-name", path)` from utils/escapeHtml.js — the helper escapes path.',
      });
    }
  }

  // ------------------------------------------------------------------------
  // WARN CHECK: General unsafe innerHTML interpolation.
  // ------------------------------------------------------------------------
  for (const site of sites) {
    const lineText = lines[site.line - 1] ?? "";
    const prevLine = site.line >= 2 ? lines[site.line - 2] : "";
    if (ESCAPE_COMMENT.test(lineText) || ESCAPE_COMMENT.test(prevLine)) continue;
    const unsafeExprs = site.exprs.filter(e => classifyExpr(e) === "UNSAFE");
    if (unsafeExprs.length === 0) continue;
    warn.push({
      line: site.line,
      text: lineText.trim().slice(0, 120),
      rule: "no-unsafe-innerHTML",
      message: `Unsafe \${expr} in innerHTML: ${unsafeExprs.slice(0, 3).map(e => e.length > 60 ? e.slice(0, 60) + "..." : e).join(", ")}`,
      hint: "Wrap with escapeHtml(...) or use a known-safe formatter (formatNOK, formatDate, kycBadgeHtml, ...).",
    });
  }

  return { fail, warn };
}

function main() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    walk(abs, files);
  }

  let totalFail = 0;
  let totalWarn = 0;
  const failReport = [];
  const warnReport = [];

  for (const abs of files) {
    const rel = relative(ROOT, abs);
    if (isSkipped(rel)) continue;
    const { fail, warn } = scanFile(abs, rel);
    totalFail += fail.length;
    totalWarn += warn.length;
    for (const v of fail) {
      failReport.push(`${rel}:${v.line}  [${v.rule}]  ${v.message}`);
      if (v.hint) failReport.push(`    hint: ${v.hint}`);
      failReport.push(`    ${v.text}`);
    }
    for (const v of warn) {
      warnReport.push(`${rel}:${v.line}  [${v.rule}]  ${v.message}`);
    }
  }

  if (totalFail === 0 && (totalWarn === 0 || !STRICT)) {
    // eslint-disable-next-line no-console
    console.log(
      `lint-no-unsafe-html: OK — no FAIL violations.${
        totalWarn > 0 ? ` (${totalWarn} grandfathered WARN occurrences in pre-Bølge-2B code; cleanup deferred to Bølge 3.)` : ""
      }`,
    );
    process.exit(0);
  }

  // eslint-disable-next-line no-console
  if (totalFail > 0) {
    console.error(
      `lint-no-unsafe-html: FAIL — ${totalFail} blocking violation${totalFail === 1 ? "" : "s"}.\n\n` +
        "Violations:\n" +
        failReport.map((r) => "  " + r).join("\n") +
        "\n\nFix patterns:\n" +
        "  - Duplicate escapeHtml/escapeAttr: replace local impl with `import { escapeHtml } from \"<rel>/utils/escapeHtml.js\"`.\n" +
        "  - Unknown-route innerHTML: use `renderUnknownRoute(\"module-name\", path)` from utils/escapeHtml.js.\n" +
        "  - To grandfather a specific line, add `// lint-no-unsafe-html: <reason>` on the line above.\n",
    );
  }
  if (STRICT && totalWarn > 0) {
    console.error(
      `\nlint-no-unsafe-html: STRICT mode — ${totalWarn} additional WARN-level violation${totalWarn === 1 ? "" : "s"}:\n` +
        warnReport.map((r) => "  " + r).join("\n"),
    );
  }
  process.exit(1);
}

main();
