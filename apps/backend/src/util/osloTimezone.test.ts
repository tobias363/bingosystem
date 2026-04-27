/**
 * LOW-2 Norge-tz-tester for osloTimezone-helpere.
 *
 * Kritiske scenarier:
 *   1) UTC-midnatt vs Norge-midnatt — runde over UTC-midnatt skal ikke
 *      flippe Oslo-dato hvis Oslo-dato fortsatt er forrige dag.
 *   2) DST sommer (UTC+2): UTC-midnatt = 02:00 Oslo, så et tidspunkt
 *      mellom 22:00 UTC og 22:00 UTC+1 dag etter er "samme Oslo-dag"
 *      hvis < 22:00 UTC, men "neste Oslo-dag" hvis ≥ 22:00 UTC.
 *   3) DST vinter (UTC+1): grensa går ved 23:00 UTC.
 *   4) Dato-grense-cross: yesterdayOsloKey skal aldri rulle baklengs over
 *      to dager, selv ved DST-overgang.
 *
 * Sommer-DST i Norge starter siste søndag i mars (kl 02:00 → 03:00) og
 * avsluttes siste søndag i oktober (kl 03:00 → 02:00). I 2026 betyr det:
 *   - Sommer-tid: 2026-03-29 02:00 → 03:00
 *   - Vinter-tid: 2026-10-25 03:00 → 02:00
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  formatOsloDateKey,
  nowOsloHourMinute,
  todayOsloKey,
  yesterdayOsloKey,
} from "./osloTimezone.js";

// ── Test 1: UTC-midnatt-Norge-tid (vinter) ─────────────────────────────────
test("todayOsloKey: vinter — runde mellom 22:30 UTC og 23:00 UTC er fortsatt forrige Oslo-dag", () => {
  // Vinter (UTC+1). 2026-01-15 22:30 UTC = 2026-01-15 23:30 Oslo.
  // 2026-01-15 23:00 UTC = 2026-01-16 00:00 Oslo.
  const beforeOsloMidnight = new Date("2026-01-15T22:30:00Z");
  const atOsloMidnight = new Date("2026-01-15T23:00:00Z");
  const afterOsloMidnight = new Date("2026-01-15T23:30:00Z");

  assert.equal(todayOsloKey(beforeOsloMidnight), "2026-01-15", "før Oslo-midnatt");
  assert.equal(todayOsloKey(atOsloMidnight), "2026-01-16", "ved Oslo-midnatt");
  assert.equal(todayOsloKey(afterOsloMidnight), "2026-01-16", "etter Oslo-midnatt");
});

test("todayOsloKey: vinter — runde over UTC-midnatt skal akkumulere riktig Oslo-dag", () => {
  // En spillerunde som kjører fra 23:55 Oslo til 00:15 Oslo (vinter):
  //   - Start: 2026-01-15 22:55 UTC = 2026-01-15 23:55 Oslo (mandag)
  //   - Slutt: 2026-01-15 23:15 UTC = 2026-01-16 00:15 Oslo (tirsdag)
  // Cron-tick som kjører kl 00:15 Oslo (= 23:15 UTC) skal akkumulere
  // som tirsdag, ikke som "samme UTC-dag som start".
  const cronTickAt = new Date("2026-01-15T23:15:00Z");
  assert.equal(
    todayOsloKey(cronTickAt),
    "2026-01-16",
    "cron-tick kl 00:15 Oslo gir riktig Oslo-dato (tirsdag)"
  );
});

// ── Test 2: DST sommer (UTC+2) ─────────────────────────────────────────────
test("todayOsloKey: sommer — Oslo-midnatt er 22:00 UTC", () => {
  // Sommer (UTC+2). 2026-07-15 21:30 UTC = 2026-07-15 23:30 Oslo.
  //                  2026-07-15 22:00 UTC = 2026-07-16 00:00 Oslo.
  const beforeOsloMidnight = new Date("2026-07-15T21:30:00Z");
  const atOsloMidnight = new Date("2026-07-15T22:00:00Z");
  const afterOsloMidnight = new Date("2026-07-15T22:30:00Z");

  assert.equal(todayOsloKey(beforeOsloMidnight), "2026-07-15");
  assert.equal(todayOsloKey(atOsloMidnight), "2026-07-16");
  assert.equal(todayOsloKey(afterOsloMidnight), "2026-07-16");
});

test("todayOsloKey: sommer — UTC-midnatt er 02:00 Oslo (samme dag)", () => {
  // 2026-07-16 00:00 UTC = 2026-07-16 02:00 Oslo. Allerede ny Oslo-dag.
  const utcMidnightSummer = new Date("2026-07-16T00:00:00Z");
  assert.equal(
    todayOsloKey(utcMidnightSummer),
    "2026-07-16",
    "UTC-midnatt sommer er allerede 02:00 Oslo neste dag"
  );
});

// ── Test 3: DST-overgang (vår + høst) ──────────────────────────────────────
test("todayOsloKey: DST-spring 2026-03-29 — vinter→sommer (kl 02:00 → 03:00 Oslo)", () => {
  // Like før spring-forward: 2026-03-29 00:30 UTC = 01:30 Oslo (vinter).
  // Like etter spring-forward: 2026-03-29 01:30 UTC = 03:30 Oslo (sommer).
  // Begge er samme Oslo-dato.
  const beforeSpring = new Date("2026-03-29T00:30:00Z");
  const afterSpring = new Date("2026-03-29T01:30:00Z");

  assert.equal(todayOsloKey(beforeSpring), "2026-03-29");
  assert.equal(todayOsloKey(afterSpring), "2026-03-29");
});

test("todayOsloKey: DST-fall 2026-10-25 — sommer→vinter (kl 03:00 → 02:00 Oslo)", () => {
  // 2026-10-24 23:30 UTC = 2026-10-25 01:30 Oslo (fortsatt sommer, UTC+2).
  // 2026-10-25 00:30 UTC = 2026-10-25 02:30 Oslo (etter fall-back, UTC+1).
  // Begge er 2026-10-25 i Oslo.
  const beforeFall = new Date("2026-10-24T23:30:00Z");
  const afterFall = new Date("2026-10-25T00:30:00Z");

  assert.equal(todayOsloKey(beforeFall), "2026-10-25");
  assert.equal(todayOsloKey(afterFall), "2026-10-25");
});

// ── Test 4: dato-grense-cross + yesterdayOsloKey ───────────────────────────
test("yesterdayOsloKey: standard tilfelle — Oslo-midnatt + 15 min returnerer riktig 'i går'", () => {
  // Sommer-cron-tick kl 00:15 Oslo = 22:15 UTC dagen før.
  const cronTickSummer = new Date("2026-07-16T22:15:00Z"); // = 00:15 Oslo 17. juli
  assert.equal(todayOsloKey(cronTickSummer), "2026-07-17", "cron i Oslo-tid er 17. juli");
  assert.equal(yesterdayOsloKey(cronTickSummer), "2026-07-16", "i går er 16. juli");
});

test("yesterdayOsloKey: DST-fall — i går = forrige kalenderdag, ikke 'samme dag'", () => {
  // 2026-10-26 00:15 Oslo (= 2026-10-25 23:15 UTC vinter) → i går = 2026-10-25.
  const cronTickAfterFall = new Date("2026-10-25T23:15:00Z");
  assert.equal(todayOsloKey(cronTickAfterFall), "2026-10-26");
  assert.equal(yesterdayOsloKey(cronTickAfterFall), "2026-10-25");
});

test("yesterdayOsloKey: måned-cross — 1. januar Oslo → i går = 31. desember", () => {
  // 2026-12-31 23:30 UTC = 2027-01-01 00:30 Oslo (vinter, UTC+1).
  const newYearOslo = new Date("2026-12-31T23:30:00Z");
  assert.equal(todayOsloKey(newYearOslo), "2027-01-01");
  assert.equal(yesterdayOsloKey(newYearOslo), "2026-12-31");
});

test("yesterdayOsloKey: skuddår-cross — 1. mars 2024 Oslo → i går = 29. feb", () => {
  // 2024 er skuddår. 2024-02-29 23:30 UTC = 2024-03-01 00:30 Oslo (vinter).
  const leapDayOslo = new Date("2024-02-29T23:30:00Z");
  assert.equal(todayOsloKey(leapDayOslo), "2024-03-01");
  assert.equal(yesterdayOsloKey(leapDayOslo), "2024-02-29");
});

// ── nowOsloHourMinute (cron-trigger-helper) ────────────────────────────────
test("nowOsloHourMinute: vinter — gir norsk-tid for cron-gating", () => {
  // 2026-01-15 23:15 UTC = 2026-01-16 00:15 Oslo (vinter, UTC+1).
  const at = new Date("2026-01-15T23:15:00Z");
  assert.deepEqual(nowOsloHourMinute(at), { hour: 0, minute: 15 });
});

test("nowOsloHourMinute: sommer — gir norsk-tid for cron-gating", () => {
  // 2026-07-15 22:14 UTC = 2026-07-16 00:14 Oslo (sommer, UTC+2).
  const at = new Date("2026-07-15T22:14:00Z");
  assert.deepEqual(nowOsloHourMinute(at), { hour: 0, minute: 14 });
});

// ── Format-konsistens-sanity ───────────────────────────────────────────────
test("formatOsloDateKey: returnerer alltid YYYY-MM-DD-format", () => {
  const samples = [
    new Date("2026-01-01T00:00:00Z"),
    new Date("2026-06-30T12:00:00Z"),
    new Date("2026-12-31T23:59:59Z"),
  ];
  for (const d of samples) {
    const key = formatOsloDateKey(d);
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/, `feil format: ${key}`);
  }
});
