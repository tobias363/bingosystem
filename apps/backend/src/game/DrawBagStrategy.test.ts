import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  DRAW_BAG_DEFAULT_BINGO75,
  DRAW_BAG_DEFAULT_STANDARD,
  buildDrawBag,
  resolveDrawBagConfig,
} from "./DrawBagStrategy.js";
import type { GameVariantConfig } from "./variantConfig.js";

const EMPTY_CONFIG: GameVariantConfig = { ticketTypes: [], patterns: [] };

describe("resolveDrawBagConfig", () => {
  test("defaults to 60 for unknown slug without config", () => {
    assert.deepEqual(resolveDrawBagConfig(undefined, undefined), {
      maxBallValue: DRAW_BAG_DEFAULT_STANDARD,
      drawBagSize: DRAW_BAG_DEFAULT_STANDARD,
    });
  });

  test("falls back to 75 for bingo/game_1 slugs without explicit config", () => {
    assert.equal(resolveDrawBagConfig("bingo", EMPTY_CONFIG).maxBallValue, DRAW_BAG_DEFAULT_BINGO75);
    assert.equal(resolveDrawBagConfig("game_1", EMPTY_CONFIG).maxBallValue, DRAW_BAG_DEFAULT_BINGO75);
  });

  test("uses explicit maxBallValue from config (Game 2: 1..21)", () => {
    const cfg: GameVariantConfig = { ...EMPTY_CONFIG, maxBallValue: 21 };
    assert.deepEqual(resolveDrawBagConfig("rocket", cfg), {
      maxBallValue: 21,
      drawBagSize: 21,
    });
  });

  test("honours drawBagSize when smaller than maxBallValue", () => {
    const cfg: GameVariantConfig = { ...EMPTY_CONFIG, maxBallValue: 75, drawBagSize: 50 };
    assert.deepEqual(resolveDrawBagConfig("bingo", cfg), {
      maxBallValue: 75,
      drawBagSize: 50,
    });
  });

  test("clamps drawBagSize to maxBallValue", () => {
    const cfg: GameVariantConfig = { ...EMPTY_CONFIG, maxBallValue: 21, drawBagSize: 999 };
    assert.equal(resolveDrawBagConfig("rocket", cfg).drawBagSize, 21);
  });

  test("ignores invalid maxBallValue values", () => {
    const cfg: GameVariantConfig = { ...EMPTY_CONFIG, maxBallValue: 0 };
    assert.equal(resolveDrawBagConfig(undefined, cfg).maxBallValue, DRAW_BAG_DEFAULT_STANDARD);
  });
});

describe("buildDrawBag", () => {
  test("produces a bag of maxBallValue when drawBagSize matches", () => {
    const bag = buildDrawBag({ maxBallValue: 60, drawBagSize: 60 });
    assert.equal(bag.length, 60);
    assert.equal(new Set(bag).size, 60);
    assert.equal(Math.min(...bag), 1);
    assert.equal(Math.max(...bag), 60);
  });

  test("produces a 1..21 bag for Game 2 config", () => {
    const bag = buildDrawBag({ maxBallValue: 21, drawBagSize: 21 });
    assert.equal(bag.length, 21);
    assert.equal(new Set(bag).size, 21);
    assert.ok(bag.every((n) => n >= 1 && n <= 21));
  });

  test("produces a 1..75 bag for Bingo75 config", () => {
    const bag = buildDrawBag({ maxBallValue: 75, drawBagSize: 75 });
    assert.equal(bag.length, 75);
    assert.equal(new Set(bag).size, 75);
  });

  test("truncates when drawBagSize < maxBallValue", () => {
    const bag = buildDrawBag({ maxBallValue: 75, drawBagSize: 10 });
    assert.equal(bag.length, 10);
    assert.equal(new Set(bag).size, 10);
    assert.ok(bag.every((n) => n >= 1 && n <= 75));
  });

  test("uses the provided factory for determinism in tests", () => {
    const deterministic = (size: number) => Array.from({ length: size }, (_, i) => i + 1);
    const bag = buildDrawBag({ maxBallValue: 21, drawBagSize: 21 }, deterministic);
    assert.deepEqual(bag, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  });
});
