/**
 * Tests for the lint-no-unsafe-html scanner (Bølge 2B FE-P0-002 / FIN-P1-01).
 *
 * Run with:
 *   node --test scripts/stylelint-rules/__tests__/
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(__filename, "../../../..");

function runScanner(strict = false) {
  const args = [join(REPO_ROOT, "scripts/stylelint-rules/lint-no-unsafe-html.mjs")];
  if (strict) args.push("--strict");
  const result = spawnSync("node", args, { encoding: "utf8", cwd: REPO_ROOT });
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("lint-no-unsafe-html (admin-web XSS prevention)", () => {
  it("exit 0 on clean main (no FAIL violations)", () => {
    const r = runScanner();
    assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /OK/);
  });

  it("exit 1 when a duplicate escapeHtml is introduced", () => {
    const badFile = join(REPO_ROOT, "apps/admin-web/src/__test_dup_escape.ts");
    writeFileSync(
      badFile,
      "export function escapeHtml(s: string): string { return s.replace(/&/g, '&amp;'); }\n",
    );
    try {
      const r = runScanner();
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /no-duplicate-escapeHtml/);
      assert.match(r.stderr, /__test_dup_escape\.ts/);
    } finally {
      rmSync(badFile, { force: true });
    }
  });

  it("exit 1 when a duplicate escapeAttr is introduced", () => {
    const badFile = join(REPO_ROOT, "apps/admin-web/src/__test_dup_escape_attr.ts");
    writeFileSync(
      badFile,
      "export function escapeAttr(s: string): string { return s.replace(/\"/g, '&quot;'); }\n",
    );
    try {
      const r = runScanner();
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /no-duplicate-escapeHtml/);
    } finally {
      rmSync(badFile, { force: true });
    }
  });

  it("exit 1 when an unescaped Unknown-route ${path} is reintroduced", () => {
    const badFile = join(REPO_ROOT, "apps/admin-web/src/__test_unknown_route.ts");
    writeFileSync(
      badFile,
      [
        "export function mountX(container: HTMLElement, path: string): void {",
        "  container.innerHTML = `<div class=\"box box-danger\"><div class=\"box-body\">Unknown x route: ${path}</div></div>`;",
        "}",
        "",
      ].join("\n"),
    );
    try {
      const r = runScanner();
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /no-unsafe-unknown-route/);
      assert.match(r.stderr, /__test_unknown_route\.ts/);
    } finally {
      rmSync(badFile, { force: true });
    }
  });

  it("exit 0 when Unknown-route uses renderUnknownRoute", () => {
    const okFile = join(REPO_ROOT, "apps/admin-web/src/__test_ok_unknown_route.ts");
    writeFileSync(
      okFile,
      [
        "import { renderUnknownRoute } from \"./utils/escapeHtml.js\";",
        "export function mountX(container: HTMLElement, path: string): void {",
        "  container.innerHTML = renderUnknownRoute(\"x\", path);",
        "}",
        "",
      ].join("\n"),
    );
    try {
      const r = runScanner();
      assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    } finally {
      rmSync(okFile, { force: true });
    }
  });

  it("exit 0 when Unknown-route inlines escapeHtml(path)", () => {
    const okFile = join(REPO_ROOT, "apps/admin-web/src/__test_ok_unknown_route_inline.ts");
    writeFileSync(
      okFile,
      [
        "import { escapeHtml } from \"./utils/escapeHtml.js\";",
        "export function mountX(container: HTMLElement, path: string): void {",
        "  container.innerHTML = `<div>Unknown x route: ${escapeHtml(path)}</div>`;",
        "}",
        "",
      ].join("\n"),
    );
    try {
      const r = runScanner();
      assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    } finally {
      rmSync(okFile, { force: true });
    }
  });

  it("exit 0 when violation is grandfathered with lint-no-unsafe-html comment", () => {
    const okFile = join(REPO_ROOT, "apps/admin-web/src/__test_grandfathered.ts");
    writeFileSync(
      okFile,
      [
        "// lint-no-unsafe-html: Test grandfather comment.",
        "export function escapeHtml(s: string): string { return s; }",
        "",
      ].join("\n"),
    );
    try {
      const r = runScanner();
      assert.equal(r.exitCode, 0, `stderr: ${r.stderr}`);
    } finally {
      rmSync(okFile, { force: true });
    }
  });

  it("strict mode reports WARN-level violations as failures", () => {
    const r = runScanner(true);
    // Even on a clean main, the 67 grandfathered WARN occurrences cause exit 1
    // in strict mode (this is intentional — strict mode is opt-in for cleanup).
    assert.equal(r.exitCode, 1, "strict mode should fail on grandfathered WARN sites");
    assert.match(r.stderr, /STRICT mode/);
  });
});
