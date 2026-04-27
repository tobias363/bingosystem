/**
 * MASTER_PLAN §2.3 — tester for `jackpot-daily-tick` cron-job.
 *
 * Dekker:
 *   - Før runAtHour/runAtMinute → no-op waiting-note
 *   - Samme date-key to ganger → andre kall er no-op
 *   - Kaller service.accumulateDaily én gang per dag
 *   - Note inneholder updated/alreadyCurrent/capped-tall
 *   - 42P01 fra service → soft-no-op
 *   - alwaysRun=true overstyrer hour/date-key
 *   - Ikke-42P01 feil propageres
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createJackpotDailyTickJob } from "../jackpotDailyTick.js";
import type {
  AccumulateDailyResult,
  Game1JackpotStateService,
} from "../../game/Game1JackpotStateService.js";

interface Recorder {
  calls: number;
  behavior?: () => Promise<AccumulateDailyResult>;
}

function makeService(rec: Recorder): Game1JackpotStateService {
  return {
    accumulateDaily: async (): Promise<AccumulateDailyResult> => {
      rec.calls += 1;
      if (rec.behavior) return rec.behavior();
      return { updatedCount: 3, alreadyCurrentCount: 2, cappedCount: 1, errors: 0 };
    },
  } as unknown as Game1JackpotStateService;
}

// ── Guards ────────────────────────────────────────────────────────────────

// LOW-2-fix 2026-04-26: testene bruker eksplisitt UTC (Z-suffix) og
// regner i Oslo-tid. April 2026 er på sommer-tid (UTC+2), så
// 22:00 UTC = 00:00 Oslo neste dag.

test("jackpot-daily-tick: før runAtHour → waiting note, ingen kall", async () => {
  const rec: Recorder = { calls: 0 };
  const service = makeService(rec);
  const job = createJackpotDailyTickJob({
    service,
    runAtHourLocal: 0,
    runAtMinuteLocal: 15,
  });
  // 22:05 UTC = 00:05 Oslo (sommer) — før 00:15 Oslo.
  const tooEarly = new Date("2026-04-23T22:05:00Z").getTime();
  const result = await job(tooEarly);
  assert.equal(result.itemsProcessed, 0);
  assert.match(result.note ?? "", /waiting for 00:15/);
  assert.match(result.note ?? "", /Oslo/, "note refererer eksplisitt Oslo-tid");
  assert.equal(rec.calls, 0);
});

test("jackpot-daily-tick: samme date-key to ganger → andre kall er no-op", async () => {
  const rec: Recorder = { calls: 0 };
  const service = makeService(rec);
  const job = createJackpotDailyTickJob({
    service,
    runAtHourLocal: 0,
    runAtMinuteLocal: 15,
  });
  // 22:20 UTC = 00:20 Oslo (sommer, UTC+2). 22:25 UTC = 00:25 Oslo. Begge 24. april.
  const first = new Date("2026-04-23T22:20:00Z").getTime();
  const second = new Date("2026-04-23T22:25:00Z").getTime();

  const r1 = await job(first);
  assert.equal(rec.calls, 1, "første kall skal kjøre");
  assert.doesNotMatch(r1.note ?? "", /already ran today/);

  const r2 = await job(second);
  assert.equal(rec.calls, 1, "andre kall samme dag skal være no-op");
  assert.match(r2.note ?? "", /already ran today/);
});

test("jackpot-daily-tick: note inkluderer updated/alreadyCurrent/capped", async () => {
  const rec: Recorder = {
    calls: 0,
    behavior: async () => ({
      updatedCount: 5,
      alreadyCurrentCount: 2,
      cappedCount: 3,
      errors: 0,
    }),
  };
  const service = makeService(rec);
  const job = createJackpotDailyTickJob({
    service,
    runAtHourLocal: 0,
    runAtMinuteLocal: 0,
  });
  // 23:00 UTC = 01:00 Oslo (sommer) — etter konfigurert 00:00.
  const result = await job(new Date("2026-04-23T23:00:00Z").getTime());
  assert.equal(result.itemsProcessed, 5);
  assert.match(result.note ?? "", /updated=5/);
  assert.match(result.note ?? "", /alreadyCurrent=2/);
  assert.match(result.note ?? "", /capped=3/);
});

test("jackpot-daily-tick: alwaysRun overstyrer hour og date-key", async () => {
  const rec: Recorder = { calls: 0 };
  const service = makeService(rec);
  const job = createJackpotDailyTickJob({
    service,
    runAtHourLocal: 23,
    runAtMinuteLocal: 59,
    alwaysRun: true,
  });
  const morning = new Date("2026-04-24T06:00:00Z").getTime();
  await job(morning);
  await job(morning);
  assert.equal(rec.calls, 2, "alwaysRun skal ignorere date-key");
});

// ── Error handling ────────────────────────────────────────────────────────

test("jackpot-daily-tick: 42P01 fra service → soft no-op (migrasjon ikke kjørt)", async () => {
  const rec: Recorder = {
    calls: 0,
    behavior: async () => {
      const err = new Error("relation \"app_game1_jackpot_state\" does not exist") as Error & {
        code?: string;
      };
      err.code = "42P01";
      throw err;
    },
  };
  const service = makeService(rec);
  const job = createJackpotDailyTickJob({
    service,
    runAtHourLocal: 0,
    runAtMinuteLocal: 0,
    alwaysRun: true,
  });
  const result = await job(Date.now());
  assert.equal(result.itemsProcessed, 0);
  assert.match(result.note ?? "", /tabell mangler/i);
});

// ── LOW-2 Norge-tz-regression ────────────────────────────────────────────

test("jackpot-daily-tick: LOW-2 — sommer (UTC+2) — gater på Oslo-tid, ikke UTC", async () => {
  // I sommer-tid er 22:14 UTC = 00:14 Oslo, like før konfigurert 00:15.
  // Hvis cron-en gatet på UTC-tid ville den feilaktig vente til 22:15 UTC
  // (= 00:15 Oslo) med UTC-runAtHour=0 og dermed kjøre alt for tidlig den
  // dagen før (når 22:14 UTC i UTC-mente "natt til natten 23/24 april").
  const rec: Recorder = { calls: 0 };
  const service = makeService(rec);
  const job = createJackpotDailyTickJob({
    service,
    runAtHourLocal: 0,
    runAtMinuteLocal: 15,
  });
  const beforeOslo0015 = new Date("2026-04-23T22:14:00Z").getTime(); // 00:14 Oslo
  const r1 = await job(beforeOslo0015);
  assert.equal(rec.calls, 0, "før 00:15 Oslo skal cron-en vente");
  assert.match(r1.note ?? "", /waiting for 00:15 Oslo/);

  const atOslo0015 = new Date("2026-04-23T22:15:00Z").getTime(); // 00:15 Oslo
  const r2 = await job(atOslo0015);
  assert.equal(rec.calls, 1, "ved 00:15 Oslo skal cron-en kjøre");
  assert.doesNotMatch(r2.note ?? "", /waiting for/);
});

test("jackpot-daily-tick: LOW-2 — vinter (UTC+1) — gater fortsatt på Oslo-midnatt 00:15", async () => {
  // Vinter-tid: 23:14 UTC = 00:14 Oslo, like før konfigurert 00:15.
  const rec: Recorder = { calls: 0 };
  const service = makeService(rec);
  const job = createJackpotDailyTickJob({
    service,
    runAtHourLocal: 0,
    runAtMinuteLocal: 15,
  });
  const beforeOslo0015 = new Date("2026-01-15T23:14:00Z").getTime(); // 00:14 Oslo 16. jan
  const r1 = await job(beforeOslo0015);
  assert.equal(rec.calls, 0, "før 00:15 Oslo skal cron-en vente (vinter)");

  const atOslo0015 = new Date("2026-01-15T23:15:00Z").getTime(); // 00:15 Oslo 16. jan
  const r2 = await job(atOslo0015);
  assert.equal(rec.calls, 1, "ved 00:15 Oslo skal cron-en kjøre (vinter)");
});

test("jackpot-daily-tick: LOW-2 — runde over Norge-midnatt akkumulerer riktig dag", async () => {
  // Scenario fra LOW-2-bugbeskrivelsen:
  //   - Runde starter 23:55 Oslo (sommer) = 21:55 UTC
  //   - Runde slutter 00:05 Oslo neste dag (sommer) = 22:05 UTC
  //   - Cron-tick kl 00:15 Oslo = 22:15 UTC
  // Cron skal akkumulere som "neste dag" — dvs date-key 24. april,
  // ikke 23. april (den dagen runden teknisk startet i UTC).
  const rec: Recorder = { calls: 0 };
  const service = makeService(rec);
  const job = createJackpotDailyTickJob({
    service,
    runAtHourLocal: 0,
    runAtMinuteLocal: 15,
  });
  // Tick 1: 22:15 UTC = 00:15 Oslo 24. april
  await job(new Date("2026-04-23T22:15:00Z").getTime());
  // Tick 2: 22:30 UTC = 00:30 Oslo 24. april — samme Oslo-dag → no-op
  const r2 = await job(new Date("2026-04-23T22:30:00Z").getTime());
  assert.equal(rec.calls, 1);
  assert.match(r2.note ?? "", /already ran today/);

  // Tick 3: 22:30 UTC neste døgn = 00:30 Oslo 25. april → ny dag, kjør igjen
  const r3 = await job(new Date("2026-04-24T22:30:00Z").getTime());
  assert.equal(rec.calls, 2, "ny Oslo-dag → ny accumulate-runde");
  assert.doesNotMatch(r3.note ?? "", /already ran today/);
});

test("jackpot-daily-tick: ikke-42P01 feil propageres", async () => {
  const rec: Recorder = {
    calls: 0,
    behavior: async () => {
      throw new Error("catastrophic failure");
    },
  };
  const service = makeService(rec);
  const job = createJackpotDailyTickJob({
    service,
    runAtHourLocal: 0,
    runAtMinuteLocal: 0,
    alwaysRun: true,
  });
  await assert.rejects(() => job(Date.now()), /catastrophic failure/);
});
