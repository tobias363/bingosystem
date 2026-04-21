/**
 * BIN-694: RoomStateManager.bindDefaultVariantConfig — wire-up helper.
 *
 * Root cause before the fix: `setVariantConfig` was only called from tests
 * (grep verified). Production rooms had `variantByRoom[code] === undefined`,
 * so `BingoEngine.meetsPhaseRequirement` received pattern names from the
 * legacy "standard" fallback config ("Row 1".."Row 4") that don't match the
 * Norsk 5-phase regex — every LINE phase fired on the first completed row.
 *
 * These tests cover the new helper:
 *   1. Default `gameSlug = "bingo"` → DEFAULT_NORSK_BINGO_CONFIG with the
 *      5-phase pattern names ("1 Rad", "2 Rader", "3 Rader", "4 Rader",
 *      "Fullt Hus") that `meetsPhaseRequirement` regexes match.
 *   2. `gameSlug = "monsterbingo"` → DEFAULT_GAME3_CONFIG.
 *   3. `gameSlug = "rocket"` / "tallspill" → DEFAULT_GAME2_CONFIG.
 *   4. Idempotent — second call with a different slug is a no-op (explicit
 *      admin-configured variants must win over defaults).
 *   5. Empty/whitespace `gameSlug` → defaults to "bingo".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { RoomStateManager } from "./roomState.js";
import {
  DEFAULT_NORSK_BINGO_CONFIG,
  DEFAULT_GAME2_CONFIG,
  DEFAULT_GAME3_CONFIG,
} from "../game/variantConfig.js";

function fresh(): RoomStateManager {
  return new RoomStateManager();
}

test("BIN-694: bindDefaultVariantConfig('bingo') wires DEFAULT_NORSK_BINGO_CONFIG with 5-phase pattern names", () => {
  const rs = fresh();
  rs.bindDefaultVariantConfig("BINGO1", "bingo");

  const info = rs.getVariantConfig("BINGO1");
  assert.ok(info, "variant config should be bound");
  assert.equal(info!.gameType, "bingo");
  assert.strictEqual(info!.config, DEFAULT_NORSK_BINGO_CONFIG);

  // The 5 phases MUST be named exactly so `meetsPhaseRequirement` regexes
  // (/^\s*1\s*rad\b/, /^\s*2\s*rad/, …) match. If these names drift, every
  // LINE phase falls back to the 1-line rule and triggers together.
  const patternNames = info!.config.patterns.map((p) => p.name);
  assert.deepEqual(patternNames, ["1 Rad", "2 Rader", "3 Rader", "4 Rader", "Fullt Hus"]);

  // autoClaimPhaseMode true means server evaluates phases after every draw
  // (the whole point of 5-phase Norsk bingo).
  assert.equal(info!.config.autoClaimPhaseMode, true);
  assert.equal(info!.config.patternEvalMode, "auto-claim-on-draw");
});

test("BIN-694: bindDefaultVariantConfig('monsterbingo') wires DEFAULT_GAME3_CONFIG", () => {
  const rs = fresh();
  rs.bindDefaultVariantConfig("G3-ROOM", "monsterbingo");

  const info = rs.getVariantConfig("G3-ROOM");
  assert.ok(info);
  assert.equal(info!.gameType, "monsterbingo");
  assert.strictEqual(info!.config, DEFAULT_GAME3_CONFIG);
});

test("BIN-694: bindDefaultVariantConfig('rocket') wires DEFAULT_GAME2_CONFIG", () => {
  const rs = fresh();
  rs.bindDefaultVariantConfig("G2-ROOM", "rocket");

  const info = rs.getVariantConfig("G2-ROOM");
  assert.ok(info);
  assert.equal(info!.gameType, "rocket");
  assert.strictEqual(info!.config, DEFAULT_GAME2_CONFIG);
});

test("BIN-694: bindDefaultVariantConfig is idempotent — does NOT overwrite explicit admin config", () => {
  const rs = fresh();
  // Simulate admin-configured variant (different from any default).
  const adminConfig = {
    ticketTypes: [{ name: "Custom", type: "custom", priceMultiplier: 2, ticketCount: 1 }],
    patterns: [{ name: "Custom Pattern", claimType: "BINGO" as const, prizePercent: 100, design: 0 }],
  };
  rs.setVariantConfig("ADMIN-ROOM", { gameType: "admin-variant", config: adminConfig });

  // Binding after admin config must be a no-op.
  rs.bindDefaultVariantConfig("ADMIN-ROOM", "bingo");

  const info = rs.getVariantConfig("ADMIN-ROOM");
  assert.ok(info);
  assert.equal(info!.gameType, "admin-variant", "admin-configured gameType must not be overwritten");
  assert.strictEqual(info!.config, adminConfig, "admin-configured config must be preserved");
});

test("BIN-694: bindDefaultVariantConfig with empty gameSlug defaults to 'bingo' (matches engine.createRoom fallback)", () => {
  const rs = fresh();
  rs.bindDefaultVariantConfig("R1", "");
  const info = rs.getVariantConfig("R1");
  assert.ok(info);
  assert.equal(info!.gameType, "bingo");
  assert.strictEqual(info!.config, DEFAULT_NORSK_BINGO_CONFIG);
});

test("BIN-694: bindDefaultVariantConfig with whitespace gameSlug defaults to 'bingo'", () => {
  const rs = fresh();
  rs.bindDefaultVariantConfig("R1", "   ");
  const info = rs.getVariantConfig("R1");
  assert.ok(info);
  assert.equal(info!.gameType, "bingo");
});

test("BIN-694: unknown gameSlug falls back to DEFAULT_STANDARD_CONFIG (legacy behaviour of getDefaultVariantConfig)", () => {
  const rs = fresh();
  // getDefaultVariantConfig returns DEFAULT_STANDARD_CONFIG for unknown slugs.
  rs.bindDefaultVariantConfig("LEGACY", "some-unknown-slug");
  const info = rs.getVariantConfig("LEGACY");
  assert.ok(info);
  assert.equal(info!.gameType, "some-unknown-slug");
  // Legacy "standard" uses "Row 1".."Row 4" + "Full House" names. These do
  // NOT match the Norsk regex — this is expected legacy behaviour for rooms
  // not tagged as bingo/norsk-bingo/game_1.
  assert.deepEqual(
    info!.config.patterns.map((p) => p.name),
    ["Row 1", "Row 2", "Row 3", "Row 4", "Full House"],
  );
});

test("BIN-694: two rooms with different slugs get different default configs", () => {
  const rs = fresh();
  rs.bindDefaultVariantConfig("G1", "bingo");
  rs.bindDefaultVariantConfig("G3", "monsterbingo");

  const g1 = rs.getVariantConfig("G1");
  const g3 = rs.getVariantConfig("G3");
  assert.ok(g1 && g3);
  assert.notStrictEqual(g1!.config, g3!.config);
  assert.strictEqual(g1!.config, DEFAULT_NORSK_BINGO_CONFIG);
  assert.strictEqual(g3!.config, DEFAULT_GAME3_CONFIG);
});
