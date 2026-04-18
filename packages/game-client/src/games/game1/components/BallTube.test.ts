/**
 * BallTube colour-mapping tests (PR-5 C2 — Bingo75 column colours).
 *
 * Game 1 runs on the 75-ball bag — backend/src/util/roomState.ts:115 uses
 * generateBingo75Ticket for gameSlug "bingo". The tube's colour partition
 * must therefore be 5 columns × 15 balls (B/I/N/G/O), not 5 × 12 (Databingo60).
 *
 * Unity parity: Utility.GetGame1BallSprite (Utility.cs:183-195) keys on a
 * colour *string* from the server payload, but Spillorama doesn't emit
 * colour strings — BallTube derives colour from the ball number via the
 * canonical 75-ball column partition.
 */
import { describe, it, expect } from "vitest";
import { getBallColor } from "./BallTube.js";

// Palette (hex) — reused in CalledNumbersOverlay tests to keep the two
// surfaces visually consistent.
const BLUE_CENTER = 0x3a7adf;
const RED_CENTER = 0xe84040;
const PURPLE_CENTER = 0xcc44cc;
const GREEN_CENTER = 0x6ecf3a;
const YELLOW_CENTER = 0xf0c020;

describe("BallTube.getBallColor — Bingo75 column partition", () => {
  it("column B (1-15) is blue", () => {
    expect(getBallColor(1).center).toBe(BLUE_CENTER);
    expect(getBallColor(8).center).toBe(BLUE_CENTER);
    expect(getBallColor(15).center).toBe(BLUE_CENTER);
  });

  it("column I (16-30) is red", () => {
    expect(getBallColor(16).center).toBe(RED_CENTER);
    expect(getBallColor(23).center).toBe(RED_CENTER);
    expect(getBallColor(30).center).toBe(RED_CENTER);
  });

  it("column N (31-45) is purple", () => {
    expect(getBallColor(31).center).toBe(PURPLE_CENTER);
    expect(getBallColor(38).center).toBe(PURPLE_CENTER);
    expect(getBallColor(45).center).toBe(PURPLE_CENTER);
  });

  it("column G (46-60) is green", () => {
    expect(getBallColor(46).center).toBe(GREEN_CENTER);
    expect(getBallColor(53).center).toBe(GREEN_CENTER);
    expect(getBallColor(60).center).toBe(GREEN_CENTER);
  });

  it("column O (61-75) is yellow", () => {
    expect(getBallColor(61).center).toBe(YELLOW_CENTER);
    expect(getBallColor(68).center).toBe(YELLOW_CENTER);
    expect(getBallColor(75).center).toBe(YELLOW_CENTER);
  });

  it("column boundaries flip at 15/16, 30/31, 45/46, 60/61", () => {
    expect(getBallColor(15).center).toBe(BLUE_CENTER);
    expect(getBallColor(16).center).toBe(RED_CENTER);
    expect(getBallColor(30).center).toBe(RED_CENTER);
    expect(getBallColor(31).center).toBe(PURPLE_CENTER);
    expect(getBallColor(45).center).toBe(PURPLE_CENTER);
    expect(getBallColor(46).center).toBe(GREEN_CENTER);
    expect(getBallColor(60).center).toBe(GREEN_CENTER);
    expect(getBallColor(61).center).toBe(YELLOW_CENTER);
  });

  it("returns matching edge + glow triplet (not just center)", () => {
    const blue = getBallColor(1);
    expect(blue).toEqual({ center: 0x3a7adf, edge: 0x0d2f8a, glow: 0x2850dc });
    const yellow = getBallColor(75);
    expect(yellow).toEqual({ center: 0xf0c020, edge: 0x8a7000, glow: 0xc8a814 });
  });
});
