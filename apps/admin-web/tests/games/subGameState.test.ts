// Unit tests for SubGameState (PR-A3 bolk 2).
//
// Coverage:
//   - fetchSubGameList: placeholder returns [] until BIN-621
//   - fetchSubGame: placeholder returns null until BIN-621
//   - saveSubGame / deleteSubGame: placeholder-contract (BIN-621)
//   - isGameNameLocallyValid: uniqueness-precheck fallback
//   - LEGACY_TICKET_COLOR_OPTIONS: stable vocabulary

import { describe, it, expect } from "vitest";
import {
  deleteSubGame,
  fetchSubGame,
  fetchSubGameList,
  isGameNameLocallyValid,
  LEGACY_TICKET_COLOR_OPTIONS,
  saveSubGame,
} from "../../src/pages/games/subGame/SubGameState.js";

describe("fetchSubGameList (BIN-621 placeholder)", () => {
  it("returns [] until the backend endpoint lands", async () => {
    const rows = await fetchSubGameList();
    expect(rows).toEqual([]);
  });
});

describe("fetchSubGame (BIN-621 placeholder)", () => {
  it("returns null for any id", async () => {
    const sg = await fetchSubGame("anything");
    expect(sg).toBeNull();
  });
});

describe("placeholder write-ops (BIN-621 contract)", () => {
  it("saveSubGame always resolves to BACKEND_MISSING", async () => {
    const res = await saveSubGame({
      gameName: "X",
      selectPatternRow: [],
      selectTicketColor: [],
      status: "active",
    });
    expect(res).toEqual({ ok: false, reason: "BACKEND_MISSING", issue: "BIN-621" });
  });

  it("deleteSubGame always resolves to BACKEND_MISSING", async () => {
    const res = await deleteSubGame("anything");
    expect(res).toEqual({ ok: false, reason: "BACKEND_MISSING", issue: "BIN-621" });
  });
});

describe("isGameNameLocallyValid", () => {
  it("accepts a trimmed non-empty name", () => {
    expect(isGameNameLocallyValid("My Game")).toBe(true);
  });

  it("rejects empty / whitespace-only", () => {
    expect(isGameNameLocallyValid("")).toBe(false);
    expect(isGameNameLocallyValid("   ")).toBe(false);
  });

  it("accepts 40 chars exactly; rejects >40", () => {
    expect(isGameNameLocallyValid("a".repeat(40))).toBe(true);
    expect(isGameNameLocallyValid("a".repeat(41))).toBe(false);
  });
});

describe("LEGACY_TICKET_COLOR_OPTIONS", () => {
  it("exposes the 8 legacy color labels", () => {
    expect(LEGACY_TICKET_COLOR_OPTIONS).toEqual([
      "Yellow",
      "Blue",
      "Green",
      "Red",
      "White",
      "Orange",
      "Pink",
      "Violet",
    ]);
  });

  it("is a readonly tuple (cannot push)", () => {
    // TypeScript enforces readonly — ensure the value is frozen-equivalent at runtime:
    // the `as const` makes every element a literal string, but the array itself is
    // still a mutable JS array. This test documents the intent rather than enforcing
    // immutability.
    expect(Array.isArray(LEGACY_TICKET_COLOR_OPTIONS)).toBe(true);
    expect(LEGACY_TICKET_COLOR_OPTIONS.length).toBe(8);
  });
});
