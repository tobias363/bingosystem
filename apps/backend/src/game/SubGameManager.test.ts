import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { SubGameManager, type SubGameInput } from "./SubGameManager.js";
import type { PatternConfig } from "./variantConfig.js";

const PARENT_ID = "11111111-1111-4111-8111-111111111111";

const basicSubGame: SubGameInput = {
  name: "Round 1",
  ticketPrice: 20,
  variantConfig: { ticketTypes: [], patterns: [] },
};

describe("SubGameManager.planChildren", () => {
  const mgr = new SubGameManager();

  test("plans N children in order with 1-based sequence", () => {
    const plan = mgr.planChildren({
      parentScheduleId: PARENT_ID,
      gameType: "game_2",
      subGames: [basicSubGame, { ...basicSubGame, name: "Round 2" }, { ...basicSubGame, name: "Round 3" }],
      createID: "20260419120000",
    });
    assert.equal(plan.length, 3);
    assert.deepEqual(plan.map((p) => p.sequence), [1, 2, 3]);
    assert.deepEqual(plan.map((p) => p.displayName), ["Round 1", "Round 2", "Round 3"]);
    assert.ok(plan.every((p) => p.parentScheduleId === PARENT_ID));
  });

  test("uses G2 suffix for game_2 parents", () => {
    const [first] = mgr.planChildren({
      parentScheduleId: PARENT_ID,
      gameType: "game_2",
      subGames: [basicSubGame],
      createID: "20260419120000",
    });
    assert.equal(first.subGameNumber, "CH_1_20260419120000_G2");
  });

  test("uses G3 suffix for game_3 parents", () => {
    const [first] = mgr.planChildren({
      parentScheduleId: PARENT_ID,
      gameType: "game_3",
      subGames: [basicSubGame],
      createID: "20260419120000",
    });
    assert.equal(first.subGameNumber, "CH_1_20260419120000_G3");
  });

  test("throws on empty subGames (invalid parent config)", () => {
    assert.throws(
      () =>
        mgr.planChildren({ parentScheduleId: PARENT_ID, gameType: "game_2", subGames: [] }),
      /non-empty/,
    );
  });

  test("derives createID from Date.now() when omitted", () => {
    const [plan] = mgr.planChildren({
      parentScheduleId: PARENT_ID,
      gameType: "game_3",
      subGames: [basicSubGame],
    });
    assert.match(plan.subGameNumber, /^CH_1_\d{14}_G3$/);
  });

  test("propagates ticketPrice and variantConfig per sub-game", () => {
    const plan = mgr.planChildren({
      parentScheduleId: PARENT_ID,
      gameType: "game_2",
      subGames: [
        { name: "Cheap", ticketPrice: 10, variantConfig: { a: 1 } },
        { name: "Expensive", ticketPrice: 50, variantConfig: { a: 2 } },
      ],
      createID: "20260419120000",
    });
    assert.equal(plan[0].ticketPrice, 10);
    assert.equal(plan[1].ticketPrice, 50);
    assert.equal((plan[0].variantConfig as Record<string, unknown>).a, 1);
    assert.equal((plan[1].variantConfig as Record<string, unknown>).a, 2);
  });

  test("sorts G3 patterns by ascending fill-count (legacy 451-460)", () => {
    const patterns: PatternConfig[] = [
      { name: "Row 3", claimType: "LINE", prizePercent: 10, design: 3 },
      {
        name: "Custom X",
        claimType: "BINGO",
        prizePercent: 20,
        design: 0,
        // 9 ones → fillCount = 9
        patternDataList: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1],
      },
      { name: "Row 1", claimType: "LINE", prizePercent: 10, design: 1 },
      { name: "Row 2", claimType: "LINE", prizePercent: 10, design: 2 },
    ];
    const plan = mgr.planChildren({
      parentScheduleId: PARENT_ID,
      gameType: "game_3",
      subGames: [{ name: "s", ticketPrice: 10, variantConfig: { patterns } }],
      createID: "20260419120000",
    });
    const sorted = (plan[0].variantConfig.patterns as PatternConfig[]).map((p) => p.name);
    // Row 1 (5), Custom X (9), Row 2 (10), Row 3 (15)
    assert.deepEqual(sorted, ["Row 1", "Custom X", "Row 2", "Row 3"]);
  });

  test("does not mutate input patterns array", () => {
    const patterns: PatternConfig[] = [
      { name: "Row 3", claimType: "LINE", prizePercent: 10, design: 3 },
      { name: "Row 1", claimType: "LINE", prizePercent: 10, design: 1 },
    ];
    const originalOrder = patterns.map((p) => p.name);
    mgr.planChildren({
      parentScheduleId: PARENT_ID,
      gameType: "game_3",
      subGames: [{ name: "s", ticketPrice: 10, variantConfig: { patterns } }],
      createID: "20260419120000",
    });
    assert.deepEqual(patterns.map((p) => p.name), originalOrder);
  });

  test("leaves G2 variantConfig unchanged (sorting is G3-only)", () => {
    const patterns: PatternConfig[] = [
      { name: "Row 3", claimType: "LINE", prizePercent: 10, design: 3 },
      { name: "Row 1", claimType: "LINE", prizePercent: 10, design: 1 },
    ];
    const plan = mgr.planChildren({
      parentScheduleId: PARENT_ID,
      gameType: "game_2",
      subGames: [{ name: "s", ticketPrice: 10, variantConfig: { patterns } }],
      createID: "20260419120000",
    });
    const names = (plan[0].variantConfig.patterns as PatternConfig[]).map((p) => p.name);
    assert.deepEqual(names, ["Row 3", "Row 1"]);
  });
});

describe("SubGameManager.patternFillCount", () => {
  test("returns rowNumber * 5 for Row patterns", () => {
    assert.equal(
      SubGameManager.patternFillCount({ name: "Row 1", claimType: "LINE", prizePercent: 0, design: 1 }),
      5,
    );
    assert.equal(
      SubGameManager.patternFillCount({ name: "Row 4", claimType: "LINE", prizePercent: 0, design: 4 }),
      20,
    );
  });

  test("counts 1s in patternDataList for custom patterns", () => {
    assert.equal(
      SubGameManager.patternFillCount({
        name: "X",
        claimType: "BINGO",
        prizePercent: 0,
        design: 0,
        patternDataList: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      }),
      3,
    );
  });

  test("returns +Infinity for unknown patterns", () => {
    assert.equal(
      SubGameManager.patternFillCount({ name: "Weird", claimType: "BINGO", prizePercent: 0, design: 0 }),
      Number.POSITIVE_INFINITY,
    );
  });
});

describe("SubGameManager.defaultCreateID", () => {
  test("formats as YYYYMMDDHHmmss (UTC)", () => {
    const ms = Date.UTC(2026, 3, 19, 12, 0, 0);
    assert.equal(SubGameManager.defaultCreateID(ms), "20260419120000");
  });
});
