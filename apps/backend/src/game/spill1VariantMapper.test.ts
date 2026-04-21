/**
 * Unit-tester for spill1VariantMapper.
 *
 * Bruker node:test for å matche resten av backend. Dekker:
 *   - Fallback-atferd (null/undefined/tom input)
 *   - PR A-format (mode+amount) for fixed og percent
 *   - Legacy-number backward-compat
 *   - Manglende entries faller tilbake per-fase
 *   - Slug → TicketTypeConfig mapping
 *   - Defensive skip av ukjente slugs + deduplikering
 *   - Jackpot-mapping (maks-pris)
 *   - resolvePatternsForColor med default-fallback + warning-hook
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVariantConfigFromSpill1Config,
  resolvePatternsForColor,
  type Spill1ConfigInput,
} from "./spill1VariantMapper.js";
import {
  DEFAULT_NORSK_BINGO_CONFIG,
  PATTERNS_BY_COLOR_DEFAULT_KEY,
  type GameVariantConfig,
} from "./variantConfig.js";

// ── Fallback ────────────────────────────────────────────────────────────────

test("buildVariantConfigFromSpill1Config: undefined input → fallback med __default__", () => {
  const vc = buildVariantConfigFromSpill1Config(undefined);
  assert.deepEqual(vc.ticketTypes, DEFAULT_NORSK_BINGO_CONFIG.ticketTypes);
  assert.ok(vc.patternsByColor?.[PATTERNS_BY_COLOR_DEFAULT_KEY]);
  assert.deepEqual(
    vc.patternsByColor?.[PATTERNS_BY_COLOR_DEFAULT_KEY],
    DEFAULT_NORSK_BINGO_CONFIG.patterns,
  );
});

test("buildVariantConfigFromSpill1Config: null og tom config → fallback", () => {
  for (const input of [null, {} as Spill1ConfigInput]) {
    const vc = buildVariantConfigFromSpill1Config(input);
    assert.ok(vc.patternsByColor?.[PATTERNS_BY_COLOR_DEFAULT_KEY]);
    assert.ok(vc.ticketTypes.length > 0);
  }
});

// ── PR A-format ─────────────────────────────────────────────────────────────

test("PR A fixed-mode → winningType='fixed' + prize1", () => {
  const input: Spill1ConfigInput = {
    ticketColors: [
      {
        color: "small_white",
        priceNok: 20,
        prizePerPattern: {
          row_1: { mode: "fixed", amount: 100 },
          row_2: { mode: "fixed", amount: 200 },
          full_house: { mode: "fixed", amount: 1000 },
        },
      },
    ],
  };
  const vc = buildVariantConfigFromSpill1Config(input);
  const smallWhite = vc.patternsByColor?.["Small White"];
  assert.ok(smallWhite, "Small White matrise må finnes");
  assert.equal(smallWhite[0].name, "1 Rad");
  assert.equal(smallWhite[0].claimType, "LINE");
  assert.equal(smallWhite[0].winningType, "fixed");
  assert.equal(smallWhite[0].prize1, 100);
  assert.equal(smallWhite[0].prizePercent, 0);
  assert.equal(smallWhite[4].name, "Fullt Hus");
  assert.equal(smallWhite[4].claimType, "BINGO");
  assert.equal(smallWhite[4].winningType, "fixed");
  assert.equal(smallWhite[4].prize1, 1000);
});

test("PR A percent-mode → prizePercent (ingen winningType)", () => {
  const input: Spill1ConfigInput = {
    ticketColors: [
      {
        color: "small_yellow",
        priceNok: 15,
        prizePerPattern: {
          row_1: { mode: "percent", amount: 15 },
          full_house: { mode: "percent", amount: 40 },
        },
      },
    ],
  };
  const vc = buildVariantConfigFromSpill1Config(input);
  const yellow = vc.patternsByColor?.["Small Yellow"];
  assert.ok(yellow);
  assert.equal(yellow[0].name, "1 Rad");
  assert.equal(yellow[0].prizePercent, 15);
  assert.equal(yellow[0].winningType, undefined);
  assert.equal(yellow[4].prizePercent, 40);
});

test("per-farge matrise når flere farger konfigureres", () => {
  const input: Spill1ConfigInput = {
    ticketColors: [
      {
        color: "small_yellow",
        priceNok: 15,
        prizePerPattern: { row_1: { mode: "fixed", amount: 50 } },
      },
      {
        color: "small_white",
        priceNok: 20,
        prizePerPattern: { row_1: { mode: "fixed", amount: 100 } },
      },
    ],
  };
  const vc = buildVariantConfigFromSpill1Config(input);
  assert.equal(vc.patternsByColor?.["Small Yellow"]?.[0].prize1, 50);
  assert.equal(vc.patternsByColor?.["Small White"]?.[0].prize1, 100);
  assert.deepEqual(
    vc.patternsByColor?.[PATTERNS_BY_COLOR_DEFAULT_KEY],
    DEFAULT_NORSK_BINGO_CONFIG.patterns,
  );
});

// ── Legacy-number backward-compat ───────────────────────────────────────────

test("legacy plain number → percent-mode", () => {
  const input: Spill1ConfigInput = {
    ticketColors: [
      {
        color: "small_white",
        priceNok: 20,
        prizePerPattern: {
          row_1: 10 as unknown as number,
          full_house: 50 as unknown as number,
        },
      },
    ],
  };
  const vc = buildVariantConfigFromSpill1Config(input);
  const white = vc.patternsByColor?.["Small White"];
  assert.ok(white);
  assert.equal(white[0].prizePercent, 10);
  assert.equal(white[0].winningType, undefined);
  assert.equal(white[4].prizePercent, 50);
});

test("legacy NaN/negative number → fallback-fase", () => {
  const input: Spill1ConfigInput = {
    ticketColors: [
      {
        color: "small_white",
        priceNok: 20,
        prizePerPattern: {
          row_1: Number.NaN as unknown as number,
          row_2: -5 as unknown as number,
        },
      },
    ],
  };
  const vc = buildVariantConfigFromSpill1Config(input);
  const white = vc.patternsByColor?.["Small White"];
  assert.ok(white);
  // DEFAULT_NORSK_BINGO_CONFIG 1 Rad = fixed 100.
  assert.equal(white[0].prize1, 100);
  assert.equal(white[0].winningType, "fixed");
});

// ── Manglende entries ───────────────────────────────────────────────────────

test("manglende fase-entry bruker fallback for den fasen", () => {
  const input: Spill1ConfigInput = {
    ticketColors: [
      {
        color: "small_white",
        priceNok: 20,
        prizePerPattern: { row_1: { mode: "fixed", amount: 50 } },
      },
    ],
  };
  const vc = buildVariantConfigFromSpill1Config(input);
  const white = vc.patternsByColor?.["Small White"];
  assert.ok(white);
  assert.equal(white[0].prize1, 50);
  // row_2 fallback fra DEFAULT = fixed 200 kr.
  assert.equal(white[1].prize1, 200);
  assert.equal(white[1].winningType, "fixed");
  assert.equal(white[1].name, "2 Rader");
  assert.equal(white[4].prize1, 1000);
});

test("farge uten prizePerPattern bruker hele fallback-matrisen", () => {
  const input: Spill1ConfigInput = {
    ticketColors: [{ color: "small_purple", priceNok: 10 }],
  };
  const vc = buildVariantConfigFromSpill1Config(input);
  const purple = vc.patternsByColor?.["Small Purple"];
  assert.ok(purple);
  assert.equal(purple[0].name, "1 Rad");
  assert.equal(purple[0].prize1, 100);
  assert.equal(purple[0].winningType, "fixed");
  assert.equal(purple[4].name, "Fullt Hus");
  assert.equal(purple[4].prize1, 1000);
});

// ── Ticket-types ────────────────────────────────────────────────────────────

test("mapper small/large/elvis slug til riktig TicketTypeConfig", () => {
  const input: Spill1ConfigInput = {
    ticketColors: [
      { color: "small_yellow", priceNok: 15 },
      { color: "large_white", priceNok: 45 },
      { color: "elvis1", priceNok: 30 },
    ],
  };
  const vc = buildVariantConfigFromSpill1Config(input);
  assert.deepEqual(
    vc.ticketTypes.map((t) => t.name),
    ["Small Yellow", "Large White", "Elvis 1"],
  );
  const small = vc.ticketTypes.find((t) => t.name === "Small Yellow");
  const large = vc.ticketTypes.find((t) => t.name === "Large White");
  const elvis = vc.ticketTypes.find((t) => t.name === "Elvis 1");
  assert.equal(small?.type, "small");
  assert.equal(small?.priceMultiplier, 1);
  assert.equal(large?.type, "large");
  assert.equal(large?.priceMultiplier, 3);
  assert.equal(elvis?.type, "elvis");
  assert.equal(elvis?.priceMultiplier, 2);
});

test("hopper over ukjent farge-slug", () => {
  const input: Spill1ConfigInput = {
    ticketColors: [
      { color: "small_yellow", priceNok: 15 },
      { color: "mystery_color", priceNok: 99 },
    ],
  };
  const vc = buildVariantConfigFromSpill1Config(input);
  assert.deepEqual(vc.ticketTypes.map((t) => t.name), ["Small Yellow"]);
  assert.equal(vc.patternsByColor?.["mystery_color"], undefined);
});

test("dedupliserer duplikat-farger", () => {
  const input: Spill1ConfigInput = {
    ticketColors: [
      { color: "small_yellow", priceNok: 15 },
      { color: "small_yellow", priceNok: 25 },
    ],
  };
  const vc = buildVariantConfigFromSpill1Config(input);
  assert.equal(vc.ticketTypes.length, 1);
});

test("fallback-ticketTypes når ingen farger er valgt", () => {
  const vc = buildVariantConfigFromSpill1Config({ ticketColors: [] });
  assert.deepEqual(vc.ticketTypes, DEFAULT_NORSK_BINGO_CONFIG.ticketTypes);
});

// ── Jackpot ─────────────────────────────────────────────────────────────────

test("jackpot: per-farge-map → engine single-prize (maks)", () => {
  const input: Spill1ConfigInput = {
    ticketColors: [{ color: "small_white", priceNok: 20 }],
    jackpot: {
      draw: 55,
      prizeByColor: { small_white: 10000, small_yellow: 25000 },
    },
  };
  const vc = buildVariantConfigFromSpill1Config(input);
  assert.deepEqual(vc.jackpot, { drawThreshold: 55, prize: 25000, isDisplay: true });
});

test("jackpot: alle 0-priser → null (fallback)", () => {
  const input: Spill1ConfigInput = {
    ticketColors: [{ color: "small_white", priceNok: 20 }],
    jackpot: { draw: 55, prizeByColor: { small_white: 0 } },
  };
  const vc = buildVariantConfigFromSpill1Config(input);
  assert.equal(vc.jackpot, undefined);
});

// ── resolvePatternsForColor ────────────────────────────────────────────────

test("resolvePatternsForColor: returnerer farge-spesifikk matrise", () => {
  const vc = buildVariantConfigFromSpill1Config({
    ticketColors: [
      {
        color: "small_yellow",
        priceNok: 15,
        prizePerPattern: { row_1: { mode: "fixed", amount: 50 } },
      },
    ],
  });
  const patterns = resolvePatternsForColor(vc, "Small Yellow");
  assert.equal(patterns[0].prize1, 50);
});

test("resolvePatternsForColor: ukjent farge → __default__ uten warning", () => {
  const vc = buildVariantConfigFromSpill1Config({
    ticketColors: [
      {
        color: "small_yellow",
        priceNok: 15,
        prizePerPattern: { row_1: { mode: "fixed", amount: 50 } },
      },
    ],
  });
  let warnCalled = false;
  const patterns = resolvePatternsForColor(vc, "Small Purple", () => {
    warnCalled = true;
  });
  // __default__ = 100 kr 1 Rad.
  assert.equal(patterns[0].prize1, 100);
  // Fargen er IKKE i ticketTypes → ingen warning.
  assert.equal(warnCalled, false);
});

test("resolvePatternsForColor: warner når default brukes for farge i ticketTypes", () => {
  const vc = buildVariantConfigFromSpill1Config({
    ticketColors: [
      { color: "small_yellow", priceNok: 15 },
      { color: "small_white", priceNok: 20 },
    ],
  });
  // Slett en oppføring for å simulere konfig-gap.
  delete vc.patternsByColor?.["Small White"];
  let warnedColor: string | null = null;
  resolvePatternsForColor(vc, "Small White", (c) => {
    warnedColor = c;
  });
  assert.equal(warnedColor, "Small White");
});

test("resolvePatternsForColor: returnerer flat patterns[] når patternsByColor er undefined", () => {
  const vc: GameVariantConfig = {
    ticketTypes: DEFAULT_NORSK_BINGO_CONFIG.ticketTypes,
    patterns: DEFAULT_NORSK_BINGO_CONFIG.patterns,
  };
  const patterns = resolvePatternsForColor(vc, "Small White");
  assert.equal(patterns, vc.patterns);
});
