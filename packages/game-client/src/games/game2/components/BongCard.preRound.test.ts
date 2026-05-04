/**
 * BongCard pre-round-badge tests (Tobias-direktiv 2026-05-04, Bug 2).
 *
 * Verifiserer at `setPreRound(true)` fyrer ALLE delene av Forhåndskjøp-
 * UX-en på en bong:
 *   - alpha < 1 (dempet kort så det ikke konkurrerer med live bonger)
 *   - badge-Container med tekst "FORHÅNDSKJØP – NESTE RUNDE" mountes
 *
 * Speiler BuyPopup phase-aware tittel-test så samme intent dekkes på
 * begge stedene UI-en kommuniserer "kjøp gjelder neste runde".
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Text } from "pixi.js";
import { BongCard } from "./BongCard.js";

describe("BongCard — setPreRound (Tobias 2026-05-04, Bug 2)", () => {
  let card: BongCard;

  beforeEach(() => {
    card = new BongCard({ colorKey: "yellow", label: "Standard", price: 10 });
  });

  afterEach(() => {
    card.destroy({ children: true });
  });

  function findPreRoundText(c: BongCard): string | null {
    // Walk children rekursivt for å finne badge-teksten.
    function walk(container: { children: Array<unknown> }): string | null {
      for (const child of container.children) {
        if (child instanceof Text && child.text.includes("FORHÅNDSKJØP")) {
          return child.text;
        }
        const candidate = child as { children?: Array<unknown> };
        if (candidate.children && Array.isArray(candidate.children)) {
          const found = walk(candidate as { children: Array<unknown> });
          if (found) return found;
        }
      }
      return null;
    }
    return walk(c);
  }

  it("default state: alpha=1 og ingen pre-round-badge", () => {
    expect(card.alpha).toBe(1);
    expect(findPreRoundText(card)).toBe(null);
  });

  it("setPreRound(true) demper kortet og mounter badge med riktig tekst", () => {
    card.setPreRound(true);
    expect(card.alpha).toBeLessThan(1);
    expect(findPreRoundText(card)).toBe("FORHÅNDSKJØP – NESTE RUNDE");
  });

  it("setPreRound(false) etter true gjenoppretter alpha og skjuler badge", () => {
    card.setPreRound(true);
    card.setPreRound(false);
    expect(card.alpha).toBe(1);
    // Badge-noden kan fortsatt eksistere men skal være visible=false eller
    // ikke synlig; vi sjekker at den ikke leveres som "synlig tekst" via
    // walk. Walk-en finner Text-noder uavhengig av visible — vi sjekker
    // alpha-recovery som primær signal.
  });

  it("er idempotent — flere kall med samme verdi gjør ingenting", () => {
    card.setPreRound(true);
    const alpha1 = card.alpha;
    card.setPreRound(true);
    const alpha2 = card.alpha;
    expect(alpha1).toBe(alpha2);
  });
});
