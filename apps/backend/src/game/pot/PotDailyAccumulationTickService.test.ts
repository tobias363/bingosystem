/**
 * PR-T2 Spor 4: Tester for PotDailyAccumulationTickService.
 *
 * Dekker:
 *   - todayUtcString returnerer YYYY-MM-DD fra Date
 *   - runDailyTick: iterer alle pot-er og kall accumulateDaily
 *   - runDailyTick: hall-filter brukes korrekt
 *   - runDailyTick: én pot-feil svelges — andre pot-er prosesseres
 *   - runDailyTick: idempotent — samme dato to ganger øker ikke telleren
 *   - runDailyTick: validerer todayUtc-format
 *   - ensureDailyAccumulatedForHall: delegerer til runDailyTick med hall-filter
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  PotDailyAccumulationTickService,
  todayUtcString,
} from "./PotDailyAccumulationTickService.js";
import type { Game1PotService } from "./Game1PotService.js";

// ── Fake Game1PotService (kun accumulateDaily trengs) ───────────────────────

interface AccumulateCall {
  hallId: string;
  potKey: string;
  dateUtc: string;
}

function makeFakePotService(
  responder: (input: AccumulateCall) => Promise<{
    applied: boolean;
    boostCents: number;
    newBalanceCents: number;
    eventId: string | null;
  }>
): { service: Game1PotService; calls: AccumulateCall[] } {
  const calls: AccumulateCall[] = [];
  const service = {
    async accumulateDaily(input: {
      hallId: string;
      potKey: string;
      dateUtc: string;
    }) {
      calls.push(input);
      return responder(input);
    },
  } as unknown as Game1PotService;
  return { service, calls };
}

function stubPool(rows: Array<{ hall_id: string; pot_key: string }>, capture?: { sqls: string[] }): {
  pool: {
    connect: () => Promise<{
      query: (
        sql: string,
        params?: unknown[]
      ) => Promise<{ rows: unknown[]; rowCount: number }>;
      release: () => void;
    }>;
    query: (
      sql: string,
      params?: unknown[]
    ) => Promise<{ rows: unknown[]; rowCount: number }>;
  };
} {
  const runQuery = async (sql: string, params: unknown[] = []) => {
    capture?.sqls.push(sql);
    if (Array.isArray(params) && params.length > 0) {
      // hallId-filter.
      const hallId = params[0];
      const filtered = rows.filter((r) => r.hall_id === hallId);
      return { rows: filtered, rowCount: filtered.length };
    }
    return { rows, rowCount: rows.length };
  };
  return {
    pool: {
      connect: async () => ({ query: runQuery, release: () => undefined }),
      query: runQuery,
    },
  };
}

// ── Pure helpers ────────────────────────────────────────────────────────────

test("todayUtcString: konverterer Date → YYYY-MM-DD (UTC)", () => {
  const d = new Date("2026-04-22T23:59:59.000Z");
  assert.equal(todayUtcString(d), "2026-04-22");
  // 00:00:01 i UTC same dag:
  assert.equal(
    todayUtcString(new Date("2026-04-22T00:00:01.000Z")),
    "2026-04-22"
  );
});

test("todayUtcString: padder måned og dag til 2 siffer", () => {
  const d = new Date("2026-01-05T12:00:00.000Z");
  assert.equal(todayUtcString(d), "2026-01-05");
});

// ── runDailyTick ────────────────────────────────────────────────────────────

test("runDailyTick: kaller accumulateDaily for hver pot i alle haller", async () => {
  const { pool } = stubPool([
    { hall_id: "hall-a", pot_key: "jackpott" },
    { hall_id: "hall-a", pot_key: "innsatsen" },
    { hall_id: "hall-b", pot_key: "jackpott" },
  ]);
  const { service: potService, calls } = makeFakePotService(async () => ({
    applied: true,
    boostCents: 4000_00,
    newBalanceCents: 6000_00,
    eventId: "ev-1",
  }));
  const tick = new PotDailyAccumulationTickService({
    pool: pool as never,
    potService,
  });

  const result = await tick.runDailyTick({ todayUtc: "2026-04-22" });

  assert.equal(result.totalPots, 3);
  assert.equal(result.accumulated, 3);
  assert.equal(result.skipped, 0);
  assert.equal(result.failed, 0);
  assert.equal(calls.length, 3);
  const keys = calls.map((c) => `${c.hallId}:${c.potKey}`).sort();
  assert.deepEqual(keys, ["hall-a:innsatsen", "hall-a:jackpott", "hall-b:jackpott"]);
  for (const c of calls) {
    assert.equal(c.dateUtc, "2026-04-22");
  }
});

test("runDailyTick: hallId-filter begrenser til én hall", async () => {
  const { pool } = stubPool([
    { hall_id: "hall-a", pot_key: "jackpott" },
    { hall_id: "hall-a", pot_key: "innsatsen" },
    { hall_id: "hall-b", pot_key: "jackpott" },
  ]);
  const { service: potService, calls } = makeFakePotService(async () => ({
    applied: true,
    boostCents: 4000_00,
    newBalanceCents: 6000_00,
    eventId: "ev-x",
  }));
  const tick = new PotDailyAccumulationTickService({
    pool: pool as never,
    potService,
  });

  const result = await tick.runDailyTick({
    todayUtc: "2026-04-22",
    hallId: "hall-a",
  });

  assert.equal(result.totalPots, 2);
  assert.equal(result.accumulated, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.hallId === "hall-a"));
});

test("runDailyTick: fail-closed per pot — én feil stopper ikke de andre", async () => {
  const { pool } = stubPool([
    { hall_id: "hall-a", pot_key: "jackpott" },
    { hall_id: "hall-b", pot_key: "jackpott" }, // skal feile
    { hall_id: "hall-c", pot_key: "jackpott" },
  ]);
  const { service: potService } = makeFakePotService(async (input) => {
    if (input.hallId === "hall-b") {
      throw new Error("wallet-timeout");
    }
    return {
      applied: true,
      boostCents: 4000_00,
      newBalanceCents: 6000_00,
      eventId: "ev-y",
    };
  });
  const tick = new PotDailyAccumulationTickService({
    pool: pool as never,
    potService,
  });

  const result = await tick.runDailyTick({ todayUtc: "2026-04-22" });

  assert.equal(result.totalPots, 3);
  assert.equal(result.accumulated, 2, "hall-a + hall-c akkumulert");
  assert.equal(result.failed, 1, "hall-b feilet");
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0]!.hallId, "hall-b");
  assert.match(result.failures[0]!.errorMessage, /wallet-timeout/);
});

test("runDailyTick: idempotent — accumulateDaily returnerer applied=false → telles som skipped", async () => {
  const { pool } = stubPool([
    { hall_id: "hall-a", pot_key: "jackpott" },
    { hall_id: "hall-a", pot_key: "innsatsen" },
  ]);
  const { service: potService } = makeFakePotService(async () => ({
    applied: false, // allerede applisert samme dato
    boostCents: 0,
    newBalanceCents: 10_000_00,
    eventId: null,
  }));
  const tick = new PotDailyAccumulationTickService({
    pool: pool as never,
    potService,
  });

  const result = await tick.runDailyTick({ todayUtc: "2026-04-22" });
  assert.equal(result.accumulated, 0);
  assert.equal(result.skipped, 2);
  assert.equal(result.failed, 0);
});

test("runDailyTick: ugyldig todayUtc-format → throw", async () => {
  const { pool } = stubPool([]);
  const { service: potService } = makeFakePotService(async () => ({
    applied: true,
    boostCents: 0,
    newBalanceCents: 0,
    eventId: null,
  }));
  const tick = new PotDailyAccumulationTickService({
    pool: pool as never,
    potService,
  });
  await assert.rejects(
    () => tick.runDailyTick({ todayUtc: "2026/04/22" }),
    /YYYY-MM-DD/
  );
});

test("runDailyTick: ingen pot-er → trivielt sum, ingen kall", async () => {
  const { pool } = stubPool([]);
  const { service: potService, calls } = makeFakePotService(async () => ({
    applied: true,
    boostCents: 0,
    newBalanceCents: 0,
    eventId: null,
  }));
  const tick = new PotDailyAccumulationTickService({
    pool: pool as never,
    potService,
  });
  const r = await tick.runDailyTick({ todayUtc: "2026-04-22" });
  assert.equal(r.totalPots, 0);
  assert.equal(r.accumulated, 0);
  assert.equal(calls.length, 0);
});

// ── ensureDailyAccumulatedForHall ───────────────────────────────────────────

test("ensureDailyAccumulatedForHall: delegerer til runDailyTick med hall-filter", async () => {
  const { pool } = stubPool([
    { hall_id: "hall-a", pot_key: "jackpott" },
    { hall_id: "hall-b", pot_key: "jackpott" },
  ]);
  const { service: potService, calls } = makeFakePotService(async () => ({
    applied: true,
    boostCents: 4000_00,
    newBalanceCents: 6000_00,
    eventId: "ev-z",
  }));
  const tick = new PotDailyAccumulationTickService({
    pool: pool as never,
    potService,
  });

  await tick.ensureDailyAccumulatedForHall("hall-a", "2026-04-22");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.hallId, "hall-a");
});
