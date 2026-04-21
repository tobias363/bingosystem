/**
 * PR B (variantConfig-admin-kobling): RoomStateManager.bindVariantConfigForRoom.
 *
 * Dekker:
 *   1. Uten gameManagementId → fallback til default (samme som
 *      bindDefaultVariantConfig).
 *   2. Med gameManagementId + fetch-hook som returnerer config.spill1 →
 *      mapperen kjører og patternsByColor er bundet.
 *   3. Fetcher returnerer null → fallback til default.
 *   4. Fetcher kaster → fallback til default, feil logges.
 *   5. Idempotent — andre kall er no-op hvis variant allerede er bundet.
 *   6. Ukjent gameSlug (ikke Spill 1) → fallback uten DB-lookup.
 *   7. extractSpill1Config: nested {spill1: {...}} vs direkte-shape.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { RoomStateManager } from "./roomState.js";
import {
  DEFAULT_NORSK_BINGO_CONFIG,
  PATTERNS_BY_COLOR_DEFAULT_KEY,
} from "../game/variantConfig.js";

function fresh(): RoomStateManager {
  return new RoomStateManager();
}

test("bindVariantConfigForRoom: uten gameManagementId → fallback (default-config)", async () => {
  const rs = fresh();
  await rs.bindVariantConfigForRoom("R1", { gameSlug: "bingo" });
  const info = rs.getVariantConfig("R1");
  assert.ok(info);
  // Default-pathen setter DEFAULT_NORSK_BINGO_CONFIG direkte — ingen patternsByColor.
  assert.strictEqual(info!.config, DEFAULT_NORSK_BINGO_CONFIG);
  assert.equal(info!.config.patternsByColor, undefined);
});

test("bindVariantConfigForRoom: med gameManagementId + spill1 → mapperen kjører + patternsByColor bundet", async () => {
  const rs = fresh();
  const fetchedConfig = {
    spill1: {
      ticketColors: [
        {
          color: "small_white",
          priceNok: 20,
          prizePerPattern: { row_1: { mode: "fixed", amount: 100 } },
        },
        {
          color: "small_yellow",
          priceNok: 15,
          prizePerPattern: { row_1: { mode: "fixed", amount: 50 } },
        },
      ],
    },
  };
  await rs.bindVariantConfigForRoom("R2", {
    gameSlug: "bingo",
    gameManagementId: "gm-1",
    fetchGameManagementConfig: async () => fetchedConfig,
  });
  const info = rs.getVariantConfig("R2");
  assert.ok(info);
  assert.ok(info!.config.patternsByColor, "patternsByColor skal være satt");
  assert.equal(info!.config.patternsByColor?.["Small White"]?.[0].prize1, 100);
  assert.equal(info!.config.patternsByColor?.["Small Yellow"]?.[0].prize1, 50);
  assert.ok(info!.config.patternsByColor?.[PATTERNS_BY_COLOR_DEFAULT_KEY]);
});

test("bindVariantConfigForRoom: fetcher returnerer null → fallback til default", async () => {
  const rs = fresh();
  await rs.bindVariantConfigForRoom("R3", {
    gameSlug: "bingo",
    gameManagementId: "gm-missing",
    fetchGameManagementConfig: async () => null,
  });
  const info = rs.getVariantConfig("R3");
  assert.ok(info);
  assert.strictEqual(info!.config, DEFAULT_NORSK_BINGO_CONFIG);
});

test("bindVariantConfigForRoom: fetcher kaster → fallback + ingen exception ut", async () => {
  const rs = fresh();
  await rs.bindVariantConfigForRoom("R4", {
    gameSlug: "bingo",
    gameManagementId: "gm-broken",
    fetchGameManagementConfig: async () => {
      throw new Error("DB connection lost");
    },
  });
  const info = rs.getVariantConfig("R4");
  assert.ok(info, "fallback må binde default selv om fetcher feiler");
  assert.strictEqual(info!.config, DEFAULT_NORSK_BINGO_CONFIG);
});

test("bindVariantConfigForRoom: idempotent — andre kall er no-op", async () => {
  const rs = fresh();
  await rs.bindVariantConfigForRoom("R5", { gameSlug: "bingo" });
  const first = rs.getVariantConfig("R5");
  await rs.bindVariantConfigForRoom("R5", {
    gameSlug: "bingo",
    gameManagementId: "gm-different",
    fetchGameManagementConfig: async () => ({
      spill1: {
        ticketColors: [{ color: "small_white", priceNok: 30 }],
      },
    }),
  });
  const second = rs.getVariantConfig("R5");
  // Andre kall skal ikke overstyre den første binding-en.
  assert.strictEqual(second!.config, first!.config);
});

test("bindVariantConfigForRoom: ikke-Spill-1 gameSlug → fallback uten DB-lookup", async () => {
  const rs = fresh();
  let fetcherCalled = false;
  await rs.bindVariantConfigForRoom("R6", {
    gameSlug: "monsterbingo",
    gameManagementId: "gm-1",
    fetchGameManagementConfig: async () => {
      fetcherCalled = true;
      return { spill1: { ticketColors: [] } };
    },
  });
  assert.equal(fetcherCalled, false, "fetcher skal ikke kalles for ikke-Spill-1");
  const info = rs.getVariantConfig("R6");
  assert.ok(info);
  assert.equal(info!.gameType, "monsterbingo");
});

test("bindVariantConfigForRoom: direkte-shape (uten spill1-wrapper) tolkes korrekt", async () => {
  const rs = fresh();
  await rs.bindVariantConfigForRoom("R7", {
    gameSlug: "bingo",
    gameManagementId: "gm-1",
    // Caller har allerede flatet ut config_json
    fetchGameManagementConfig: async () => ({
      ticketColors: [
        {
          color: "large_yellow",
          priceNok: 45,
          prizePerPattern: { full_house: { mode: "fixed", amount: 3000 } },
        },
      ],
    }),
  });
  const info = rs.getVariantConfig("R7");
  assert.ok(info);
  assert.equal(info!.config.patternsByColor?.["Large Yellow"]?.[4].prize1, 3000);
});

test("bindVariantConfigForRoom: spill1 mangler ticketColors → mapperen lager ren default-matrise", async () => {
  const rs = fresh();
  await rs.bindVariantConfigForRoom("R8", {
    gameSlug: "bingo",
    gameManagementId: "gm-empty",
    fetchGameManagementConfig: async () => ({
      spill1: { startTime: "18:00", ticketColors: [] },
    }),
  });
  const info = rs.getVariantConfig("R8");
  assert.ok(info);
  // Ingen farger → patternsByColor har bare __default__.
  const keys = Object.keys(info!.config.patternsByColor ?? {});
  assert.deepEqual(keys, [PATTERNS_BY_COLOR_DEFAULT_KEY]);
});

test("bindVariantConfigForRoom: gameManagementId satt men ingen fetcher → fallback", async () => {
  const rs = fresh();
  await rs.bindVariantConfigForRoom("R9", {
    gameSlug: "bingo",
    gameManagementId: "gm-no-hook",
    // Ingen fetchGameManagementConfig
  });
  const info = rs.getVariantConfig("R9");
  assert.strictEqual(info!.config, DEFAULT_NORSK_BINGO_CONFIG);
});
