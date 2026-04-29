/**
 * Boot-up smoke test — pilot guardrail for prod-startup crashes.
 *
 * INCIDENT 2026-04-29 07:12 UTC:
 *   PR #715 ("Bølge 2B pilot-blockers — boot-DDL + pool consolidation")
 *   passed CI green: 7752 unit-tests passed, type-check passed, build
 *   passed. The built binary then CRASHED at `node dist/index.js`
 *   startup with `Mangler connection string for PhysicalTicketPayoutService`.
 *
 *   Why CI didn't catch it: NO test ran the actual built binary. Unit-
 *   tests use forTesting() helpers that bypass constructors. Type-check
 *   only checks types. Build only verifies it compiles. None of these
 *   actually exec `node dist/index.js`.
 *
 * THIS TEST:
 *   Spawns the built binary as a child process with the minimum env-vars
 *   it needs to boot (Postgres + Redis from docker-compose), waits 10s,
 *   asserts the process is still running and `/health` returns 200, then
 *   sends SIGTERM and asserts graceful shutdown within 15s. If the boot
 *   crashes, this test fails immediately with the captured stderr.
 *
 * SKIP CONDITIONS (matches existing repo convention — see e.g.
 * `apps/backend/src/adapters/PostgresWalletAdapter.walletSplit.test.ts`):
 *   - `BOOT_TEST_PG_CONNECTION_STRING` not set → skipped
 *   - `BOOT_TEST_REDIS_URL` not set → skipped
 *   - `apps/backend/dist/index.js` does not exist → skipped (must build first)
 *
 *   In CI the `boot-test` job in `.github/workflows/ci.yml` provisions
 *   Postgres + Redis as services-block containers and sets these env-vars,
 *   so the test runs for every PR. Locally:
 *
 *     docker-compose up -d postgres redis     # or use any local pg/redis
 *     npm --prefix apps/backend run build
 *     BOOT_TEST_PG_CONNECTION_STRING=postgresql://... \
 *     BOOT_TEST_REDIS_URL=redis://localhost:6379/15 \
 *       npx --prefix apps/backend tsx --test \
 *         apps/backend/src/__tests__/bootStartup.test.ts
 *
 *   The test creates a unique schema per run (boot_test_<uuid16>) inside
 *   the supplied DB and drops it on cleanup, so no manual setup needed.
 *
 * COMPANION TEST:
 *   `bootStartup.constructorRegression.test.ts` runs always (no infra
 *   dependency) and exercises every Postgres-backed service constructor
 *   the way index.ts does. That layer would have caught PR #715
 *   directly. THIS layer catches the broader class of "the build is
 *   green but the binary won't start" bugs.
 *
 * SEE ALSO:
 *   - apps/backend/src/__tests__/bootStartup.constructorRegression.test.ts
 *   - .github/workflows/ci.yml — `boot-test` job
 */

import assert from "node:assert/strict";
import test from "node:test";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(__dirname, "..", "..");
const distEntry = join(backendDir, "dist", "index.js");

const PG_CONN = process.env.BOOT_TEST_PG_CONNECTION_STRING?.trim();
const REDIS_URL = process.env.BOOT_TEST_REDIS_URL?.trim();

const skipReason = (() => {
  if (!PG_CONN) return "BOOT_TEST_PG_CONNECTION_STRING not set — skipping boot smoke-test";
  if (!REDIS_URL) return "BOOT_TEST_REDIS_URL not set — skipping boot smoke-test";
  if (!existsSync(distEntry)) {
    return `dist/index.js not found at ${distEntry} — run \`npm --prefix apps/backend run build\` first`;
  }
  return undefined;
})();

/**
 * Pick an unused TCP port for the spawned backend.
 * Avoids collision with anything else running locally during CI parallelism.
 */
async function pickFreePort(): Promise<number> {
  const { createServer } = await import("node:net");
  return new Promise<number>((resolveFn, rejectFn) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", rejectFn);
    srv.listen(0, () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        rejectFn(new Error("listen address not numeric"));
        srv.close();
        return;
      }
      const port = addr.port;
      srv.close(() => resolveFn(port));
    });
  });
}

/**
 * Build a fresh isolated schema for the boot test. Lets parallel CI jobs run
 * without colliding, and gets dropped in cleanup.
 */
function makeBootTestSchema(): string {
  return `boot_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

async function dropSchema(connectionString: string, schema: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await pool.end();
  }
}

async function createSchema(connectionString: string, schema: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    await pool.end();
  }
}

interface SpawnedBackend {
  child: ChildProcessByStdio<null, Readable, Readable>;
  port: number;
  stdout: string[];
  stderr: string[];
  exitCode: number | null;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

/** Spawn `node dist/index.js` with the supplied env. */
function spawnBackend(env: NodeJS.ProcessEnv, port: number): SpawnedBackend {
  const child = spawn(process.execPath, [distEntry], {
    cwd: backendDir,
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout: string[] = [];
  const stderr: string[] = [];

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => stdout.push(chunk));
  child.stderr.on("data", (chunk: string) => stderr.push(chunk));

  const result: SpawnedBackend = {
    child,
    port,
    stdout,
    stderr,
    exitCode: null,
    exited: new Promise((resolveFn) => {
      child.on("exit", (code, signal) => {
        result.exitCode = code;
        resolveFn({ code, signal });
      });
    }),
  };

  return result;
}

/** Poll `/health` until it returns 200 or the deadline expires. */
async function waitForHealthy(
  port: number,
  deadlineMs: number,
  child: ChildProcessByStdio<null, Readable, Readable>,
): Promise<{ statusCode: number; body: string }> {
  const start = Date.now();
  let lastErr: Error | null = null;
  while (Date.now() - start < deadlineMs) {
    if (child.exitCode !== null) {
      // child died — caller will format stderr/stdout; we just report exitCode
      throw new Error(`backend exited prematurely with exitCode=${child.exitCode}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      const body = await res.text();
      if (res.status === 200) {
        return { statusCode: res.status, body };
      }
      lastErr = new Error(`/health returned ${res.status}: ${body.slice(0, 200)}`);
    } catch (err) {
      // ECONNREFUSED while server is still starting — keep polling
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `/health did not return 200 within ${deadlineMs}ms; last error: ${lastErr?.message ?? "unknown"}`,
  );
}

/** Format captured streams for a useful failure message. */
function formatBackendOutput(b: SpawnedBackend): string {
  const stdoutText = b.stdout.join("");
  const stderrText = b.stderr.join("");
  return [
    `--- backend stdout (${stdoutText.length} chars) ---`,
    stdoutText.slice(-4000),
    `--- backend stderr (${stderrText.length} chars) ---`,
    stderrText.slice(-4000),
  ].join("\n");
}

/**
 * Patterns that signal a fatal boot crash. We DON'T want to match generic
 * `error` strings — pino logs random `error: ...` lines all the time as
 * non-fatal. We only flag patterns that actually indicate a refusal to boot.
 */
const FATAL_STDERR_PATTERNS: readonly RegExp[] = [
  /Mangler connection string/,                         // PR #715 actual error
  /\bMangler\s+\S+\s+for\s+\w+Service\b/,              // generic "Mangler X for FooService" pattern
  /INVALID_CONFIG/,                                    // DomainError construct
  /uncaughtException/,                                 // top-level crash
  /UnhandledPromiseRejection/,                         // top-level async crash
  /\[FATAL\]/,                                         // explicit fatal log
  /CRITICAL: Running production WITHOUT/,              // checkpoint-missing fail
  /CRITICAL: warm-up failed in pilot-mode/,            // SecurityService boot-fail
  /TypeError: .* is not a (function|constructor)/,     // wiring import-mismatch
  /Cannot find module/,                                // missing import
  /SyntaxError/,                                       // bad code that slipped past tsc somehow
];

function findFatalPattern(stderr: string): RegExp | null {
  for (const pattern of FATAL_STDERR_PATTERNS) {
    if (pattern.test(stderr)) return pattern;
  }
  return null;
}

// ── The actual test ──────────────────────────────────────────────────────────

test(
  "boot smoke: `node dist/index.js` starts cleanly, /health returns 200, SIGTERM shuts down gracefully",
  { skip: skipReason },
  async () => {
    const schema = makeBootTestSchema();
    const port = await pickFreePort();

    // Pre-create the schema so PostgresResponsibleGamingStore.initializeSchema's
    // first `SET search_path TO <schema>` succeeds. The services then create
    // their own tables inside it on demand.
    await createSchema(PG_CONN!, schema);

    // Minimum env-vars to boot. Anything not set falls through to its default
    // in `loadBingoRuntimeConfig` / index.ts. Dev-mode is fine for the boot
    // test; production-mode would require CORS_ALLOWED_ORIGINS etc. and that
    // adds noise to the failure mode.
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "development",
      LOG_LEVEL: "warn",
      APP_PG_CONNECTION_STRING: PG_CONN!,
      APP_PG_SCHEMA: schema,
      WALLET_PG_CONNECTION_STRING: PG_CONN!,
      WALLET_PG_SCHEMA: schema,
      WALLET_PROVIDER: "postgres",
      ROOM_STATE_PROVIDER: "redis",
      SCHEDULER_LOCK_PROVIDER: "redis",
      REDIS_URL: REDIS_URL!,
      KYC_PROVIDER: "local",
      // Boot-only — we shut down before any cron-tick runs, but the schedulers
      // are constructed during boot. Disable noisy job-loops entirely.
      JOBS_ENABLED: "false",
      DAILY_REPORT_JOB_ENABLED: "false",
      AUTO_ROUND_START_ENABLED: "false",
      AUTO_DRAW_ENABLED: "false",
      // Disable Sentry in tests
      SENTRY_DSN: "",
    };

    const backend = spawnBackend(env, port);

    try {
      // Wait up to 30s for the boot. Cold-boot does schema-init + a few
      // first queries; this is generous.
      let health: { statusCode: number; body: string };
      try {
        health = await waitForHealthy(port, 30_000, backend.child);
      } catch (err) {
        // Boot failed — re-raise with full stdout/stderr so the failure is
        // actionable. Without this you only see "exitCode=1" with no clue why.
        const original = err instanceof Error ? err.message : String(err);
        throw new Error(`${original}\n${formatBackendOutput(backend)}`);
      }
      assert.equal(health.statusCode, 200, "GET /health must return 200");

      const parsed = JSON.parse(health.body) as { ok?: boolean; data?: unknown };
      assert.equal(parsed.ok, true, "/health body must have ok:true");

      // Now confirm the process has been running stable for >= 10s without
      // crashing. The point of this test is to catch crashes that happen
      // mid-boot or shortly after `server.listen` — eg. delayed schema-init
      // queries or warm-up promises that throw.
      const aliveDeadline = Date.now() + 10_000;
      while (Date.now() < aliveDeadline) {
        if (backend.child.exitCode !== null) {
          throw new Error(
            `backend died ${10_000 - (aliveDeadline - Date.now())}ms after /health passed: ${formatBackendOutput(backend)}`,
          );
        }
        await new Promise((r) => setTimeout(r, 250));
      }

      // Scan stderr for fatal patterns even though the process is still up.
      // A pino-logged uncaughtException can appear AFTER /health worked but
      // before SIGTERM — that's still a regression we want to surface.
      const stderrText = backend.stderr.join("");
      const fatalPattern = findFatalPattern(stderrText);
      assert.equal(
        fatalPattern,
        null,
        `fatal-boot-error pattern matched in stderr: ${fatalPattern}\n${formatBackendOutput(backend)}`,
      );

      // ── Graceful-shutdown phase ────────────────────────────────────────────
      backend.child.kill("SIGTERM");
      const exit = await Promise.race([
        backend.exited,
        new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
          (_, rej) => setTimeout(() => rej(new Error("SIGTERM did not exit within 15s")), 15_000),
        ),
      ]);

      // index.ts sends `process.exit(0)` after server.close(); SIGTERM may also
      // surface via signal. Either is acceptable. We mainly want to confirm the
      // forced-exit timeout (10s in index.ts) was NOT hit — that would be code 1.
      const exitOk = exit.code === 0 || exit.signal === "SIGTERM";
      assert.ok(
        exitOk,
        `unexpected exit: code=${exit.code} signal=${exit.signal}\n${formatBackendOutput(backend)}`,
      );
    } finally {
      // Belt-and-braces cleanup: kill anything still alive, then drop schema.
      if (backend.child.exitCode === null) {
        backend.child.kill("SIGKILL");
      }
      try {
        await dropSchema(PG_CONN!, schema);
      } catch (err) {
        // Don't mask the real error if the test failed first.
        console.warn(`[bootStartup.test] cleanup failed for schema ${schema}: ${err}`);
      }
    }
  },
);
