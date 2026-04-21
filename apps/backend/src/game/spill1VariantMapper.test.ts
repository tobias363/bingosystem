import { describe, it, expect } from "vitest";
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

describe("buildVariantConfigFromSpill1Config — fallback", () => {
  it("returnerer default-config med __default__-nøkkel når spill1 er undefined", () => {
    const vc = buildVariantConfigFromSpill1Config(undefined);
    expect(vc.ticketTypes).toEqual(DEFAULT_NORSK_BINGO_CONFIG.ticketTypes);
    expect(vc.patternsByColor?.[PATTERNS_BY_COLOR_DEFAULT_KEY]).toBeDefined();
    // __default__ = kopi av default-patterns.
    expect(vc.patternsByColor?.[PATTERNS_BY_COLOR_DEFAULT_KEY]).toEqual(
      DEFAULT_NORSK_BINGO_CONFIG.patterns,
    );
  });

  it("returnerer default når spill1 er null eller tom", () => {
    for (const input of [null, {} as Spill1ConfigInput]) {
      const vc = buildVariantConfigFromSpill1Config(input);
      expect(vc.patternsByColor?.[PATTERNS_BY_COLOR_DEFAULT_KEY]).toBeDefined();
      expect(vc.ticketTypes.length).toBeGreaterThan(0);
    }
  });
});

describe("buildVariantConfigFromSpill1Config — PR A-format (mode+amount)", () => {
  it("mapper fixed-mode per fase til winningType+prize1", () => {
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
    expect(smallWhite).toBeDefined();
    expect(smallWhite?.[0]).toMatchObject({
      name: "1 Rad",
      claimType: "LINE",
      winningType: "fixed",
      prize1: 100,
      prizePercent: 0,
    });
    expect(smallWhite?.[4]).toMatchObject({
      name: "Fullt Hus",
      claimType: "BINGO",
      winningType: "fixed",
      prize1: 1000,
    });
  });

  it("mapper percent-mode til prizePercent (ingen winningType)", () => {
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
    expect(yellow?.[0]).toMatchObject({
      name: "1 Rad",
      claimType: "LINE",
      prizePercent: 15,
    });
    expect(yellow?.[0].winningType).toBeUndefined();
    expect(yellow?.[4]).toMatchObject({
      name: "Fullt Hus",
      prizePercent: 40,
    });
  });

  it("bygger per-farge matrise når flere farger konfigureres", () => {
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
    expect(vc.patternsByColor?.["Small Yellow"]?.[0].prize1).toBe(50);
    expect(vc.patternsByColor?.["Small White"]?.[0].prize1).toBe(100);
    // __default__ er alltid tilgjengelig.
    expect(vc.patternsByColor?.[PATTERNS_BY_COLOR_DEFAULT_KEY]).toEqual(
      DEFAULT_NORSK_BINGO_CONFIG.patterns,
    );
  });
});

describe("buildVariantConfigFromSpill1Config — legacy-number backward-compat", () => {
  it("tolker plain number som percent-mode", () => {
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
    expect(white?.[0]).toMatchObject({
      name: "1 Rad",
      prizePercent: 10,
    });
    expect(white?.[0].winningType).toBeUndefined();
    expect(white?.[4]).toMatchObject({
      name: "Fullt Hus",
      prizePercent: 50,
    });
  });

  it("ignorerer NaN/negative number-verdier og bruker fallback-fase", () => {
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
    // Fallback = DEFAULT_NORSK_BINGO_CONFIG 1 Rad = fixed 100.
    expect(white?.[0].prize1).toBe(100);
    expect(white?.[0].winningType).toBe("fixed");
  });
});

describe("buildVariantConfigFromSpill1Config — missing entries fall back", () => {
  it("manglende fase-entry bruker fallback-matrise for den fasen", () => {
    const input: Spill1ConfigInput = {
      ticketColors: [
        {
          color: "small_white",
          priceNok: 20,
          // Bare row_1 satt — resten faller tilbake.
          prizePerPattern: { row_1: { mode: "fixed", amount: 50 } },
        },
      ],
    };
    const vc = buildVariantConfigFromSpill1Config(input);
    const white = vc.patternsByColor?.["Small White"];
    expect(white?.[0].prize1).toBe(50);
    // row_2 fallback fra default = fixed 200 kr.
    expect(white?.[1].prize1).toBe(200);
    expect(white?.[1].winningType).toBe("fixed");
    expect(white?.[1].name).toBe("2 Rader");
    // full_house fallback = fixed 1000 kr.
    expect(white?.[4].prize1).toBe(1000);
  });

  it("farge uten prizePerPattern bruker hele fallback-matrisen (navn tilpasset)", () => {
    const input: Spill1ConfigInput = {
      ticketColors: [{ color: "small_purple", priceNok: 10 }],
    };
    const vc = buildVariantConfigFromSpill1Config(input);
    const purple = vc.patternsByColor?.["Small Purple"];
    expect(purple).toBeDefined();
    expect(purple?.[0]).toMatchObject({
      name: "1 Rad",
      claimType: "LINE",
      prize1: 100,
      winningType: "fixed",
    });
    expect(purple?.[4]).toMatchObject({
      name: "Fullt Hus",
      claimType: "BINGO",
      prize1: 1000,
    });
  });
});

describe("buildVariantConfigFromSpill1Config — ticket-types", () => {
  it("mapper small/large/elvis slug til riktig type+multiplier", () => {
    const input: Spill1ConfigInput = {
      ticketColors: [
        { color: "small_yellow", priceNok: 15 },
        { color: "large_white", priceNok: 45 },
        { color: "elvis1", priceNok: 30 },
      ],
    };
    const vc = buildVariantConfigFromSpill1Config(input);
    const names = vc.ticketTypes.map((t) => t.name);
    expect(names).toEqual(["Small Yellow", "Large White", "Elvis 1"]);
    const small = vc.ticketTypes.find((t) => t.name === "Small Yellow");
    const large = vc.ticketTypes.find((t) => t.name === "Large White");
    const elvis = vc.ticketTypes.find((t) => t.name === "Elvis 1");
    expect(small).toMatchObject({ type: "small", priceMultiplier: 1, ticketCount: 1 });
    expect(large).toMatchObject({ type: "large", priceMultiplier: 3, ticketCount: 3 });
    expect(elvis).toMatchObject({ type: "elvis", priceMultiplier: 2, ticketCount: 2 });
  });

  it("hopper over ukjent farge-slug (defensive)", () => {
    const input: Spill1ConfigInput = {
      ticketColors: [
        { color: "small_yellow", priceNok: 15 },
        { color: "mystery_color", priceNok: 99 },
      ],
    };
    const vc = buildVariantConfigFromSpill1Config(input);
    expect(vc.ticketTypes.map((t) => t.name)).toEqual(["Small Yellow"]);
    expect(vc.patternsByColor?.["mystery_color"]).toBeUndefined();
  });

  it("dedupliserer duplikat-farger", () => {
    const input: Spill1ConfigInput = {
      ticketColors: [
        { color: "small_yellow", priceNok: 15 },
        { color: "small_yellow", priceNok: 25 },
      ],
    };
    const vc = buildVariantConfigFromSpill1Config(input);
    expect(vc.ticketTypes.length).toBe(1);
  });

  it("fallback-ticketTypes brukes hvis ingen farger er valgt", () => {
    const input: Spill1ConfigInput = { ticketColors: [] };
    const vc = buildVariantConfigFromSpill1Config(input);
    expect(vc.ticketTypes).toEqual(DEFAULT_NORSK_BINGO_CONFIG.ticketTypes);
  });
});

describe("buildVariantConfigFromSpill1Config — jackpot", () => {
  it("mapper per-farge-jackpot til engine-shape (maks-pris)", () => {
    const input: Spill1ConfigInput = {
      ticketColors: [{ color: "small_white", priceNok: 20 }],
      jackpot: {
        draw: 55,
        prizeByColor: { small_white: 10000, small_yellow: 25000 },
      },
    };
    const vc = buildVariantConfigFromSpill1Config(input);
    expect(vc.jackpot).toEqual({ drawThreshold: 55, prize: 25000, isDisplay: true });
  });

  it("null jackpot når ingen farge har pris > 0", () => {
    const input: Spill1ConfigInput = {
      ticketColors: [{ color: "small_white", priceNok: 20 }],
      jackpot: { draw: 55, prizeByColor: { small_white: 0 } },
    };
    const vc = buildVariantConfigFromSpill1Config(input);
    // Faller tilbake til fallback.jackpot — DEFAULT har ingen jackpot.
    expect(vc.jackpot).toBeUndefined();
  });
});

describe("resolvePatternsForColor", () => {
  function makeVC(): GameVariantConfig {
    return buildVariantConfigFromSpill1Config({
      ticketColors: [
        {
          color: "small_yellow",
          priceNok: 15,
          prizePerPattern: { row_1: { mode: "fixed", amount: 50 } },
        },
      ],
    });
  }

  it("returnerer farge-spesifikk matrise når fargen finnes", () => {
    const vc = makeVC();
    const patterns = resolvePatternsForColor(vc, "Small Yellow");
    expect(patterns[0].prize1).toBe(50);
  });

  it("fall tilbake til __default__ for ukjent farge (ingen warning)", () => {
    const vc = makeVC();
    let warnCalled = false;
    const patterns = resolvePatternsForColor(vc, "Small Purple", () => {
      warnCalled = true;
    });
    // __default__ = 100 kr 1 Rad.
    expect(patterns[0].prize1).toBe(100);
    // Fargen er ikke i ticketTypes → ingen warning forventet.
    expect(warnCalled).toBe(false);
  });

  it("varsler når default brukes for farge som FINNES i ticketTypes", () => {
    // Konfigurer to farger, men slett den ene fra patternsByColor for
    // å simulere konfig-gap. Må gjøres manuelt siden mapperen normalt
    // holder de to i synk.
    const vc = buildVariantConfigFromSpill1Config({
      ticketColors: [
        { color: "small_yellow", priceNok: 15 },
        { color: "small_white", priceNok: 20 },
      ],
    });
    // Fjern Small White fra patternsByColor så fallback slår inn.
    delete vc.patternsByColor?.["Small White"];

    let warnedColor: string | null = null;
    resolvePatternsForColor(vc, "Small White", (c) => {
      warnedColor = c;
    });
    expect(warnedColor).toBe("Small White");
  });

  it("returnerer flat patterns[] når patternsByColor er undefined", () => {
    const vc: GameVariantConfig = {
      ticketTypes: DEFAULT_NORSK_BINGO_CONFIG.ticketTypes,
      patterns: DEFAULT_NORSK_BINGO_CONFIG.patterns,
    };
    const patterns = resolvePatternsForColor(vc, "Small White");
    expect(patterns).toBe(vc.patterns);
  });
});
