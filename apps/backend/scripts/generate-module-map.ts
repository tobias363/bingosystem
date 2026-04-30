#!/usr/bin/env tsx
/**
 * generate-module-map.ts
 *
 * Auto-generates the module index in docs/architecture/MODULES.md by
 * scanning apps/backend/src/ + packages/game-client/src/ for `.ts` files
 * and producing:
 *
 *   1. A sorted index of files per module-area (game/wallet/compliance/etc).
 *   2. LOC counts for each top-level module.
 *   3. A list of orphan modules — files without a matching README in
 *      docs/architecture/modules/<area>/<File>.md.
 *
 * The output is written between two HTML-comment markers in MODULES.md:
 *
 *   <!-- AUTO-GENERATED-MODULE-INDEX-START -->
 *   ... generated content ...
 *   <!-- AUTO-GENERATED-MODULE-INDEX-END -->
 *
 * Run:
 *   npm --prefix apps/backend exec tsx scripts/generate-module-map.ts
 *
 * CI gate (TODO Bølge F1 follow-up):
 *   .github/workflows/module-map-fresh.yml runs this script and fails the
 *   build if MODULES.md changes (i.e. the index is stale relative to
 *   actual src/-tree).
 *
 * Bølge F1, REFACTOR_AUDIT_PRE_PILOT_2026-04-29.md follow-up.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");

const BACKEND_ROOTS = [
  "apps/backend/src/game",
  "apps/backend/src/wallet",
  "apps/backend/src/compliance",
  "apps/backend/src/auth",
  "apps/backend/src/platform",
  "apps/backend/src/admin",
  "apps/backend/src/agent",
  "apps/backend/src/draw-engine",
  "apps/backend/src/payments",
  "apps/backend/src/integration",
  "apps/backend/src/jobs",
  "apps/backend/src/sockets",
  "apps/backend/src/services",
  "apps/backend/src/observability",
  "apps/backend/src/middleware",
  "apps/backend/src/util",
  "apps/backend/src/adapters",
  "apps/backend/src/ports",
  "apps/backend/src/store",
];

const FRONTEND_ROOTS = [
  "packages/game-client/src/games",
  "packages/game-client/src/bridge",
  "packages/game-client/src/components",
  "packages/game-client/src/core",
  "packages/game-client/src/audio",
  "packages/game-client/src/net",
  "packages/game-client/src/storage",
  "packages/game-client/src/telemetry",
  "packages/game-client/src/i18n",
  "packages/game-client/src/diagnostics",
];

interface ModuleInfo {
  path: string;
  loc: number;
  hasReadme: boolean;
}

function isSourceFile(name: string): boolean {
  return (
    name.endsWith(".ts") &&
    !name.endsWith(".test.ts") &&
    !name.endsWith(".d.ts") &&
    !name.includes(".tsbuildinfo")
  );
}

function walkSourceFiles(absRoot: string, files: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(absRoot);
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = join(absRoot, entry);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walkSourceFiles(abs, files);
    } else if (st.isFile() && isSourceFile(entry)) {
      files.push(abs);
    }
  }
}

function countLoc(file: string): number {
  try {
    const content = readFileSync(file, "utf8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}

function readmePathFor(srcPath: string): string {
  // apps/backend/src/game/BingoEngine.ts → docs/architecture/modules/backend/BingoEngine.md
  // packages/game-client/src/games/game1/Game1Controller.ts → docs/architecture/modules/frontend/Game1Controller.md
  const isBackend = srcPath.includes("apps/backend/");
  const area = isBackend ? "backend" : "frontend";
  const stem = srcPath.split("/").pop()!.replace(/\.ts$/, "");
  return `docs/architecture/modules/${area}/${stem}.md`;
}

function gatherModules(): ModuleInfo[] {
  const allFiles: string[] = [];
  for (const root of [...BACKEND_ROOTS, ...FRONTEND_ROOTS]) {
    walkSourceFiles(join(REPO_ROOT, root), allFiles);
  }
  return allFiles.map((abs) => {
    const rel = relative(REPO_ROOT, abs);
    const readmeAbs = join(REPO_ROOT, readmePathFor(rel));
    let hasReadme = false;
    try {
      hasReadme = statSync(readmeAbs).isFile();
    } catch {
      // not present
    }
    return {
      path: rel,
      loc: countLoc(abs),
      hasReadme,
    };
  });
}

function formatTable(modules: ModuleInfo[]): string {
  // Sort by area then path.
  const sorted = [...modules].sort((a, b) => a.path.localeCompare(b.path));
  const lines: string[] = [];
  lines.push("| File | LOC | README |");
  lines.push("|---|---:|---|");
  for (const m of sorted) {
    const status = m.hasReadme ? "✅" : "🟡 missing";
    lines.push(`| \`${m.path}\` | ${m.loc} | ${status} |`);
  }
  return lines.join("\n");
}

function summarize(modules: ModuleInfo[]): string {
  const total = modules.length;
  const backend = modules.filter((m) => m.path.startsWith("apps/backend/")).length;
  const frontend = modules.filter((m) => m.path.startsWith("packages/")).length;
  const documented = modules.filter((m) => m.hasReadme).length;
  const missing = total - documented;
  const totalLoc = modules.reduce((s, m) => s + m.loc, 0);
  return [
    `**Total source files (excl. tests):** ${total}`,
    `  • Backend (\`apps/backend/src/\`): ${backend}`,
    `  • Frontend (\`packages/game-client/src/\`): ${frontend}`,
    `  • Total LOC (excl. tests): ${totalLoc.toLocaleString("en-US")}`,
    "",
    `**Documentation status:**`,
    `  • Has per-module README: ${documented} (${((documented / total) * 100).toFixed(1)}%)`,
    `  • Missing README: ${missing}`,
    "",
    `**Generated:** ${new Date().toISOString()}`,
  ].join("\n");
}

function main(): void {
  console.error("[generate-module-map] scanning sources…");
  const modules = gatherModules();
  console.error(`[generate-module-map] found ${modules.length} files`);

  const summary = summarize(modules);
  const table = formatTable(modules);
  const orphans = modules.filter((m) => !m.hasReadme);

  const block = [
    "<!-- AUTO-GENERATED-MODULE-INDEX-START -->",
    "",
    "<!--",
    "  Generated by apps/backend/scripts/generate-module-map.ts",
    "  Run: npm --prefix apps/backend exec tsx scripts/generate-module-map.ts",
    "-->",
    "",
    "## Auto-generated module index",
    "",
    summary,
    "",
    "### Per-file table",
    "",
    table,
    "",
    `### Orphan modules (${orphans.length}) — need a README`,
    "",
    orphans.length === 0
      ? "_All modules documented! 🎉_"
      : orphans.map((m) => `- \`${m.path}\``).join("\n"),
    "",
    "<!-- AUTO-GENERATED-MODULE-INDEX-END -->",
  ].join("\n");

  const indexPath = join(REPO_ROOT, "docs/architecture/MODULES.md");
  let existing = "";
  try {
    existing = readFileSync(indexPath, "utf8");
  } catch {
    console.error(`[generate-module-map] WARNING: ${indexPath} not found`);
  }

  const startMarker = "<!-- AUTO-GENERATED-MODULE-INDEX-START -->";
  const endMarker = "<!-- AUTO-GENERATED-MODULE-INDEX-END -->";
  let next: string;
  if (existing.includes(startMarker) && existing.includes(endMarker)) {
    const before = existing.split(startMarker)[0];
    const after = existing.split(endMarker)[1] ?? "";
    next = `${before}${block}${after}`;
  } else {
    // Append at end of file.
    next = existing + "\n\n" + block + "\n";
  }

  if (next === existing) {
    console.error("[generate-module-map] no changes");
  } else {
    writeFileSync(indexPath, next, "utf8");
    console.error("[generate-module-map] updated docs/architecture/MODULES.md");
  }

  console.error(
    `[generate-module-map] done (orphans=${orphans.length}, documented=${
      modules.length - orphans.length
    }/${modules.length})`,
  );
}

main();
