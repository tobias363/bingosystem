/**
 * BIN-582: Tests for the generic job scheduler.
 *
 * Covers:
 *   - Feature flags (master + per-job) disable execution.
 *   - Redis-lock path skips the body when another instance holds the lock.
 *   - runOnce triggers the body independently of the scheduler loop.
 *   - register() rejects duplicate names and post-start registration.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createJobScheduler, type JobDefinition } from "../JobScheduler.js";
import { logger as rootLogger } from "../../util/logger.js";

// Silence logger during tests; assertions check counters/flags, not output.
const silentLogger = rootLogger.child({ module: "test" });
silentLogger.level = "silent";

function makeJob(name: string, run: JobDefinition["run"], overrides: Partial<JobDefinition> = {}): JobDefinition {
  return {
    name,
    description: "test",
    intervalMs: 60_000,
    enabled: true,
    run,
    ...overrides,
  };
}

test("JobScheduler: master kill-switch prevents any job from running", async () => {
  let calls = 0;
  const scheduler = createJobScheduler({ enabled: false, logger: silentLogger });
  scheduler.register(makeJob("a", async () => { calls++; return { itemsProcessed: 0 }; }));
  scheduler.start();
  // setInterval handles are unref'd and the master-flag path does not even
  // kick off the initial tick — give the loop one microtask to confirm.
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 0);
  scheduler.stop();
});

test("JobScheduler: per-job enabled=false skips only that job", async () => {
  let callsA = 0;
  let callsB = 0;
  const scheduler = createJobScheduler({ enabled: true, logger: silentLogger });
  scheduler.register(makeJob("a", async () => { callsA++; return { itemsProcessed: 0 }; }, { enabled: false }));
  scheduler.register(makeJob("b", async () => { callsB++; return { itemsProcessed: 0 }; }, { enabled: true }));
  scheduler.start();
  // Give the initial tick (fire-and-forget) time to resolve.
  await new Promise((r) => setTimeout(r, 10));
  scheduler.stop();
  assert.equal(callsA, 0, "disabled job must not run");
  assert.ok(callsB >= 1, "enabled job must run at least once (initial tick)");
});

test("JobScheduler: status() reflects registered + running state", async () => {
  const scheduler = createJobScheduler({ enabled: true, logger: silentLogger });
  scheduler.register(makeJob("a", async () => ({ itemsProcessed: 0 })));
  scheduler.register(makeJob("b", async () => ({ itemsProcessed: 0 }), { enabled: false }));

  // Before start: neither is running.
  let status = scheduler.status();
  assert.deepEqual(
    status.sort((x, y) => x.name.localeCompare(y.name)),
    [
      { name: "a", enabled: true, running: false },
      { name: "b", enabled: false, running: false },
    ]
  );

  scheduler.start();
  status = scheduler.status();
  assert.deepEqual(
    status.sort((x, y) => x.name.localeCompare(y.name)),
    [
      { name: "a", enabled: true, running: true },
      { name: "b", enabled: false, running: false },
    ]
  );
  scheduler.stop();
});

test("JobScheduler: register() rejects duplicate names", () => {
  const scheduler = createJobScheduler({ enabled: true, logger: silentLogger });
  scheduler.register(makeJob("dup", async () => ({ itemsProcessed: 0 })));
  assert.throws(
    () => scheduler.register(makeJob("dup", async () => ({ itemsProcessed: 0 }))),
    /already registered/i
  );
});

test("JobScheduler: register() rejects after start()", () => {
  const scheduler = createJobScheduler({ enabled: true, logger: silentLogger });
  scheduler.start();
  assert.throws(
    () => scheduler.register(makeJob("late", async () => ({ itemsProcessed: 0 }))),
    /after start/i
  );
  scheduler.stop();
});

test("JobScheduler: runOnce returns result without scheduling", async () => {
  let calls = 0;
  const scheduler = createJobScheduler({ enabled: true, logger: silentLogger });
  scheduler.register(makeJob("x", async () => { calls++; return { itemsProcessed: 7, note: "ok" }; }));
  // Don't call start(); runOnce should still work.
  const result = await scheduler.runOnce("x");
  assert.deepEqual(result, { itemsProcessed: 7, note: "ok" });
  assert.equal(calls, 1);

  const missing = await scheduler.runOnce("does-not-exist");
  assert.equal(missing, null);
});

test("JobScheduler: lock gate — job body skipped when peer holds lock", async () => {
  // Fake lock that always returns null (simulates "another instance holds it").
  const fakeLock = {
    withLock: async <T,>(_key: string, _work: () => Promise<T>, _ttl?: number): Promise<T | null> => {
      // Intentionally do NOT call work(), to emulate "lock unavailable".
      return null;
    },
  } as unknown as import("../../store/RedisSchedulerLock.js").RedisSchedulerLock;

  let calls = 0;
  const scheduler = createJobScheduler({ enabled: true, lock: fakeLock, logger: silentLogger });
  scheduler.register(makeJob("locked", async () => { calls++; return { itemsProcessed: 0 }; }));
  scheduler.start();
  await new Promise((r) => setTimeout(r, 10));
  scheduler.stop();
  assert.equal(calls, 0, "body must not execute when lock is unavailable");
});

test("JobScheduler: lock acquired — body runs and result is returned", async () => {
  // Fake lock that always runs the work.
  const fakeLock = {
    withLock: async <T,>(_key: string, work: () => Promise<T>, _ttl?: number): Promise<T | null> => {
      return work();
    },
  } as unknown as import("../../store/RedisSchedulerLock.js").RedisSchedulerLock;

  let calls = 0;
  const scheduler = createJobScheduler({ enabled: true, lock: fakeLock, logger: silentLogger });
  scheduler.register(makeJob("acquire", async () => { calls++; return { itemsProcessed: 0 }; }));
  scheduler.start();
  await new Promise((r) => setTimeout(r, 10));
  scheduler.stop();
  assert.ok(calls >= 1, "body must execute when lock is acquired");
});

test("JobScheduler: errors from job.run are caught and don't crash the loop", async () => {
  let calls = 0;
  const scheduler = createJobScheduler({ enabled: true, logger: silentLogger });
  scheduler.register(
    makeJob("boom", async () => {
      calls++;
      throw new Error("simulated");
    })
  );
  scheduler.start();
  // Let the initial fire-and-forget tick resolve the rejection without
  // the test process noticing an unhandled rejection.
  await new Promise((r) => setTimeout(r, 20));
  scheduler.stop();
  assert.ok(calls >= 1, "the throwing job still ran");
});
