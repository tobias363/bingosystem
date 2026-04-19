import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  JACKPOT_BUCKET_14_21,
  computeJackpotList,
  normalizeJackpotTable,
  resolveJackpotPrize,
} from "./Game2JackpotTable.js";

describe("normalizeJackpotTable", () => {
  test("returns empty table for null/undefined", () => {
    assert.deepEqual(normalizeJackpotTable(null), {});
    assert.deepEqual(normalizeJackpotTable(undefined), {});
  });

  test("unwraps legacy array-wrap form (createGame2JackpotDefinition)", () => {
    const raw = [{
      "9":    { price: 25000, isCash: true },
      "1421": { price: 5,     isCash: false },
    }];
    const norm = normalizeJackpotTable(raw);
    assert.deepEqual(norm["9"],   { price: 25000, isCash: true });
    assert.deepEqual(norm["1421"], { price: 5,    isCash: false });
  });

  test("accepts flat-object form", () => {
    const raw = { "9": { price: 25000, isCash: true } };
    assert.deepEqual(normalizeJackpotTable(raw), raw);
  });

  test("scalar values default to isCash: true", () => {
    const raw = { "9": 25000, "10": "15000" };
    const norm = normalizeJackpotTable(raw);
    assert.deepEqual(norm["9"],  { price: 25000, isCash: true });
    assert.deepEqual(norm["10"], { price: 15000, isCash: true });
  });

  test("isCash defaults to true when the field is missing or not false", () => {
    const raw = { "9": { price: 25000 }, "10": { price: 100, isCash: false } };
    const norm = normalizeJackpotTable(raw);
    assert.equal(norm["9"].isCash, true);
    assert.equal(norm["10"].isCash, false);
  });

  test("drops entries with non-numeric price", () => {
    const raw = { "9": { price: "abc", isCash: true }, "10": { price: 100, isCash: true } };
    const norm = normalizeJackpotTable(raw);
    assert.ok(!("9" in norm));
    assert.deepEqual(norm["10"], { price: 100, isCash: true });
  });
});

describe("computeJackpotList", () => {
  test("cash prizes pass through as round integers", () => {
    const list = computeJackpotList(
      { "9": { price: 25000.4, isCash: true } },
      100, 20,
    );
    assert.deepEqual(list, [{ number: "9", prize: 25000, type: "jackpot" }]);
  });

  test("percent prizes = price * tickets * ticketPrice / 100, rounded", () => {
    const list = computeJackpotList(
      { "1421": { price: 5, isCash: false } },
      100, 20, // pool = 2000; 5% = 100
    );
    assert.deepEqual(list, [{ number: "14-21", prize: 100, type: "gain" }]);
  });

  test("displays 1421 bucket as 14-21", () => {
    const list = computeJackpotList({ "1421": { price: 10, isCash: true } }, 0, 0);
    assert.equal(list[0].number, "14-21");
  });

  test("13 and 1421 are gain-type, others are jackpot-type", () => {
    const list = computeJackpotList(
      {
        "9":    { price: 25000, isCash: true },
        "10":   { price: 20000, isCash: true },
        "13":   { price: 1000,  isCash: true },
        "1421": { price: 5,     isCash: false },
      },
      50, 20,
    );
    const byNumber = new Map(list.map((e) => [e.number, e]));
    assert.equal(byNumber.get("9")?.type, "jackpot");
    assert.equal(byNumber.get("10")?.type, "jackpot");
    assert.equal(byNumber.get("13")?.type, "gain");
    assert.equal(byNumber.get("14-21")?.type, "gain");
  });

  test("handles legacy array-wrap input (normalizes before compute)", () => {
    const list = computeJackpotList(
      [{ "9": { price: 25000, isCash: true } }],
      100, 20,
    );
    assert.equal(list.length, 1);
    assert.equal(list[0].prize, 25000);
  });

  test("empty/invalid input produces empty list", () => {
    assert.deepEqual(computeJackpotList(null, 100, 20), []);
    assert.deepEqual(computeJackpotList({}, 100, 20), []);
  });
});

describe("resolveJackpotPrize", () => {
  const CASH_AND_PERCENT = {
    "9":    { price: 25000, isCash: true },
    "1421": { price: 5,     isCash: false },
  };

  test("draw 9 matches cash prize — split by winner count", () => {
    const out = resolveJackpotPrize(CASH_AND_PERCENT, 9, 1, 100, 20);
    assert.ok(out);
    assert.equal(out!.key, "9");
    assert.equal(out!.totalPrice, 25000);
    assert.equal(out!.pricePerWinner, 25000);
    assert.equal(out!.isCash, true);
  });

  test("multi-winner split rounds via Math.round", () => {
    const out = resolveJackpotPrize(CASH_AND_PERCENT, 9, 3, 100, 20);
    // 25000 / 3 = 8333.33... → Math.round → 8333
    assert.equal(out!.pricePerWinner, 8333);
  });

  test("draws 14..21 all resolve to the 1421 bucket", () => {
    for (let d = 14; d <= 21; d += 1) {
      const out = resolveJackpotPrize(CASH_AND_PERCENT, d, 1, 100, 20);
      assert.ok(out, `expected resolution at draw ${d}`);
      assert.equal(out!.key, JACKPOT_BUCKET_14_21);
      // percent: 5% × (100 × 20) = 100
      assert.equal(out!.totalPrice, 100);
      assert.equal(out!.isCash, false);
    }
  });

  test("draw 22 or beyond returns null (outside range)", () => {
    assert.equal(resolveJackpotPrize(CASH_AND_PERCENT, 22, 1, 100, 20), null);
    assert.equal(resolveJackpotPrize(CASH_AND_PERCENT, 30, 1, 100, 20), null);
  });

  test("draw below 9 returns null", () => {
    assert.equal(resolveJackpotPrize(CASH_AND_PERCENT, 8, 1, 100, 20), null);
    assert.equal(resolveJackpotPrize(CASH_AND_PERCENT, 0, 1, 100, 20), null);
  });

  test("draw hitting a bucket not in the table returns null", () => {
    const out = resolveJackpotPrize({ "9": { price: 100, isCash: true } }, 10, 1, 100, 20);
    assert.equal(out, null);
  });

  test("winnerCount < 1 returns null (avoid div-by-zero)", () => {
    assert.equal(resolveJackpotPrize(CASH_AND_PERCENT, 9, 0, 100, 20), null);
  });
});
