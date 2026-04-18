/**
 * CalledNumbersOverlay colour-mapping tests (PR-5 C2 — Bingo75).
 *
 * Guards against regression to Databingo60 (5 × 12) ball-colour mapping.
 * Game 1 runs on the 75-ball bag (see apps/backend/src/util/roomState.ts:115)
 * so the overlay that displays drawn balls must use 5 × 15 column partition.
 *
 * The CSS string encodes the column palette via its gradient centre colour:
 *   #3a7adf (blue), #e84040 (red), #cc44cc (purple), #6ecf3a (green),
 *   #f0c020 (yellow). This mirrors BallTube.getBallColor so the two
 *   surfaces stay visually consistent.
 */
import { describe, it, expect } from "vitest";
import { getBallColorCSS } from "./CalledNumbersOverlay.js";

function colourOf(css: string): string {
  const m = css.match(/#([0-9a-f]{6})/i);
  return m ? m[1].toLowerCase() : "";
}

describe("CalledNumbersOverlay.getBallColorCSS — Bingo75 column partition", () => {
  it("column B (1-15) is blue #3a7adf", () => {
    expect(colourOf(getBallColorCSS(1))).toBe("3a7adf");
    expect(colourOf(getBallColorCSS(8))).toBe("3a7adf");
    expect(colourOf(getBallColorCSS(15))).toBe("3a7adf");
  });

  it("column I (16-30) is red #e84040", () => {
    expect(colourOf(getBallColorCSS(16))).toBe("e84040");
    expect(colourOf(getBallColorCSS(23))).toBe("e84040");
    expect(colourOf(getBallColorCSS(30))).toBe("e84040");
  });

  it("column N (31-45) is purple #cc44cc", () => {
    expect(colourOf(getBallColorCSS(31))).toBe("cc44cc");
    expect(colourOf(getBallColorCSS(38))).toBe("cc44cc");
    expect(colourOf(getBallColorCSS(45))).toBe("cc44cc");
  });

  it("column G (46-60) is green #6ecf3a", () => {
    expect(colourOf(getBallColorCSS(46))).toBe("6ecf3a");
    expect(colourOf(getBallColorCSS(53))).toBe("6ecf3a");
    expect(colourOf(getBallColorCSS(60))).toBe("6ecf3a");
  });

  it("column O (61-75) is yellow #f0c020", () => {
    expect(colourOf(getBallColorCSS(61))).toBe("f0c020");
    expect(colourOf(getBallColorCSS(68))).toBe("f0c020");
    expect(colourOf(getBallColorCSS(75))).toBe("f0c020");
  });

  it("column boundaries flip at 15/16, 30/31, 45/46, 60/61", () => {
    expect(colourOf(getBallColorCSS(15))).toBe("3a7adf");
    expect(colourOf(getBallColorCSS(16))).toBe("e84040");
    expect(colourOf(getBallColorCSS(30))).toBe("e84040");
    expect(colourOf(getBallColorCSS(31))).toBe("cc44cc");
    expect(colourOf(getBallColorCSS(45))).toBe("cc44cc");
    expect(colourOf(getBallColorCSS(46))).toBe("6ecf3a");
    expect(colourOf(getBallColorCSS(60))).toBe("6ecf3a");
    expect(colourOf(getBallColorCSS(61))).toBe("f0c020");
  });
});
