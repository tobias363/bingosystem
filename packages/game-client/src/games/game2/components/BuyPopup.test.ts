/**
 * BuyPopup phase-aware title tests (Tobias-direktiv 2026-05-04).
 *
 * Verifiserer at popup-tittelen reflekterer riktig kjøpsfase:
 *   - LOBBY/WAITING (forNextRound=false) → "Neste spill"
 *   - RUNNING (forNextRound=true)        → "Forhåndskjøp – neste runde"
 *
 * Speiler Spill 1's pattern hvor mid-round-kjøp er eksplisitt merket
 * som forhåndskjøp så spilleren forstår at den pågående trekningen
 * IKKE er en del av kjøpet.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Text } from "pixi.js";
import { BuyPopup } from "./BuyPopup.js";

describe("BuyPopup — phase-aware title (Tobias 2026-05-04)", () => {
  let popup: BuyPopup;

  beforeEach(() => {
    popup = new BuyPopup(320, 220);
  });

  afterEach(() => {
    popup.destroy({ children: true });
  });

  /**
   * Hent tittel-tekst fra popup. BuyPopup eksporterer ikke titleText
   * direkte — vi finner den ved å walke gjennom children. Den første
   * Text-noden under konstruktør-rekkefølgen er tittelen.
   */
  function getTitle(p: BuyPopup): string | null {
    for (const child of p.children) {
      if (child instanceof Text) return child.text;
    }
    return null;
  }

  it("default title er 'Neste spill' før show() kalles", () => {
    expect(getTitle(popup)).toBe("Neste spill");
  });

  it("show(price, max) uten forNextRound-flag → 'Neste spill' (LOBBY-modus)", () => {
    popup.show(20, 30);
    expect(getTitle(popup)).toBe("Neste spill");
    expect(popup.visible).toBe(true);
  });

  it("show(price, max, false) eksplisitt → 'Neste spill'", () => {
    popup.show(20, 30, false);
    expect(getTitle(popup)).toBe("Neste spill");
  });

  it("show(price, max, true) → 'Forhåndskjøp – neste runde' (RUNNING-modus)", () => {
    popup.show(20, 30, true);
    expect(getTitle(popup)).toBe("Forhåndskjøp – neste runde");
    expect(popup.visible).toBe(true);
  });

  it("tittel byttes korrekt mellom kall (RUNNING → LOBBY → RUNNING)", () => {
    popup.show(20, 30, true);
    expect(getTitle(popup)).toBe("Forhåndskjøp – neste runde");

    popup.show(20, 30, false);
    expect(getTitle(popup)).toBe("Neste spill");

    popup.show(20, 30, true);
    expect(getTitle(popup)).toBe("Forhåndskjøp – neste runde");
  });
});
